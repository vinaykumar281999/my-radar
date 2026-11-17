-- set_plan_audience: atomic visibility + circles, owner-only.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set P '''f1f1f1f1-0000-0000-0000-000000000001'''
select t.make_user(:A, 'alice');
select t.make_user(:B, 'bob');
insert into circles (id, owner_id, name) values
  ('c1c1c1c1-0000-0000-0000-000000000001', :A, 'College'),
  ('c2c2c2c2-0000-0000-0000-000000000002', :A, 'Work'),
  ('c3c3c3c3-0000-0000-0000-000000000003', :B, 'Bob crew');
insert into plans (id, user_id, title, category, timeframe) values (:P, :A, 'Plan', 'Trip', 'This Month');

set role authenticated; select t.as_user(:A);
select set_plan_audience(:P, 'circles', array['c1c1c1c1-0000-0000-0000-000000000001', 'c2c2c2c2-0000-0000-0000-000000000002']::uuid[]);
select t.eq((select visibility from plans where id = :P), 'circles', 'visibility set to circles');
select t.eq((select count(*) from plan_audiences where plan_id = :P), 2::bigint, 'two circles attached');
select set_plan_audience(:P, 'circles', array['c2c2c2c2-0000-0000-0000-000000000002']::uuid[]);
select t.eq((select string_agg(circle_id::text, ',') from plan_audiences where plan_id = :P), 'c2c2c2c2-0000-0000-0000-000000000002', 'removed circles are detached');
select t.throws($$select set_plan_audience('f1f1f1f1-0000-0000-0000-000000000001', 'circles', '{}')$$, 'circles_required', 'circles needs at least one circle');
select t.throws($$select set_plan_audience('f1f1f1f1-0000-0000-0000-000000000001', 'circles', array['c3c3c3c3-0000-0000-0000-000000000003']::uuid[])$$,
  'foreign key', 'cannot use someone else''s circle');
select t.eq((select string_agg(circle_id::text, ',') from plan_audiences where plan_id = :P), 'c2c2c2c2-0000-0000-0000-000000000002', 'failed call changed nothing');
select set_plan_audience(:P, 'public');
select t.eq((select visibility from plans where id = :P), 'public', 'back to public');
select t.eq((select count(*) from plan_audiences where plan_id = :P), 0::bigint, 'audiences cleared');
reset role;
set role authenticated; select t.as_user(:B);
select t.throws($$select set_plan_audience('f1f1f1f1-0000-0000-0000-000000000001', 'unlisted')$$, 'plan_not_found', 'cannot change someone else''s plan');
