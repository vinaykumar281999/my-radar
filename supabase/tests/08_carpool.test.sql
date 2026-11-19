-- Carpool: required fields, signed-in riders, private details only for approved riders.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set CAR '''f1f1f1f1-0000-0000-0000-000000000001'''
\set CIRCLECAR '''f2f2f2f2-0000-0000-0000-000000000002'''
select t.make_user(:A, 'alice');  -- driver
select t.make_user(:B, 'bob');    -- rider
select t.make_user(:C, 'carol');  -- someone else

set role authenticated; select t.as_user(:A);
select t.throws($$insert into plans (user_id, title, category, timeframe) values (auth.uid(), 'Ride', 'Carpool', 'This Month')$$,
  'plans_carpool_fields', 'carpool needs route, departure and seats');
insert into plans (id, user_id, title, category, timeframe, capacity, origin, destination, departs_at, departs_tz) values
  (:CAR, :A, 'Ride to Tahoe', 'Carpool', 'This Month', 3, 'SF', 'Tahoe', '2026-12-04 15:30:00-08', 'America/Los_Angeles');
insert into plan_private_details (plan_id, owner_id, pickup_details, owner_contact, rider_note) values (:CAR, :A, '24th St BART, north exit', '+1 555 000 1111', 'Bring chains');
select t.throws($$update plan_private_details set rider_note = repeat('x', 281)$$, 'check constraint', 'rider_note is capped at 280 chars');
select t.throws($$update plans set dates_flexible = true where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$,
  'plans_flexible_not_carpool', 'carpools can''t be flexible on dates');
insert into plans (user_id, title, category, timeframe, dates_flexible) values (auth.uid(), 'Flexible trip', 'Trip', 'This Month', true);
select t.eq((select dates_flexible from get_public_plan((select id from plans where title = 'Flexible trip'))), true, 'get_public_plan returns dates_flexible');
delete from plans where title = 'Flexible trip';
reset role;
set role service_role;
select t.throws($$insert into plan_pitches (target_user_id, title, category, timeframe, pitcher_name, pitcher_handle)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 'x', 'Carpool', 'This Month', 'x', '@x')$$, 'check constraint', 'pitches can''t be carpools');
reset role;

insert into plans (id, user_id, title, category, timeframe) values ('f9f9f9f9-0000-0000-0000-000000000009', :A, 'No details yet', 'Trip', 'This Month');
set role authenticated; select t.as_user(:C);
select t.throws($$insert into plan_private_details (plan_id, owner_id, pickup_details) values ('f9f9f9f9-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-00000000000c', 'x')$$,
  'foreign key', 'nobody can attach details to someone else''s plan (as themselves)');
select t.throws($$insert into plan_private_details (plan_id, owner_id, pickup_details) values ('f9f9f9f9-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-00000000000a', 'x')$$,
  'row-level security', '...or pretending to be the owner');
reset role;

set role service_role;
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle) values ('f1f1f1f1-0000-0000-0000-000000000001', 'Anon', '@anon')$$,
  'sign_in_required', 'signed-out carpool request refused');
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, large_bag) values
  ('a1000000-0000-0000-0000-000000000001', :CAR, 'Bob', '@bob', :B, true);
-- Carol also asks for a seat, and can drive.
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, can_drive) values
  ('a1000000-0000-0000-0000-000000000003', :CAR, 'Carol', '@carol', :C, true);
-- Flags on a plan that isn't a carpool are ignored.
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, can_drive, large_bag) values
  ('a1000000-0000-0000-0000-000000000004', 'f9f9f9f9-0000-0000-0000-000000000009', 'Bob', '@bob', :B, true, true);
select t.eq((select (can_drive, large_bag)::text from interests where id = 'a1000000-0000-0000-0000-000000000004'), '(f,f)',
  'rider flags on a non-carpool plan are ignored');
select t.eq((select (can_drive, large_bag)::text from interests where id = 'a1000000-0000-0000-0000-000000000001'), '(f,t)',
  'rider flags kept on a carpool');
reset role;

set role anon; select t.as_user(null);
select t.throws('select * from plan_private_details', 'permission denied', 'anon cannot read private details');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from plan_private_details), 0::bigint, 'pending rider sees no pickup details');
select t.eq((select count(*) from plan_private_details where rider_note is not null), 0::bigint, 'pending rider sees no rider_note');
select t.eq((select string_agg(visitor_name, ',') from interests where plan_id = :CAR), 'Bob', 'rider reads only their own request');
select t.eq((select count(*) from interests where can_drive), 0::bigint, 'rider cannot read another rider''s flags');
select t.eq((select large_bag from interests where id = 'a1000000-0000-0000-0000-000000000001'), true, 'rider reads their own flags');
select t.throws($$update interests set can_drive = true where id = 'a1000000-0000-0000-0000-000000000001'$$, 'permission denied', 'rider cannot change flags after sending');
reset role;
set role authenticated; select t.as_user(:A);
select t.eq((select count(*) from interests where plan_id = :CAR and can_drive), 1::bigint, 'owner sees every rider''s flags');
reset role;
set role authenticated; select t.as_user(:A);
select approve_spot('a1000000-0000-0000-0000-000000000001');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select pickup_details from plan_private_details where plan_id = :CAR), '24th St BART, north exit', 'approved rider sees the pickup');
select t.eq((select rider_note from plan_private_details where plan_id = :CAR), 'Bring chains', 'approved rider sees the rider_note');
select t.eq((select count(*) from interests where user_id <> auth.uid()), 0::bigint, 'approved rider still cannot read other riders'' requests');
update plan_private_details set pickup_details = 'hacked', rider_note = 'hacked';  -- RLS: matches no rows for a rider
select t.eq((select pickup_details from plan_private_details where plan_id = :CAR), '24th St BART, north exit', 'rider cannot edit details');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from plan_private_details), 0::bigint, 'others see nothing (pickup or rider_note)');
reset role;
set role authenticated; select t.as_user(:A);
select decline_spot('a1000000-0000-0000-0000-000000000001');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from plan_private_details), 0::bigint, 'taking back the spot hides the pickup and rider_note again');
reset role;

-- Circle carpool: approved, then removed from the circle -> loses the details.
insert into circles (id, owner_id, name) values ('c1c1c1c1-0000-0000-0000-000000000001', :A, 'Ski crew');
insert into circle_members (circle_id, user_id) values ('c1c1c1c1-0000-0000-0000-000000000001', :B);
insert into plans (id, user_id, title, category, timeframe, capacity, origin, destination, departs_at, departs_tz, visibility) values
  (:CIRCLECAR, :A, 'Ski ride', 'Carpool', 'This Month', 2, 'Oakland', 'Kirkwood', '2026-12-11 06:00:00-08', 'America/Los_Angeles', 'circles');
insert into plan_audiences values (:CIRCLECAR, :A, 'c1c1c1c1-0000-0000-0000-000000000001');
insert into plan_private_details (plan_id, owner_id, pickup_details, rider_note) values (:CIRCLECAR, :A, 'My driveway', 'Ski rack on top');
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, status) values
  ('a2000000-0000-0000-0000-000000000002', :CIRCLECAR, 'Bob', '@bob', :B, 'pending');
set role authenticated; select t.as_user(:A);
select approve_spot('a2000000-0000-0000-0000-000000000002');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select pickup_details from plan_private_details where plan_id = :CIRCLECAR), 'My driveway', 'approved circle rider sees the pickup');
select t.eq((select rider_note from plan_private_details where plan_id = :CIRCLECAR), 'Ski rack on top', 'approved circle rider sees the rider_note');
reset role;
delete from circle_members where user_id = :B;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from plan_private_details where plan_id = :CIRCLECAR), 0::bigint, 'removed from the circle -> pickup and rider_note hidden even though approved');
reset role;
