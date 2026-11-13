"""Builds db/phase10_postgres_import.sql = db/schema.sql + data migrated from the MySQL `phase10` database.

Usage:  python tools/build_pg_import.py
The output contains real player data (names, emails, phones) and is git-ignored.
Passwords are never copied in plain text: they are bcrypt-hashed by Postgres on import.
MySQL times were stored in Africa/Kampala time (+03:00).
"""
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MYSQL = r'C:\xampp\mysql\bin\mysql.exe'


def rows(sql):
	out = subprocess.run([MYSQL, '-uroot', '--batch', '--raw', '--skip-column-names', 'phase10', '-e', sql],
	                     capture_output=True, text=True, encoding='utf-8', check=True).stdout
	return [line.split('\t') for line in out.splitlines() if line]


def q(v):
	if v is None or v == '' or v == 'NULL':
		return 'null'
	return "'" + str(v).replace("'", "''") + "'"


def main():
	schema = open(os.path.join(ROOT, 'db', 'schema.sql'), encoding='utf-8').read()
	out = [schema, '\n-- =====================================================================',
	       '-- Data migrated from MySQL `phase10` (contains personal data — keep private)',
	       '-- =====================================================================', 'begin;']

	users = rows('select id, username, password, type, fullname, photo, email, phone, status, date from 2_users order by id')
	out.append('insert into public.users (id, username, password_hash, role, fullname, photo, email, phone, status, created_at) values')
	vals = []
	for uid, username, pw, typ, fullname, photo, email, phone, status, date in users:
		vals.append('\t({}, {}, public.app_hash_password({}), {}, {}, {}, {}, {}, {}, {})'.format(
			int(uid), q(username), q(pw), q('admin' if typ == '2' else 'player'), q(fullname),
			q(photo or 'na.png'), q(email), q(phone), q('active' if status == '1' else 'suspended'), q(date + '+03')))
	out.append(',\n'.join(vals) + '\non conflict (id) do nothing;')

	# Finished games referenced by leaderboard points (2022 history). Players ranked by points.
	pts = rows('select uid, gid, points, date from 5_game_points order by gid, points desc')
	games = {}
	for uid, gid, points, date in pts:
		games.setdefault(int(gid), []).append((int(uid), int(points), date))
	for gid, plist in games.items():
		host = plist[0][0]
		when = plist[0][2] + '+03'
		out.append("insert into public.games (id, host_id, edition, status, round, created_at, finished_at) values "
		           "({}, {}, 1, 'finished', 0, {}, {}) on conflict (id) do nothing;".format(gid, host, q(when), q(when)))
		for seat, (uid, points, date) in enumerate(plist, start=1):
			out.append("insert into public.game_players (game_id, user_id, seat, final_rank) values ({}, {}, {}, {}) on conflict do nothing;"
			           .format(gid, uid, seat, seat))
			out.append("insert into public.game_points (user_id, game_id, points, created_at) values ({}, {}, {}, {}) on conflict do nothing;"
			           .format(uid, gid, points, q(date + '+03')))

	out.append("select setval(pg_get_serial_sequence('public.users', 'id'), greatest((select max(id) from public.users), 1));")
	out.append("select setval(pg_get_serial_sequence('public.games', 'id'), greatest((select max(id) from public.games) + 1, 1002), false);")
	out.append('commit;\n')
	out.append("-- Check: select id, username, role, status from public.users order by id;")

	dest = os.path.join(ROOT, 'db', 'phase10_postgres_import.sql')
	with open(dest, 'w', encoding='utf-8', newline='\n') as f:
		f.write('\n'.join(out))
	print('wrote', dest, '-', len(users), 'users,', len(games), 'legacy games,', len(pts), 'point rows')


if __name__ == '__main__':
	main()
