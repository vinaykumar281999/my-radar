-- "Off the waitlist" notices: only the promoted requester sees theirs, only
-- while it's still pending and they can still see the plan, and only they can
-- dismiss it. Signed-out requests never get one.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set D '''dddddddd-0000-0000-0000-00000000000d'''
\set E '''eeeeeeee-0000-0000-0000-00000000000e'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set PC '''f1f1f1f1-0000-0000-0000-000000000001'''
\set P2 '''f2f2f2f2-0000-0000-0000-000000000002'''
\set P3 '''f3f3f3f3-0000-0000-0000-000000000003'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
select t.make_user(:A, 'alice');  -- owner
select t.make_user(:B, 'bob');
select t.make_user(:C, 'carol');
select t.make_user(:D, 'dave');
select t.make_user(:E, 'erin');
select t.make_user(:F, 'frank');  -- not in the circle

insert into circles (id, owner_id, name) values (:COLLEGE, :A, 'College');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B), (:COLLEGE, :C), (:COLLEGE, :D), (:COLLEGE, :E);
insert into plans (id, user_id, title, category, timeframe, capacity, visibility) values (:PC, :A, 'Circle cabin', 'Trip', 'This Month', 2, 'circles');
insert into plan_audiences values (:PC, :A, :COLLEGE);

-- Erin and Dave fill both spots; Bob then Carol wait.
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('a0000000-0000-0000-0000-00000000000e', :PC, 'Erin', '@erin', :E, now() - interval '10 min'),
  ('a0000000-0000-0000-0000-00000000000d', :PC, 'Dave', '@dave', :D, now() - interval '9 min');
reset role;
set role authenticated; select t.as_user(:A);
select approve_spot('a0000000-0000-0000-0000-00000000000e');
select approve_spot('a0000000-0000-0000-0000-00000000000d');
reset role;
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('a0000000-0000-0000-0000-00000000000b', :PC, 'Bob', '@bob', :B, now() - interval '5 min'),
  ('a0000000-0000-0000-0000-00000000000c', :PC, 'Carol', '@carol', :C, now() - interval '4 min');
select t.eq((select count(*) from interests where plan_id = :PC and status = 'waitlisted'), 2::bigint, 'setup: Bob and Carol wait');
reset role;

set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'no notice while still waitlisted');
reset role;

-- ===== A promotion gives exactly that person a notice =====
set role authenticated; select t.as_user(:A);
select decline_spot('a0000000-0000-0000-0000-00000000000e');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select to_jsonb(n) - 'promoted_at' from my_promotion_notices() n),
  '{"interest_id": "a0000000-0000-0000-0000-00000000000b", "plan_id": "f1f1f1f1-0000-0000-0000-000000000001", "plan_title": "Circle cabin", "owner_username": "alice", "owner_display_name": "Alice"}'::jsonb,
  'the promoted user sees their notice, with plan and owner');
select t.ok((select promoted_at is not null from my_promotion_notices()), '...and when it happened');
reset role;
select t.eq((select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'interests' and column_name ilike '%seen%'), 0::bigint,
  'interests has no seen column at all');

-- ===== Nobody else sees anything =====
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'another requester (still waiting) sees nothing');
reset role;
set role authenticated; select t.as_user(:D);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'an approved requester sees nothing');
reset role;
set role authenticated; select t.as_user(:A);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'the owner sees nothing');
reset role;
set role authenticated; select t.as_user(:F);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'a non-member sees nothing');
reset role;
set role anon; select t.as_user(null);
select t.throws($$select * from my_promotion_notices()$$, 'permission denied', 'anon cannot ask for notices');
select t.throws($$select dismiss_promotion_notice('a0000000-0000-0000-0000-00000000000b')$$, 'permission denied', 'anon cannot dismiss');
reset role;

-- ===== Removed from the circle: the notice goes away =====
set role authenticated; select t.as_user(:A);
select decline_spot('a0000000-0000-0000-0000-00000000000d');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from my_promotion_notices()), 1::bigint, 'Carol promoted: one notice');
reset role;
delete from circle_members where circle_id = :COLLEGE and user_id = :C;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'removed from the circle: the notice is gone');
reset role;

-- ===== Dismiss: your own row only, same error as a missing row otherwise =====
set role authenticated; select t.as_user(:C);
select t.throws($$select dismiss_promotion_notice('a0000000-0000-0000-0000-00000000000b')$$,
  'request_not_found', 'another requester can''t dismiss Bob''s notice');
reset role;
set role authenticated; select t.as_user(:A);
select t.throws($$select dismiss_promotion_notice('a0000000-0000-0000-0000-00000000000b')$$,
  'request_not_found', 'the owner can''t dismiss it either');
select t.throws($$select dismiss_promotion_notice('99999999-0000-0000-0000-000000000009')$$,
  'request_not_found', '...the same error as a missing row');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from my_promotion_notices()), 1::bigint, 'failed attempts left Bob''s notice alone');
select dismiss_promotion_notice('a0000000-0000-0000-0000-00000000000b');
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'Bob dismissed his notice');
select t.eq((select count(*) from promotion_notice_seen), 1::bigint, 'Bob reads his own seen row');
select dismiss_promotion_notice('a0000000-0000-0000-0000-00000000000b');
select t.eq((select status from interests where id = 'a0000000-0000-0000-0000-00000000000b'), 'pending', 'dismissing twice is harmless and changes nothing else');
select t.eq((select count(*) from promotion_notice_seen), 1::bigint, '...and keeps one seen row');
select t.throws($$update promotion_notice_seen set seen_at = now()$$, 'permission denied', 'seen rows can''t be changed');
select t.throws($$delete from promotion_notice_seen$$, 'permission denied', 'seen rows can''t be removed (no un-dismissing)');
select t.throws($$insert into promotion_notice_seen (interest_id, user_id) values ('a0000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'row-level security', 'Bob can''t mark Carol''s notice as seen');
reset role;

-- ===== The owner gets no read receipt =====
set role authenticated; select t.as_user(:A);
select t.eq((select count(*) from promotion_notice_seen), 0::bigint, 'the owner can''t read promotion_notice_seen');
select t.eq((select count(*) from interests where plan_id = :PC), 4::bigint, 'the owner still reads every request on the plan');
select t.eq((select count(*) from interests i, jsonb_object_keys(to_jsonb(i)) k where i.plan_id = :PC and k ilike '%seen%'), 0::bigint,
  'the owner''s interests rows have no seen column');
select t.throws($$insert into promotion_notice_seen (interest_id, user_id) values ('a0000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  'row-level security', 'the owner can''t write one either');
reset role;

-- ===== Non-members and anon =====
set role authenticated; select t.as_user(:F);
select t.eq((select count(*) from promotion_notice_seen), 0::bigint, 'a non-member reads no seen rows');
select t.throws($$insert into promotion_notice_seen (interest_id, user_id) values ('a0000000-0000-0000-0000-00000000000c', 'ffffffff-0000-0000-0000-00000000000f')$$,
  'row-level security', 'a non-member can''t write one');
reset role;
set role anon; select t.as_user(null);
select t.throws($$select * from promotion_notice_seen$$, 'permission denied', 'anon can''t read promotion_notice_seen');
select t.throws($$insert into promotion_notice_seen (interest_id, user_id) values ('a0000000-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c')$$,
  'permission denied', 'anon can''t write it');
reset role;

-- ===== Approved or declined: the notice is gone =====
insert into plans (id, user_id, title, category, timeframe, capacity) values (:P2, :A, 'Ski day', 'Trip', 'This Month', 1);
insert into plans (id, user_id, title, category, timeframe, capacity) values (:P3, :A, 'Concert', 'Concert', 'This Month', 1);
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('b0000000-0000-0000-0000-000000000001', :P2, 'Anon one', '@anon1', null, now() - interval '10 min'),
  ('c0000000-0000-0000-0000-000000000001', :P3, 'Erin', '@erin', :E, now() - interval '10 min');
reset role;
set role authenticated; select t.as_user(:A);
select approve_spot('b0000000-0000-0000-0000-000000000001');
select approve_spot('c0000000-0000-0000-0000-000000000001');
reset role;
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, created_at) values
  ('b0000000-0000-0000-0000-00000000000b', :P2, 'Bob', '@bob', :B, now() - interval '5 min'),
  ('b0000000-0000-0000-0000-000000000002', :P2, 'Anon two', '@anon2', null, now() - interval '4 min'),
  ('c0000000-0000-0000-0000-00000000000d', :P3, 'Dave', '@dave', :D, now() - interval '5 min');
reset role;
set role authenticated; select t.as_user(:A);
select decline_spot('b0000000-0000-0000-0000-000000000001');
select decline_spot('c0000000-0000-0000-0000-000000000001');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select string_agg(plan_title, ',') from my_promotion_notices()), 'Ski day', 'Bob promoted on a public plan');
reset role;
set role authenticated; select t.as_user(:D);
select t.eq((select string_agg(plan_title, ',') from my_promotion_notices()), 'Concert', 'Dave promoted too');
reset role;

set role authenticated; select t.as_user(:A);
select approve_spot('b0000000-0000-0000-0000-00000000000b');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'approved: the notice is gone');
reset role;
set role authenticated; select t.as_user(:A);
select decline_spot('c0000000-0000-0000-0000-00000000000d');
reset role;
set role authenticated; select t.as_user(:D);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'declined: the notice is gone');
reset role;

-- ===== Signed-out requests: promoted, but nobody gets a notice =====
set role authenticated; select t.as_user(:A);
select decline_spot('b0000000-0000-0000-0000-00000000000b');  -- frees Ski day; Anon two is next
reset role;
select t.eq((select status from interests where id = 'b0000000-0000-0000-0000-000000000002'), 'pending', 'setup: the signed-out request was promoted');
select t.ok((select promoted_at is not null from interests where id = 'b0000000-0000-0000-0000-000000000002'), '...and marked as promoted');
set role authenticated; select t.as_user(:A);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'the owner gets no notice for it');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from my_promotion_notices()), 0::bigint, 'nor does anyone else');
reset role;

-- ===== A fresh request never arrives already promoted =====
set role service_role;
insert into interests (id, plan_id, visitor_name, contact_handle, user_id, promoted_at)
  values ('d0000000-0000-0000-0000-000000000001', :P3, 'Frank', '@frank', :F, now());
select t.ok((select promoted_at is null from interests where id = 'd0000000-0000-0000-0000-000000000001'),
  'insert can''t preset promoted_at');
reset role;

-- ===== Deleting a request takes its seen row with it =====
select t.eq((select count(*) from promotion_notice_seen where interest_id = 'a0000000-0000-0000-0000-00000000000b'), 1::bigint, 'setup: Bob''s seen row exists');
delete from interests where id = 'a0000000-0000-0000-0000-00000000000b';
select t.eq((select count(*) from promotion_notice_seen where interest_id = 'a0000000-0000-0000-0000-00000000000b'), 0::bigint, 'request deleted: seen row deleted');
