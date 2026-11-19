-- Waitlist: full plans queue requests in order, freed spots promote to
-- 'pending' (never 'approved'), ineligible people are skipped, and a requester
-- learns only their own place in line.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set D '''dddddddd-0000-0000-0000-00000000000d'''
\set E '''eeeeeeee-0000-0000-0000-00000000000e'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set P '''f1f1f1f1-0000-0000-0000-000000000001'''
\set PC '''f2f2f2f2-0000-0000-0000-000000000002'''
\set NOSPOTS '''f3f3f3f3-0000-0000-0000-000000000003'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
select t.make_user(:A, 'alice');  -- owner
select t.make_user(:B, 'bob');
select t.make_user(:C, 'carol');
select t.make_user(:D, 'dave');
select t.make_user(:E, 'erin');
select t.make_user(:F, 'frank');  -- outsider

insert into plans (id, user_id, title, category, timeframe, capacity) values (:P, :A, 'Cabin', 'Trip', 'This Month', 2);
insert into plans (id, user_id, title, category, timeframe) values (:NOSPOTS, :A, 'Open hang', 'Trip', 'This Month');
insert into circles (id, owner_id, name) values (:COLLEGE, :A, 'College');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B), (:COLLEGE, :C), (:COLLEGE, :E);
insert into plans (id, user_id, title, category, timeframe, capacity, visibility) values (:PC, :A, 'Circle cabin', 'Trip', 'This Month', 1, 'circles');
insert into plan_audiences values (:PC, :A, :COLLEGE);

-- ===== Ordering =====
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, created_at) values
  ('a0000000-0000-0000-0000-000000000001', :P, 'R1', '@r1', now() - interval '10 min'),
  ('a0000000-0000-0000-0000-000000000002', :P, 'R2', '@r2', now() - interval '9 min');
reset role;
set role authenticated; select t.as_user(:A);
select approve_spot('a0000000-0000-0000-0000-000000000001');
select approve_spot('a0000000-0000-0000-0000-000000000002');
reset role;
set role service_role;
-- Inserted out of order on purpose: the line is (created_at, id), not insert order.
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('b0000000-0000-0000-0000-000000000003', :P, 'Dave',  '@dave',  :D, now() - interval '3 min'),
  ('b0000000-0000-0000-0000-000000000001', :P, 'Bob',   '@bob',   :B, now() - interval '5 min'),
  ('b0000000-0000-0000-0000-000000000002', :P, 'Carol', '@carol', :C, now() - interval '4 min');
select t.eq((select string_agg(distinct status, ',') from interests where user_id is not null and plan_id = :P), 'waitlisted', 'full plan: requests join the waitlist');
insert into interests (plan_id, visitor_name, contact_handle) values (:NOSPOTS, 'Anyone', '@any');
select t.eq((select status from interests where plan_id = :NOSPOTS), 'interested', 'plans without spots never waitlist');
reset role;

set role authenticated; select t.as_user(:B);
select t.eq(my_waitlist_position(:P), 1, 'positions follow created_at: Bob is first');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq(my_waitlist_position(:P), 2, 'Carol is second');
reset role;
set role authenticated; select t.as_user(:D);
select t.eq(my_waitlist_position(:P), 3, 'Dave is third');
reset role;

-- ===== A decline promotes the next person (to pending, not approved) =====
set role authenticated; select t.as_user(:A);
select decline_spot('a0000000-0000-0000-0000-000000000001');
select t.eq((select status from interests where user_id = :B and plan_id = :P), 'pending', 'decline promotes the first in line to pending');
select t.ok((select promoted_at is not null from interests where user_id = :B and plan_id = :P), 'promoted request is marked as promoted');
select t.eq((select count(*) from interests where plan_id = :P and status = 'approved'), 1::bigint, 'promotion never approves anyone');
select t.eq((select string_agg(visitor_name, ',' order by created_at) from interests where plan_id = :P and status = 'waitlisted'), 'Carol,Dave',
  'only one promoted: approved + pending = capacity');
select t.throws($$select promote_waitlist('f1f1f1f1-0000-0000-0000-000000000001')$$, 'permission denied', 'owners cannot call promote_waitlist directly');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq(my_waitlist_position(:P), 1, 'Carol moved up to first');
reset role;

-- ===== A requester can't see anyone else's place =====
set role authenticated; select t.as_user(:D);
select t.eq(my_waitlist_position(:P), 2, 'Dave sees his own position');
select t.eq((select count(*) from interests where plan_id = :P), 1::bigint, 'Dave reads only his own request');
select t.eq((select count(*) from interests where status = 'waitlisted' and user_id <> auth.uid()), 0::bigint, 'nobody else''s waitlist rows are readable');
reset role;
set role authenticated; select t.as_user(:E);
select t.eq(my_waitlist_position(:P), null::int, 'someone not on the waitlist gets null');
select t.eq(my_waitlist_position(:PC), null::int, '...on every plan');
reset role;
set role anon; select t.as_user(null);
select t.throws($$select my_waitlist_position('f1f1f1f1-0000-0000-0000-000000000001')$$, 'permission denied', 'anon cannot ask for positions');
select t.throws($$select promote_waitlist('f1f1f1f1-0000-0000-0000-000000000001')$$, 'permission denied', 'anon cannot call promote_waitlist');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq(my_waitlist_position(:P), null::int, 'once promoted, no position');
reset role;

-- ===== Raising capacity promotes several =====
set role authenticated; select t.as_user(:A);
update plans set capacity = 4 where id = :P;
select t.eq((select count(*) from interests where plan_id = :P and status = 'waitlisted'), 0::bigint, 'capacity increase promotes everyone who fits');
select t.eq((select string_agg(visitor_name, ',' order by created_at) from interests where plan_id = :P and status = 'pending'), 'Bob,Carol,Dave',
  '...in order, all to pending');
reset role;
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle) values ('b0000000-0000-0000-0000-000000000009', :P, 'Late', '@late');
select t.eq((select status from interests where id = 'b0000000-0000-0000-0000-000000000009'), 'pending', 'room left and nobody waiting: straight to pending');
reset role;

-- ===== Blocking an approved person promotes too =====
set role authenticated; select t.as_user(:A);
select approve_spot('b0000000-0000-0000-0000-000000000001');
select approve_spot('b0000000-0000-0000-0000-000000000002');
select approve_spot('b0000000-0000-0000-0000-000000000003');
reset role;
-- 4 approved now (R2, Bob, Carol, Dave), Late pending; a newcomer waits.
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, created_at) values
  ('b0000000-0000-0000-0000-00000000000a', :P, 'Newbie', '@newbie', now());
select t.eq((select status from interests where id = 'b0000000-0000-0000-0000-00000000000a'), 'waitlisted', 'full again: newcomer waits');
reset role;
set role authenticated; select t.as_user(:A);
select decline_spot('b0000000-0000-0000-0000-000000000009');
select t.eq((select status from interests where id = 'b0000000-0000-0000-0000-00000000000a'), 'waitlisted',
  'declining a pending request with no room left promotes nobody');
select t.eq(block_contact('@dave')->'interests'->0->>'status', 'approved', 'block removes an approved rider');
select t.eq((select status from interests where id = 'b0000000-0000-0000-0000-00000000000a'), 'pending', 'blocking an approved person promotes the next in line');
reset role;

-- ===== Circle plan: removed members are skipped =====
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('c0000000-0000-0000-0000-000000000005', :PC, 'Erin', '@erin', :E, now() - interval '10 min');
reset role;
set role authenticated; select t.as_user(:A);
select approve_spot('c0000000-0000-0000-0000-000000000005');
reset role;
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('c0000000-0000-0000-0000-000000000002', :PC, 'Bob', '@bob', :B, now() - interval '5 min'),
  ('c0000000-0000-0000-0000-000000000003', :PC, 'Carol', '@carol', :C, now() - interval '4 min');
select t.eq((select count(*) from interests where plan_id = :PC and status = 'waitlisted'), 2::bigint, 'circle plan: members waitlisted');
reset role;
delete from circle_members where circle_id = :COLLEGE and user_id = :B;
set role authenticated; select t.as_user(:C);
select t.eq(my_waitlist_position(:PC), 1, 'a removed member ahead no longer counts toward your position');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq(my_waitlist_position(:PC), null::int, 'removed member gets no position');
select t.eq((select count(*) from interests where plan_id = :PC), 1::bigint, 'removed member still reads only their own row');
reset role;
set role authenticated; select t.as_user(:A);
select decline_spot('c0000000-0000-0000-0000-000000000005');
select t.eq((select status from interests where user_id = :B and plan_id = :PC), 'waitlisted', 'removed member is skipped, not promoted');
select t.eq((select status from interests where user_id = :C and plan_id = :PC), 'pending', 'next eligible member is promoted instead');
reset role;

-- ===== Non-members still get the missing-plan error =====
set role service_role;
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle, user_id) values ('f2f2f2f2-0000-0000-0000-000000000002', 'Frank', '@frank', 'ffffffff-0000-0000-0000-00000000000f')$$,
  'plan_unavailable', 'outsider on a full circle plan: plan_unavailable, not waitlisted');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle) values ('f2f2f2f2-0000-0000-0000-000000000002', 'Anon', '@anon')$$,
  'plan_unavailable', 'signed-out on a circle plan: same error');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle) values ('99999999-0000-0000-0000-000000000009', 'x', '@x')$$,
  'plan_unavailable', '...exactly like a missing plan');
reset role;
set role authenticated; select t.as_user(:F);
select t.eq((select count(*) from plan_spots(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 0::bigint, 'outsider gets no counts for the circle plan');
select t.eq(my_waitlist_position(:PC), null::int, 'outsider gets no position');
reset role;

-- ===== Spot counts carry no waitlist information =====
set role anon; select t.as_user(null);
select t.eq((select to_jsonb(s) - 'plan_id' from plan_spots(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[]) s),
  '{"capacity": 4, "taken": 3}'::jsonb, 'plan_spots shows capacity and taken only');
reset role;

-- ===== Deleting a plan with a waitlist works (promotion finds no plan) =====
set role authenticated; select t.as_user(:A);
delete from plans where id = :P;
select t.eq((select count(*) from interests where plan_id = :P), 0::bigint, 'plan delete cascades cleanly');
reset role;
