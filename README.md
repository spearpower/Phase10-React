# Rummy10 (v3, React)

A real-time card game for 2–6 friends, built mobile-first as an installable PWA. Players race through 10 phases of sets, runs and colour groups.

- **Stack:** Next.js 15 (App Router) + TypeScript on Vercel, Postgres on Supabase (or local), Supabase Realtime Broadcast for live updates.
- **Game engine:** `lib/engine.ts` is pure and unit-tested. The server validates every move. Other players' hands never leave the server.
- **Sign-in:** username + password, stored as bcrypt hashes in Postgres. The session is a signed, httpOnly cookie.
- **Board:** tap a card, then tap where it goes (a group, a rival's laid-down group, or the discard pile). It's laid out with CSS for portrait and landscape phones.

| Path | What |
|---|---|
| `app/` | pages (Play, Sign in/up, Host, Join, Lobby, Game, Continue, Scores) and `app/api/*` routes |
| `lib/engine.ts`, `lib/rules.ts`, `lib/cards.ts`, `lib/card-codes.ts` | game rules, state machine, scoring |
| `lib/games.ts` | database transactions: lobby, start, move, timers, results |
| `lib/session.ts`, `lib/users.ts`, `middleware.ts` | sign-in and session |
| `db/schema.sql` | Postgres schema + rule data (no personal data) |
| `tools/build_pg_import.py` | builds `db/phase10_postgres_import.sql` from the old MySQL database |
| `public/` | original card art, avatars, icons, `sw.js`, `manifest.webmanifest`, `offline.html` |

Start with **[DEPLOYMENT.md](DEPLOYMENT.md)**: it covers importing the database in pgAdmin, local setup, Supabase and Vercel.

The previous PHP/Node/MySQL version lives in the `spearpower/Phase10` repo (tag `v2.0.0-mysql`).
