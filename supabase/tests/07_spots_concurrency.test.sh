#!/usr/bin/env bash
# Two owners' sessions approve the last spot at the same time: exactly one wins.
# Session 1 approves and holds its transaction open; session 2 starts meanwhile
# and must wait on the plan row lock, then see the spot taken.
set -euo pipefail
DB="$1"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

"${PSQL[@]}" <<'SQL'
select t.make_user('aaaaaaaa-0000-0000-0000-00000000000a', 'alice');
insert into plans (id, user_id, title, category, timeframe, capacity)
  values ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Last seat', 'Trip', 'This Month', 1);
insert into interests (id, plan_id, visitor_name, contact_handle) values
  ('a1000000-0000-0000-0000-000000000001', 'f1f1f1f1-0000-0000-0000-000000000001', 'R1', '@r1'),
  ('a1000000-0000-0000-0000-000000000002', 'f1f1f1f1-0000-0000-0000-000000000001', 'R2', '@r2');
SQL

as_owner="set role authenticated; select t.as_user('aaaaaaaa-0000-0000-0000-00000000000a');"

# Session 1: approve R1, keep the transaction open for 2s.
"${PSQL[@]}" -c "$as_owner" -c "begin; select approve_spot('a1000000-0000-0000-0000-000000000001'); select pg_sleep(2); commit;" \
  >/dev/null 2>&1 &
s1=$!
sleep 0.5

# Session 2: approve R2 while session 1 still holds the lock.
start=$(date +%s)
if out2=$("${PSQL[@]}" -c "$as_owner" -c "select approve_spot('a1000000-0000-0000-0000-000000000002');" 2>&1); then
  echo "FAIL: second concurrent approval succeeded: $out2"
  wait $s1
  exit 1
fi
waited=$(( $(date +%s) - start ))
wait $s1

grep -q "plan_full" <<<"$out2" || { echo "FAIL: expected plan_full, got: $out2"; exit 1; }
echo "PASS  second approval waited for the lock (~${waited}s) and was refused with plan_full"

approved=$("${PSQL[@]}" -Atc "select count(*) from interests where status = 'approved'")
[ "$approved" = "1" ] || { echo "FAIL: $approved approved for 1 spot"; exit 1; }
echo "PASS  exactly 1 approved for 1 spot"

[ "$waited" -ge 1 ] || { echo "FAIL: session 2 didn't wait for session 1's lock"; exit 1; }
echo "PASS  approvals were serialized by the plan row lock"
