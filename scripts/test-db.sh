#!/usr/bin/env bash
# Runs supabase/schema.sql and the tests in supabase/tests against a throwaway
# local Postgres with stand-ins for Supabase's roles and auth.uid().
#   npm run test:db                 all tests
#   npm run test:db -- circles      only tests whose file name contains "circles"
# Needs PostgreSQL 15+ server tools on PATH (macOS: brew install postgresql@15).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS="$ROOT/supabase/tests"
FILTER="${1:-}"

for bin in initdb pg_ctl psql createdb; do
  command -v "$bin" >/dev/null || { echo "Missing '$bin'. Install PostgreSQL 15+ (macOS: brew install postgresql@15)." >&2; exit 1; }
done

TMP="$(mktemp -d)"
PORT="${RADAR_TEST_PG_PORT:-54329}"
cleanup() {
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
# TCP only: the default socket path can exceed the OS limit inside temp dirs.
pg_ctl -D "$TMP/data" -w -l "$TMP/pg.log" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -f "$TESTS/_roles.sql"
createdb radar_template
"${PSQL[@]}" -d radar_template -f "$TESTS/_setup.sql"

apply_schema() {
  if ! "${PSQL[@]}" -d radar_template -c "set client_min_messages = warning" -f "$ROOT/supabase/schema.sql" >"$TMP/schema.log" 2>&1; then
    echo "schema.sql failed ($1):" >&2
    cat "$TMP/schema.log" >&2
    exit 1
  fi
  echo "ok    schema.sql ($1)"
}
apply_schema "fresh database"
apply_schema "re-run"
"${PSQL[@]}" -d radar_template -f "$TESTS/_after_schema.sql"

pass=0
fail=0
for file in "$TESTS"/*.test.sql "$TESTS"/*.test.sh; do
  [ -e "$file" ] || continue
  name="$(basename "$file")"
  [[ -n "$FILTER" && "$name" != *"$FILTER"* ]] && continue
  db="t_$(echo "${name%%.*}" | tr -c 'a-zA-Z0-9_\n' '_')"
  createdb -T radar_template "$db"
  if [[ "$file" == *.sql ]]; then
    run=("${PSQL[@]}" -d "$db" -f "$file")
  else
    run=(bash "$file" "$db")
  fi
  if out="$("${run[@]}" 2>&1)"; then
    pass=$((pass + 1))
    echo "ok    $name ($(grep -c 'PASS' <<<"$out") checks)"
  else
    fail=$((fail + 1))
    echo "FAIL  $name"
    grep -E "PASS|FAIL|ERROR" <<<"$out" | sed 's/^/        /' | tail -n 25
  fi
done

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
