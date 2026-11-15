# Rummy10 v3 — setup and deployment guide

The app is a Next.js 15 project that runs entirely on **Vercel**: pages, API routes and the game engine. All data lives in **Postgres**, either your local server or **Supabase**. Live updates use **Supabase Realtime**. Without Realtime, the app falls back to polling, so it still works locally with plain Postgres.

```
Phone / browser ──HTTPS──► Vercel (Next.js pages + /api routes + game engine)
        ▲                          │ SQL (transaction pooler)
        │ "game changed" ping      ▼
        └──── Supabase Realtime ◄── Supabase Postgres
```

---

## 1. Local database (pgAdmin 4)

1. In pgAdmin, open **Servers → PostgreSQL 17 → Databases → phase10**. It must be empty.
2. **Tools → Query Tool** (not *Restore*: Restore only reads binary `pg_dump` files and fails with "input file does not appear to be a valid archive"), then the **Open File** icon. Choose `db/phase10_postgres_import.sql`.
3. Press **Execute (F5)**. You should see `COMMIT` at the end. Some "already exists, skipping" notices are normal.
4. Check it worked:
   ```sql
   select id, username, role, status from users order by id;   -- 8 players
   select count(*) from phases;                                -- 20
   ```
   Every player keeps their old password. Passwords are now stored as bcrypt hashes, never as plain text.

> **The import file contains real player data** (names, emails, phones), so it is git-ignored. To rebuild it from MySQL, run `python tools/build_pg_import.py` with XAMPP's MySQL running. To create a database with no personal data, run `db/schema.sql` instead.

## 2. Run the app locally

```bash
npm install
copy .env.example .env.local      # then edit it (see below)
npm run dev                        # http://localhost:3010
```

`.env.local`:
```
DATABASE_URL=postgres://postgres@localhost:5432/phase10
SESSION_SECRET=<64 random hex chars>   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
If your `postgres` user has a password, use `postgres://postgres:YOURPASSWORD@localhost:5432/phase10`.

Other useful commands:
- `npm test`: the engine tests (rules, turns, scoring, and bots playing full games)
- `npm run typecheck`
- `npm run build`

## 3. Supabase (database + realtime)

1. Create a project at supabase.com. Pick the region closest to your players, and save the database password.
2. **SQL Editor → New query**: paste the contents of `db/phase10_postgres_import.sql` (or `db/schema.sql` for an empty start) and **Run**.
3. **Database URL:** open your project and click the **Connect** button at the top of the page, next to the project name. In the dialog, choose **Transaction pooler** (port **6543**, labelled for serverless). Copy the URI and replace `[YOUR-PASSWORD]` with your database password. This is your production `DATABASE_URL`.
   *Older dashboards showed this under Project Settings → Database. Supabase has since moved it to **Connect**.*
4. **Keys:** go to **Project Settings → API Keys**. Copy the **Project URL** (also shown under Project Settings → Data API), the **publishable** key (or the legacy **anon** key) and the **secret** key (or the legacy **service_role** key). Either the new keys or the legacy ones work.
5. You don't need to enable anything for Realtime. The app uses *Broadcast* on public topics (`game-<id>`, `lobbies`), and those messages carry only a version number. Each player then fetches their own private view from the API.

Security notes:
- Every table has **row-level security on, with no policies**. The anon key can't read anything, so other players' hands are never exposed.
- Only the server, connecting through `DATABASE_URL`, can read or write the data.
- Keep the **service_role** key server-side only. Never put it in a `NEXT_PUBLIC_` variable.

Free-plan caveat: Supabase pauses a free project after about a week with no activity. Opening it from the dashboard wakes it up.

## 4. Vercel

1. Push this repo to GitHub (`spearpower/Phase10-React`).
2. At vercel.com, choose **Add New → Project → Import** this repo. The framework (Next.js) is detected automatically.
3. Under **Environment Variables**, add these for Production and Preview:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** URI (port 6543) |
| `SESSION_SECRET` | 64 random hex characters, different from your local one |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |

4. **Deploy**. The app is served over HTTPS, so it can be installed as a PWA ("Add to Home Screen" / "Install").
5. **Function region:** `vercel.json` pins the functions to `lhr1` (London), next to the Supabase project in `eu-west-2`. If you ever move the database to another region, change `regions` in `vercel.json` to the nearest Vercel region. The dashboard setting alone did not apply to new deployments.

## 5. Check after deploying
- [ ] Sign in with an existing account.
- [ ] Host a table on one phone and join it from a second phone using the **Invite** link.
- [ ] Moves appear on the other phone within a second. That confirms Realtime works; otherwise it falls back to a 4-second poll.
- [ ] A turn timer runs out and the turn is played automatically.
- [ ] Finish a game: the standings appear, **Scores** shows the points, and **Play Again** brings everyone back to the table.
- [ ] Install to the home screen and reopen. Turn on airplane mode: the "You're offline" screen appears.

## 6. Database updates (migrations)

New features sometimes need database changes. These live in `db/migrations/` and are numbered. Each one is safe to run more than once, and each one only adds things, so the live app keeps working while you apply it.

**Always run a new migration on Supabase *before* the code that needs it goes live.**

1. Supabase → **SQL Editor → New query** → paste the migration file → **Run**.
2. For your local database: pgAdmin → **Query Tool** → open the file → **Execute**.

| File | Adds |
|---|---|
| `001_virtual_friends_accounts.sql` | Virtual Friends (6 computer players), the `app_settings` table (admin switches), `users.is_bot` |
| `002_game_chat.sql` | `game_messages`: the table chat (public messages and emojis per game) |
| `003_manage_players.sql` | the `superadmin` role (given to `gero`), leaving or removing players with a reason, ending games with a reason (`ended` status) |
| `004_mvp_batch.sql` | admin password resets (`must_change_password`), `last_seen_at`, friends, table invites, phone-alert subscriptions |

To make someone an admin, run `update users set role = 'admin' where lower(username) = lower('their-name');`. The **Admin** link then appears on their Account page.

## 7. How a move works (for developers)
1. The client sends `POST /api/games/:id/move` with `{type: 'draw' | 'place' | 'unstage' | 'layDown' | 'hit' | 'discard' | 'skip' | 'timeout', ...}`.
2. The server opens a transaction, runs `SELECT … FOR UPDATE` on the game row, and applies `lib/engine.ts`, which validates the move.
3. It saves the state, bumps `version`, and sets the turn deadline.
4. It broadcasts `{v: version}` to `game-<id>`.
5. Every client re-fetches `GET /api/games/:id`, which returns only what that player may see.

**Turn timer:** the deadline is stored in `games.turn_deadline`. A player's device reports `timeout` when its countdown hits zero, and the server checks the clock before auto-playing. If nobody reports it, the next read of that game applies it. No always-on server is needed, which is why this fits Vercel.


## Settings added with the MVP batch (004)

Add these in Vercel → Project → Settings → Environment Variables (Production), then redeploy:

| Name | What it is |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phone alerts (Web Push). Free; the key pair is generated once (see `.env.example`). |
| `CRON_SECRET` | Protects the daily job `/api/cron/daily` (vercel.json `crons`, 03:00 UTC): keeps Supabase awake, closes stuck games, clears old invites. Vercel sends it automatically. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Voice chat (LiveKit Cloud, free Build plan with a hard cap). Voice stays off until an admin switches it on in Admin. |

Phone alerts on iPhone need iOS 16.4+ and Rummy10 added to the Home Screen.
