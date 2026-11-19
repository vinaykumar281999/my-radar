#!/usr/bin/env bash
# Waitlist promotion under real concurrency (two sessions, like 07):
# 1. Two simultaneous declines can't promote past capacity.
# 2. A promotion running alongside approve_spot can't overbook (either order).
# Session 1 holds its transaction open; session 2 must wait on the plan row lock.
set -euo pipefail
DB="$1"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
OWNER="aaaaaaaa-0000-0000-0000-00000000000a"
as_owner="set role authenticated; select t.as_user('$OWNER');"

# Plan with capacity $2, $3 approved requests (a..), then $4 waitlisted (w..), oldest first.
setup() {
  local plan="$1" cap="$2" approved="$3" waiting="$4"
  "${PSQL[@]}" -v plan="$plan" -v cap="$cap" -v n="$approved" -v w="$waiting" -v owner="'$OWNER'" <<'SQL'
insert into plans (id, user_id, title, category, timeframe, capacity) values (:'plan', :owner, 'Race', 'Trip', 'This Month', :cap);
insert into interests (id, plan_id, visitor_name, contact_handle, created_at)
  select ('a' || lpad(g::text, 7, '0') || substr(:'plan', 9))::uuid, :'plan', 'A' || g, '@a' || g || substr(:'plan', 1, 4), now() - interval '1 hour' + g * interval '1 second'
    from generate_series(1, :n) g;
set role authenticated; select t.as_user(:owner);
select approve_spot(id) from interests where plan_id = :'plan' order by created_at;
reset role;
insert into interests (id, plan_id, visitor_name, contact_handle, created_at)
  select ('b' || lpad(g::text, 7, '0') || substr(:'plan', 9))::uuid, :'plan', 'W' || g, '@w' || g || substr(:'plan', 1, 4), now() - interval '30 min' + g * interval '1 second'
    from generate_series(1, :w) g;
SQL
}
id() { echo "$1$(printf '%07d' "$2")${3:8}"; }  # id a|b <n> <plan>
count() { "${PSQL[@]}" -Atc "select count(*) from interests where plan_id = '$1' and status = '$2'"; }

# Runs SQL $2 in session 1 (held open 2s) and SQL $3 in session 2 meanwhile. Sets $waited.
race() {
  "${PSQL[@]}" -c "$as_owner" -c "begin; $1; select pg_sleep(2); commit;" >/dev/null 2>&1 &
  local s1=$!
  sleep 0.5
  local start; start=$(date +%s)
  out2=$("${PSQL[@]}" -c "$as_owner" -c "$2" 2>&1) || true
  waited=$(( $(date +%s) - start ))
  wait $s1
}

"${PSQL[@]}" -c "select t.make_user('$OWNER', 'alice');" >/dev/null

# ---- 1. Two simultaneous declines: capacity 2, 2 approved, 3 waiting ----
P1="f1f1f1f1-0000-0000-0000-000000000001"
setup "$P1" 2 2 3
race "select decline_spot('$(id a 1 $P1)')" "select decline_spot('$(id a 2 $P1)');"
[ "$waited" -ge 1 ] || { echo "FAIL: second decline didn't wait for the first's lock"; exit 1; }
echo "PASS  second decline waited for the plan row lock (~${waited}s)"
approved=$(count "$P1" approved); pending=$(count "$P1" pending); waiting=$(count "$P1" waitlisted)
[ $((approved + pending)) -le 2 ] || { echo "FAIL: approved $approved + pending $pending exceeds capacity 2"; exit 1; }
echo "PASS  two declines promoted only up to capacity (approved $approved + pending $pending <= 2)"
[ "$pending" = "2" ] && [ "$waiting" = "1" ] || { echo "FAIL: expected 2 promoted, 1 still waiting; got pending $pending, waiting $waiting"; exit 1; }
first=$("${PSQL[@]}" -Atc "select string_agg(visitor_name, ',' order by created_at) from interests where plan_id = '$P1' and status = 'pending'")
[ "$first" = "W1,W2" ] || { echo "FAIL: promoted out of order: $first"; exit 1; }
echo "PASS  promoted in line order (W1, W2); W3 still waiting"

# ---- 2a. Promotion holds the lock, approve_spot runs meanwhile ----
# Capacity 2, 2 approved, 2 waiting. Decline A1 (promotes W1) while approving W2 directly.
P2="f2f2f2f2-0000-0000-0000-000000000002"
setup "$P2" 2 2 2
race "select decline_spot('$(id a 1 $P2)')" "select approve_spot('$(id b 2 $P2)');"
[ "$waited" -ge 1 ] || { echo "FAIL: approve_spot didn't wait for the promotion's lock"; exit 1; }
approved=$(count "$P2" approved)
[ "$approved" -le 2 ] || { echo "FAIL: $approved approved for 2 spots"; exit 1; }
echo "PASS  promotion + concurrent approve_spot: $approved approved for 2 spots (waited ~${waited}s)"

# ---- 2b. approve_spot holds the lock, a decline (and its promotion) runs meanwhile ----
# Capacity 2, 2 approved, 2 waiting. Declining A1 first promotes W1 (pending),
# leaving: A2 approved, W1 pending, W2 waiting. Then approve W1 in session 1
# while session 2 declines A2, whose promotion must count W1 as approved.
P3="f3f3f3f3-0000-0000-0000-000000000003"
setup "$P3" 2 2 2
"${PSQL[@]}" -c "$as_owner" -c "select decline_spot('$(id a 1 $P3)');" >/dev/null
[ "$(count "$P3" pending)" = "1" ] && [ "$(count "$P3" waitlisted)" = "1" ] || { echo "FAIL: 2b setup"; exit 1; }
race "select approve_spot('$(id b 1 $P3)')" "select decline_spot('$(id a 2 $P3)');"
[ "$waited" -ge 1 ] || { echo "FAIL: decline didn't wait for approve_spot's lock"; exit 1; }
approved=$(count "$P3" approved); pending=$(count "$P3" pending); waiting=$(count "$P3" waitlisted)
[ "$approved" -le 2 ] || { echo "FAIL: $approved approved for 2 spots"; exit 1; }
[ $((approved + pending)) -le 2 ] || { echo "FAIL: promotion overfilled: approved $approved + pending $pending > 2"; exit 1; }
[ "$approved" = "1" ] && [ "$pending" = "1" ] && [ "$waiting" = "0" ] || { echo "FAIL: expected W1 approved, W2 promoted; got approved $approved, pending $pending, waiting $waiting"; exit 1; }
echo "PASS  approve_spot + concurrent decline/promotion: W1 approved, W2 promoted, never over capacity (waited ~${waited}s)"
