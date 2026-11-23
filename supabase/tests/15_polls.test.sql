-- Date polls: owner-managed options on "Just an Idea" plans; votes from anyone
-- who can see the plan (circle plans: members only, missing-plan error for
-- everyone else); names visible only to the owner and the voter; public counts
-- carry no names; picking sets the dates and closes the poll.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set P '''f1f1f1f1-0000-0000-0000-000000000001'''
\set PC '''f2f2f2f2-0000-0000-0000-000000000002'''
\set LOCKED '''f3f3f3f3-0000-0000-0000-000000000003'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
\set O1 '''01000000-0000-0000-0000-000000000001'''
\set O2 '''01000000-0000-0000-0000-000000000002'''
\set O3 '''01000000-0000-0000-0000-000000000003'''
\set OC1 '''02000000-0000-0000-0000-000000000001'''
\set OC2 '''02000000-0000-0000-0000-000000000002'''
select t.make_user(:A, 'alice');  -- owner
select t.make_user(:B, 'bob');    -- circle member
select t.make_user(:C, 'carol');  -- circle member
select t.make_user(:F, 'frank');  -- outsider

insert into plans (id, user_id, title, category, timeframe) values (:P, :A, 'Zion trip', 'Trip', 'Next Month');
insert into plans (id, user_id, title, category, timeframe, status) values (:LOCKED, :A, 'Booked thing', 'Trip', 'Next Month', 'Locked In');
insert into circles (id, owner_id, name) values (:COLLEGE, :A, 'College');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B), (:COLLEGE, :C);
insert into plans (id, user_id, title, category, timeframe, visibility) values (:PC, :A, 'Secret cabin', 'Trip', 'Next Month', 'circles');
insert into plan_audiences values (:PC, :A, :COLLEGE);

-- ===== Options: owner only, Just an Idea only, at most 4 =====
set role authenticated; select t.as_user(:A);
insert into plan_date_options (id, plan_id, owner_id, start_date, end_date) values
  (:O1, :P, :A, '2026-12-11', '2026-12-14'),
  (:O2, :P, :A, '2026-12-18', '2026-12-21');
insert into plan_date_options (id, plan_id, owner_id, start_date, end_date) values
  (:OC1, :PC, :A, '2027-01-08', '2027-01-10'),
  (:OC2, :PC, :A, '2027-01-15', '2027-01-17');
select t.throws($$insert into plan_date_options (plan_id, owner_id, start_date) values ('f3f3f3f3-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-12-01')$$,
  'poll_needs_idea', 'polls are for Just an Idea plans');
select t.throws($$insert into plan_date_options (plan_id, owner_id, start_date, end_date) values ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-12-10', '2026-12-09')$$,
  'plan_date_options_range', 'an option can''t end before it starts');
insert into plan_date_options (id, plan_id, owner_id, start_date) values (:O3, :P, :A, '2027-01-02');
insert into plan_date_options (plan_id, owner_id, start_date) values (:P, :A, '2027-01-09');
select t.throws($$insert into plan_date_options (plan_id, owner_id, start_date) values ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '2027-01-16')$$,
  'poll_full', 'at most 4 options');
delete from plan_date_options where plan_id = :P and start_date = '2027-01-09';
reset role;

set role authenticated; select t.as_user(:B);
select t.throws($$insert into plan_date_options (plan_id, owner_id, start_date) values ('f1f1f1f1-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', '2026-12-01')$$,
  'plan_date_options_plan_fkey', 'someone else can''t add options to your plan (as themselves)');
select t.throws($$insert into plan_date_options (plan_id, owner_id, start_date) values ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', '2026-12-01')$$,
  'row-level security', '...or by claiming to be the owner');
select t.eq((select count(*) from plan_date_options), 0::bigint, 'others can''t read the options table directly');
reset role;

-- ===== Voting (the server action calls cast_poll_vote as service_role) =====
set role service_role;
select cast_poll_vote(:P, array[:O1, :O2]::uuid[], 'Anon Ann', '@ann', null);
select cast_poll_vote(:P, array[:O1]::uuid[], 'Bob', '@bob', :B);
-- Bob changes his mind: his ballot is replaced, not added to.
select cast_poll_vote(:P, array[:O2, :O3]::uuid[], 'Bob R', '@bob', :B);
select t.eq((select count(*) from plan_poll_ballots where user_id = :B), 1::bigint, 'one ballot per signed-in voter');
select t.throws($$select cast_poll_vote('f1f1f1f1-0000-0000-0000-000000000001', array['02000000-0000-0000-0000-000000000001']::uuid[], 'x', '@x', null)$$,
  'invalid_options', 'options must belong to the plan');
select t.throws($$select cast_poll_vote('f1f1f1f1-0000-0000-0000-000000000001', array[]::uuid[], 'x', '@x', null)$$,
  'invalid_options', 'a vote needs at least one option');
reset role;

-- ===== Circle plan: members only; everyone else gets the missing-plan error =====
set role service_role;
select cast_poll_vote(:PC, array[:OC1]::uuid[], 'Carol', '@carol', :C);
select t.throws($$select cast_poll_vote('f2f2f2f2-0000-0000-0000-000000000002', array['02000000-0000-0000-0000-000000000001']::uuid[], 'Frank', '@frank', 'ffffffff-0000-0000-0000-00000000000f')$$,
  'plan_unavailable', 'an outsider can''t vote on a circle plan');
select t.throws($$select cast_poll_vote('f2f2f2f2-0000-0000-0000-000000000002', array['02000000-0000-0000-0000-000000000001']::uuid[], 'Anon', '@anon', null)$$,
  'plan_unavailable', 'signed out: same error');
select t.throws($$select cast_poll_vote('99999999-0000-0000-0000-000000000009', array['02000000-0000-0000-0000-000000000001']::uuid[], 'x', '@x', null)$$,
  'plan_unavailable', '...exactly like a missing plan');
reset role;

-- ===== Blocked contacts are refused =====
set role authenticated; select t.as_user(:A);
insert into blocked_contacts (owner_id, contact_key, label) values (:A, normalize_contact('@spammer'), '@spammer');
reset role;
set role service_role;
select t.throws($$select cast_poll_vote('f1f1f1f1-0000-0000-0000-000000000001', array['01000000-0000-0000-0000-000000000001']::uuid[], 'Spam', 'instagram.com/Spammer', null)$$,
  'sender_blocked', 'a blocked contact can''t vote (any spelling of it)');
select t.eq((select count(*) from plan_poll_ballots where voter_contact ilike '%spammer%'), 0::bigint, '...and nothing was saved');
reset role;

-- ===== Who sees names =====
set role authenticated; select t.as_user(:A);
select t.eq((select string_agg(voter_name, ',' order by voter_name) from plan_poll_ballots where plan_id = :P), 'Anon Ann,Bob R', 'the owner sees every voter');
select t.eq((select count(*) from plan_poll_choices c join plan_poll_ballots b on b.id = c.ballot_id where b.plan_id = :P), 4::bigint, '...and their choices');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select string_agg(voter_name, ',') from plan_poll_ballots), 'Bob R', 'a voter sees only their own ballot');
select t.eq((select count(*) from plan_poll_choices), 2::bigint, '...and only their own choices');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select string_agg(voter_name, ',') from plan_poll_ballots), 'Carol', 'Carol sees only hers, not Bob''s or Ann''s');
reset role;
set role authenticated; select t.as_user(:F);
select t.eq((select count(*) from plan_poll_ballots), 0::bigint, 'an outsider sees no ballots');
select t.eq((select count(*) from plan_poll_choices), 0::bigint, '...and no choices');
reset role;
set role anon; select t.as_user(null);
select t.throws($$select * from plan_poll_ballots$$, 'permission denied', 'anon can''t read ballots');
select t.throws($$select * from plan_poll_choices$$, 'permission denied', 'anon can''t read choices');
select t.throws($$select * from plan_date_options$$, 'permission denied', 'anon can''t read the options table');
select t.throws($$select cast_poll_vote('f1f1f1f1-0000-0000-0000-000000000001', array['01000000-0000-0000-0000-000000000001']::uuid[], 'x', '@x', null)$$,
  'permission denied', 'anon can''t call cast_poll_vote directly');
reset role;
set role authenticated; select t.as_user(:B);
select t.throws($$select cast_poll_vote('f1f1f1f1-0000-0000-0000-000000000001', array['01000000-0000-0000-0000-000000000001']::uuid[], 'x', '@x', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'permission denied', 'signed-in users can''t call it directly either');
reset role;

-- ===== Public counts: no names, same visibility as the plan =====
set role anon; select t.as_user(null);
select t.eq((select string_agg(to_char(start_date, 'MM-DD') || '=' || votes, ',' order by start_date) from plan_poll(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[])),
  '12-11=1,12-18=2,01-02=1', 'anon sees counts on a public plan');
select t.eq((select string_agg(k, ',' order by k) from (select distinct k from plan_poll(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[]) s, jsonb_object_keys(to_jsonb(s)) k) x),
  'end_date,option_id,plan_id,start_date,votes', 'counts carry no names or contacts');
select t.eq((select count(*) from plan_poll(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 0::bigint, 'anon gets nothing for a circle plan');
reset role;
set role authenticated; select t.as_user(:F);
select t.eq((select count(*) from plan_poll(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 0::bigint, 'an outsider gets nothing for a circle plan');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select string_agg(votes::text, ',' order by start_date) from plan_poll(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), '1,0', 'a member sees the circle plan''s counts');
reset role;
delete from circle_members where circle_id = :COLLEGE and user_id = :B;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from plan_poll(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 0::bigint, 'removed from the circle: no counts');
reset role;
set role service_role;
select t.throws($$select cast_poll_vote('f2f2f2f2-0000-0000-0000-000000000002', array['02000000-0000-0000-0000-000000000001']::uuid[], 'Bob', '@bob', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'plan_unavailable', '...and can''t vote any more');
reset role;

-- A poll needs two options to be open.
set role authenticated; select t.as_user(:A);
delete from plan_date_options where id = :OC2;
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from plan_poll(array['f2f2f2f2-0000-0000-0000-000000000002']::uuid[])), 0::bigint, 'one option left: no poll shown');
reset role;
set role service_role;
select t.throws($$select cast_poll_vote('f2f2f2f2-0000-0000-0000-000000000002', array['02000000-0000-0000-0000-000000000001']::uuid[], 'Carol', '@carol', 'cccccccc-0000-0000-0000-00000000000c')$$,
  'poll_closed', '...and no voting');
reset role;

-- ===== Picking: owner only; sets the dates; closes the poll =====
set role authenticated; select t.as_user(:B);
select t.throws($$select pick_date_option('01000000-0000-0000-0000-000000000002')$$, 'option_not_found', 'only the owner can pick');
reset role;
set role authenticated; select t.as_user(:A);
select t.eq((select pick_date_option(:O2)->>'start_date'), '2026-12-18', 'picking returns the plan with the new dates');
select t.eq((select start_date::text || '/' || end_date::text from plans where id = :P), '2026-12-18/2026-12-21', 'the plan has the picked dates');
select t.ok((select poll_closed_at is not null and poll_picked_option_id = :O2 from plans where id = :P), 'the poll is closed and remembers the pick');
select t.throws($$select pick_date_option('01000000-0000-0000-0000-000000000001')$$, 'poll_closed', 'you can''t pick twice');
select t.throws($$delete from plan_date_options where id = '01000000-0000-0000-0000-000000000001'$$, 'poll_closed', 'options are frozen once picked');
select t.eq((select count(*) from plan_poll_ballots where plan_id = :P), 2::bigint, 'the owner still has the results');
reset role;
set role anon; select t.as_user(null);
select t.eq((select count(*) from plan_poll(array['f1f1f1f1-0000-0000-0000-000000000001']::uuid[])), 0::bigint, 'closed polls aren''t shown publicly');
reset role;
set role service_role;
select t.throws($$select cast_poll_vote('f1f1f1f1-0000-0000-0000-000000000001', array['01000000-0000-0000-0000-000000000001']::uuid[], 'Late', '@late', null)$$,
  'poll_closed', 'no votes after picking');
reset role;
set role anon; select t.as_user(null);
select t.throws($$select pick_date_option('01000000-0000-0000-0000-000000000001')$$, 'permission denied', 'anon can''t pick');
reset role;

-- ===== Deleting a plan takes its poll with it =====
set role authenticated; select t.as_user(:A);
delete from plans where id = :P;
reset role;
select t.eq((select count(*) from plan_date_options where plan_id = :P), 0::bigint, 'options deleted with the plan');
select t.eq((select count(*) from plan_poll_ballots where plan_id = :P), 0::bigint, 'ballots deleted with the plan');
