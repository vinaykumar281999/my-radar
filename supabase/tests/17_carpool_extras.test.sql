-- Carpool long-trip details: round trip + return, gas split, stops. Carpools
-- only, sensible ranges, and visible exactly where the plan is.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set PUB '''f1f1f1f1-0000-0000-0000-000000000001'''
\set PC '''f2f2f2f2-0000-0000-0000-000000000002'''
\set TRIP '''f3f3f3f3-0000-0000-0000-000000000003'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
select t.make_user(:A, 'alice');
select t.make_user(:B, 'bob');
select t.make_user(:F, 'frank');
insert into circles (id, owner_id, name) values (:COLLEGE, :A, 'College');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B);

set role authenticated; select t.as_user(:A);
insert into plans (id, user_id, title, category, timeframe, capacity, origin, destination, departs_at, departs_tz,
                   round_trip, returns_at, gas_split, gas_currency, stops)
  values (:PUB, :A, 'Ski ride', 'Carpool', 'This Month', 3, 'Denver', 'Vail', '2026-12-04 07:00:00-07', 'America/Denver',
          true, '2026-12-06 16:00:00-07', 40, 'USD', 'Can pick up in Golden');
select t.eq((select round_trip::text || ' ' || gas_split::text || ' ' || gas_currency || ' ' || stops from plans where id = :PUB),
  'true 40.00 USD Can pick up in Golden', 'a carpool stores its long-trip details');
insert into plans (id, user_id, title, category, timeframe, capacity, origin, destination, departs_at, departs_tz, visibility, gas_split, gas_currency, stops)
  values (:PC, :A, 'Secret ride', 'Carpool', 'This Month', 2, 'Boulder', 'Moab', '2026-12-11 06:00:00-07', 'America/Denver', 'circles', 25.5, 'USD', 'Grand Junction');
insert into plan_audiences values (:PC, :A, :COLLEGE);
insert into plans (id, user_id, title, category, timeframe) values (:TRIP, :A, 'Trip', 'Trip', 'This Month');

-- ===== Carpools only =====
select t.throws($$update plans set round_trip = true where id = 'f3f3f3f3-0000-0000-0000-000000000003'$$, 'plans_carpool_extras_only', 'a trip can''t be a round trip');
select t.throws($$update plans set gas_split = 10, gas_currency = 'USD' where id = 'f3f3f3f3-0000-0000-0000-000000000003'$$, 'plans_carpool_extras_only', '...or have a gas split');
select t.throws($$update plans set stops = 'Somewhere' where id = 'f3f3f3f3-0000-0000-0000-000000000003'$$, 'plans_carpool_extras_only', '...or stops');
select t.throws($$update plans set category = 'Trip', capacity = null, origin = null, destination = null, departs_at = null, departs_tz = null where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$,
  'plans_carpool_extras_only', 'a carpool can''t become a trip while it still has carpool details');

-- ===== Return after departure =====
select t.throws($$update plans set returns_at = '2026-12-04 06:00:00-07' where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_return_after_departure', 'the return can''t be before the departure');
select t.throws($$update plans set returns_at = departs_at where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_return_after_departure', '...or at the same moment');
select t.throws($$update plans set round_trip = false where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_return_after_departure', 'a return time needs a round trip');
update plans set round_trip = true, returns_at = null where id = :PC;
select t.eq((select round_trip from plans where id = :PC), true, 'a round trip may leave the return time open');
update plans set round_trip = false where id = :PC;

-- ===== Gas split 0–1000 with a currency; stops up to 120 characters =====
select t.throws($$update plans set gas_split = -1 where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_gas_split_range', 'gas can''t be negative');
select t.throws($$update plans set gas_split = 1000.01 where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_gas_split_range', '...or over 1000');
update plans set gas_split = 0 where id = :PUB;
update plans set gas_split = 1000 where id = :PUB;
select t.eq((select gas_split::text from plans where id = :PUB), '1000.00', '0 and 1000 are both fine');
select t.throws($$update plans set gas_currency = null where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_gas_currency', 'an amount needs a currency');
select t.throws($$update plans set gas_currency = 'dollars' where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_gas_currency', 'a currency is a 3-letter code');
select t.throws($$update plans set gas_split = null where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_gas_currency', 'no currency without an amount');
select t.throws($$update plans set stops = repeat('x', 121) where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_stops_length', 'stops are capped at 120 characters');
select t.throws($$update plans set stops = '' where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'plans_stops_length', '...and can''t be empty (use null)');
update plans set stops = repeat('x', 120) where id = :PUB;
reset role;

-- ===== Visible exactly where the plan is =====
set role anon; select t.as_user(null);
select t.eq((select gas_currency from plans where id = :PUB), 'USD', 'anon sees the details on a public carpool');
select t.eq((select count(*) from plans where id = :PC), 0::bigint, 'anon can''t see the circle carpool at all (so none of its details)');
select t.eq((select count(*) from plans where stops = 'Grand Junction'), 0::bigint, '...not even by searching for them');
reset role;
set role authenticated; select t.as_user(:F);
select t.eq((select get_shared_plan(:PC)) is null, true, 'an outsider gets nothing for the circle carpool');
select t.eq((select count(*) from plans where id = :PC), 0::bigint, '...and can''t read the row');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select get_shared_plan(:PC)->>'stops'), 'Grand Junction', 'a member sees the stops with the plan');
select t.eq((select get_shared_plan(:PC)->>'gas_split'), '25.50', '...and the gas split');
reset role;
