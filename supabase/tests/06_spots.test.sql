-- Spots: derived counts, approvals can't overbook, freeing spots, visibility.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set P '''f1f1f1f1-0000-0000-0000-000000000001'''
\set PC '''f2f2f2f2-0000-0000-0000-000000000002'''
select t.make_user(:A, 'alice');
select t.make_user(:B, 'bob');
select t.make_user(:C, 'carol');
insert into plans (id, user_id, title, category, timeframe, capacity) values (:P, :A, 'Cabin', 'Trip', 'This Month', 2);
insert into circles (id, owner_id, name) values ('c1c1c1c1-0000-0000-0000-000000000001', :A, 'College');
insert into circle_members (circle_id, user_id) values ('c1c1c1c1-0000-0000-0000-000000000001', :B);
insert into plans (id, user_id, title, category, timeframe, capacity, visibility) values (:PC, :A, 'Circle cabin', 'Trip', 'This Month', 3, 'circles');
insert into plan_audiences values (:PC, :A, 'c1c1c1c1-0000-0000-0000-000000000001');

set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, status) values
  ('a1000000-0000-0000-0000-000000000001', :P, 'R1', '@r1', 'approved'),  -- sender can't self-approve
  ('a1000000-0000-0000-0000-000000000002', :P, 'R2', '@r2', default),
  ('a1000000-0000-0000-0000-000000000003', :P, 'R3', '@r3', default);
select t.eq((select string_agg(distinct status, ',') from interests), 'pending', 'requests on a plan with spots always start pending');
reset role;

set role authenticated; select t.as_user(:B);
select t.throws($$select approve_spot('a1000000-0000-0000-0000-000000000001')$$, 'request_not_found', 'only the owner can approve');
select t.throws($$update interests set status = 'approved'$$, 'permission denied', 'nobody updates request status directly');
reset role;

set role authenticated; select t.as_user(:A);
select t.eq((approve_spot('a1000000-0000-0000-0000-000000000001'))->>'taken', '1', 'first approval');
select t.eq((approve_spot('a1000000-0000-0000-0000-000000000001'))->>'taken', '1', 'approving twice counts once');
select t.eq((approve_spot('a1000000-0000-0000-0000-000000000002'))->>'taken', '2', 'second approval fills it');
select t.throws($$select approve_spot('a1000000-0000-0000-0000-000000000003')$$, 'plan_full', 'third approval refused: full');
select t.throws($$update plans set capacity = 1 where id = 'f1f1f1f1-0000-0000-0000-000000000001'$$, 'capacity_below_approved', 'capacity can''t drop below approved');
reset role;

set role service_role;
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle) values ('f1f1f1f1-0000-0000-0000-000000000001', 'R4', '@r4')$$,
  'plan_full', 'new requests refused while full');
reset role;

set role authenticated; select t.as_user(:A);
select decline_spot('a1000000-0000-0000-0000-000000000002');
select t.eq((select taken from plan_spots(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[])), 1, 'declining an approved person frees the spot');
select t.eq((approve_spot('a1000000-0000-0000-0000-000000000003'))->>'taken', '2', 'freed spot can be approved');
delete from interests where id = 'a1000000-0000-0000-0000-000000000003';
select t.eq((select taken from plan_spots(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[])), 1, 'deleting an approved person frees the spot');
reset role;
set role service_role;
insert into interests (plan_id, visitor_name, contact_handle) values (:P, 'Blocky', '@blocky');
reset role;
set role authenticated; select t.as_user(:A);
select approve_spot((select id from interests where contact_handle = '@blocky'));
select t.eq((select taken from plan_spots(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[])), 2, 'full again');
select t.eq(block_contact('@blocky')->'interests'->0->>'status', 'approved', 'block result reports the removed person''s status');
select t.eq((select taken from plan_spots(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[])), 1, 'blocking an approved person frees the spot');
update plans set capacity = null where id = :P;
select t.throws($$select approve_spot('a1000000-0000-0000-0000-000000000002')$$, 'plan_has_no_spots', 'no approvals on plans without spots');
update plans set capacity = 2 where id = :P;
reset role;

-- Visibility of the counts
set role anon; select t.as_user(null);
select t.eq((select count(*) from plan_spots(array['f1f1f1f1-0000-0000-0000-000000000001', 'f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 1::bigint,
  'anon sees spots for the public plan only');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from plan_spots(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 0::bigint, 'non-member gets nothing for a circle plan');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select capacity from plan_spots(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 3, 'member sees circle plan spots');
reset role;

-- Requester sees their own request status, nobody else's
set role service_role;
insert into interests (plan_id, visitor_name, contact_handle, user_id) values (:PC, 'Bob', '@bob', :B);
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select status from interests where plan_id = :PC), 'pending', 'requester sees their pending request');
select t.eq((select count(*) from interests), 1::bigint, 'requester sees only their own requests');
reset role;
