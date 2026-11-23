-- decide_by is a plain public plan field: visible exactly where the plan is.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set F '''ffffffff-0000-0000-0000-00000000000f'''
\set PUB '''f1f1f1f1-0000-0000-0000-000000000001'''
\set PC '''f2f2f2f2-0000-0000-0000-000000000002'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
select t.make_user(:A, 'alice');
select t.make_user(:B, 'bob');
select t.make_user(:F, 'frank');
insert into circles (id, owner_id, name) values (:COLLEGE, :A, 'College');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B);

set role authenticated; select t.as_user(:A);
insert into plans (id, user_id, title, category, timeframe, status, decide_by)
  values (:PUB, :A, 'Concert', 'Concert', 'Next Month', 'Booking Soon', '2026-12-01');
insert into plans (id, user_id, title, category, timeframe, status, decide_by, visibility)
  values (:PC, :A, 'Cabin', 'Trip', 'Next Month', 'Booking Soon', '2026-12-03', 'circles');
insert into plan_audiences values (:PC, :A, :COLLEGE);
update plans set decide_by = '2026-12-02' where id = :PUB;
select t.eq((select decide_by::text from plans where id = :PUB), '2026-12-02', 'the owner sets and changes it');
reset role;

set role anon; select t.as_user(null);
select t.eq((select decide_by::text from plans where id = :PUB), '2026-12-02', 'anon reads it on a public plan');
select t.eq((select count(*) from plans where id = :PC), 0::bigint, '...but never sees the circle plan');
reset role;
set role authenticated; select t.as_user(:F);
select t.eq((select (get_shared_plan(:PC)) is null), true, 'an outsider gets nothing for the circle plan');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select get_shared_plan(:PC)->>'decide_by'), '2026-12-03', 'a member sees it with the plan');
-- RLS filters the row out, so the update quietly changes nothing.
update plans set decide_by = '2026-12-31' where id = :PUB;
reset role;
select t.eq((select decide_by::text from plans where id = :PUB), '2026-12-02', 'someone else can''t change it');
set role authenticated; select t.as_user(:B);
reset role;
