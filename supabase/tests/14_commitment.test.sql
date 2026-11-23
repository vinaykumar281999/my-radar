-- "I'm in" vs "Maybe": stored on the interest, forced to 'in' for spot and
-- carpool requests, and only ever readable by the owner and the requester.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set P '''f1f1f1f1-0000-0000-0000-000000000001'''
\set SPOTS '''f2f2f2f2-0000-0000-0000-000000000002'''
\set CAR '''f3f3f3f3-0000-0000-0000-000000000003'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
select t.make_user(:A, 'alice');  -- owner
select t.make_user(:B, 'bob');
select t.make_user(:C, 'carol');

insert into plans (id, user_id, title, category, timeframe) values (:P, :A, 'Picnic', 'Weekend', 'This Month');
insert into plans (id, user_id, title, category, timeframe, capacity) values (:SPOTS, :A, 'Cabin', 'Trip', 'This Month', 4);
insert into circles (id, owner_id, name) values (:COLLEGE, :A, 'College');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B);
insert into plans (id, user_id, title, category, timeframe, capacity, origin, destination, departs_at, departs_tz, visibility)
  values (:CAR, :A, 'Ride', 'Carpool', 'This Month', 3, 'SF', 'Tahoe', '2026-12-04 15:30:00-08', 'America/Los_Angeles', 'circles');
insert into plan_audiences values (:CAR, :A, :COLLEGE);

-- ===== Stored as sent on plain plans; 'in' by default =====
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, commitment) values
  ('a0000000-0000-0000-0000-000000000001', :P, 'Maybe Mo', '@mo', 'maybe');
insert into interests (id, plan_id, visitor_name, contact_handle) values
  ('a0000000-0000-0000-0000-000000000002', :P, 'Default Dee', '@dee');
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, commitment) values
  ('a0000000-0000-0000-0000-000000000003', :P, 'Bob', '@bob', :B, 'in');
select t.eq((select commitment from interests where id = 'a0000000-0000-0000-0000-000000000001'), 'maybe', 'maybe is kept on a plain plan');
select t.eq((select commitment from interests where id = 'a0000000-0000-0000-0000-000000000002'), 'in', 'no choice means in');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle, commitment) values ('f1f1f1f1-0000-0000-0000-000000000001', 'x', '@x', 'probably')$$,
  'interests_commitment_check', 'only in or maybe');

-- ===== Spot and carpool requests are always in =====
insert into interests (id, plan_id, visitor_name, contact_handle, commitment) values
  ('a0000000-0000-0000-0000-000000000004', :SPOTS, 'Spot Sam', '@sam', 'maybe');
select t.eq((select commitment from interests where id = 'a0000000-0000-0000-0000-000000000004'), 'in', 'a spot request is always in');
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, commitment) values
  ('a0000000-0000-0000-0000-000000000005', :CAR, 'Bob', '@bob', :B, 'maybe');
select t.eq((select commitment from interests where id = 'a0000000-0000-0000-0000-000000000005'), 'in', 'a seat request is always in');
reset role;

-- ===== Who can read it =====
set role authenticated; select t.as_user(:A);
select t.eq((select string_agg(visitor_name || ':' || commitment, ',' order by visitor_name) from interests where plan_id = :P),
  'Bob:in,Default Dee:in,Maybe Mo:maybe', 'the owner sees everyone''s commitment');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select string_agg(commitment, ',') from interests where plan_id = :P), 'in', 'a requester sees only their own');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from interests), 0::bigint, 'anyone else sees nothing');
reset role;
set role anon; select t.as_user(null);
select t.eq((select count(*) from interests), 0::bigint, 'anon reads no interests (RLS)');
-- The only public count is spots taken; it carries no in/maybe information.
select t.eq((select string_agg(k, ',' order by k) from plan_spots(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[]) s, jsonb_object_keys(to_jsonb(s)) k),
  'capacity,plan_id,taken', 'plan_spots still only returns capacity and taken');
reset role;
