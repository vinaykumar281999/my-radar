#!/usr/bin/env bash
# schema.sql must stay safe to re-run on a database that already has data,
# including rows written before this branch's constraints existed.
set -euo pipefail
DB="$1"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

"${PSQL[@]}" <<'SQL'
select t.make_user('aaaaaaaa-0000-0000-0000-00000000000a', 'alice');
select t.make_user('bbbbbbbb-0000-0000-0000-00000000000b', 'bob');
insert into circles (id, owner_id, name) values ('c1c1c1c1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'College');
insert into circle_settings (circle_id, owner_id, preselect_for_new_plans) values ('c1c1c1c1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', true);
-- An invite from before the 90-day cap existed.
alter table circle_invites drop constraint circle_invites_expiry_cap;
insert into circle_invites (id, circle_id, created_at, expires_at)
  values ('11111111-0000-0000-0000-000000000001', 'c1c1c1c1-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 year');
insert into circle_invites (id, circle_id, revoked_at)
  values ('11111111-0000-0000-0000-000000000002', 'c1c1c1c1-0000-0000-0000-000000000001', now());
insert into plans (id, user_id, title, category, timeframe, capacity, dates_flexible)
  values ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Cabin', 'Trip', 'This Month', 1, true);
insert into interests (plan_id, visitor_name, contact_handle, user_id) values ('f1f1f1f1-0000-0000-0000-000000000001', 'Bob', '@bob', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into interests (plan_id, visitor_name, contact_handle) values ('f1f1f1f1-0000-0000-0000-000000000001', 'Anon', '@anon');
SQL

if ! out=$("${PSQL[@]}" -c "set client_min_messages = warning" -f "$ROOT/supabase/schema.sql" 2>&1); then
  echo "FAIL: schema.sql re-run on a database with data: $out"; exit 1
fi
echo "PASS  schema.sql re-runs on a database with data"

check() { # label, sql, expected
  local got; got=$("${PSQL[@]}" -Atc "$2")
  [ "$got" = "$3" ] || { echo "FAIL: $1 (expected '$3', got '$got')"; exit 1; }
  echo "PASS  $1"
}
check "over-cap invite clamped to created_at + 90 days" \
  "select expires_at = created_at + interval '90 days' from circle_invites where id = '11111111-0000-0000-0000-000000000001'" "t"
check "expiry cap constraint is back" \
  "select count(*) from pg_constraint where conname = 'circle_invites_expiry_cap'" "1"
check "revoked invite still revoked" \
  "select revoked_at is not null from circle_invites where id = '11111111-0000-0000-0000-000000000002'" "t"
check "circle settings kept" \
  "select preselect_for_new_plans from circle_settings" "t"
check "requests kept (both pending: nobody approved yet)" \
  "select string_agg(status, ',' order by status) from interests" "pending,pending"
check "dates_flexible kept" \
  "select dates_flexible from plans" "t"
