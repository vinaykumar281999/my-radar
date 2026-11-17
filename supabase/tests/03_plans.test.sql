-- Plan visibility, accept_pitch idempotency, dates, calendar feed tokens.
\set ON_ERROR_STOP 1
select t.make_user('aaaaaaaa-0000-0000-0000-000000000001', 'alice');
select t.make_user('bbbbbbbb-0000-0000-0000-000000000002', 'bob');
insert into plans (id, user_id, title, category, timeframe, visibility) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Public plan', 'Trip', 'This Month', 'public'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Unlisted plan', 'Trip', 'This Month', 'unlisted');

set role anon; select t.as_user(null);
select t.eq((select string_agg(title, ',') from plans), 'Public plan', 'anon lists only public plans');
select t.eq((select title from get_public_plan('11111111-0000-0000-0000-000000000002')), 'Unlisted plan', 'unlisted plan loads by id');
reset role;

set role authenticated; select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.throws($$insert into plans (user_id, title, category, timeframe, start_date, end_date)
  values (auth.uid(), 'x', 'Trip', 'This Month', '2026-12-10', '2026-12-01')$$, 'plans_dates_order', 'end date cannot precede start');
reset role;

insert into plan_pitches (id, target_user_id, title, category, timeframe, pitcher_name, pitcher_handle)
  values ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Hike', 'Weekend', 'This Month', 'Carol', '@carol');
set role authenticated; select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.eq((accept_pitch('22222222-0000-0000-0000-000000000001', '@carol')).title, 'Hike', 'accepting a pitch creates the plan');
select t.throws($$select accept_pitch('22222222-0000-0000-0000-000000000001', '@carol')$$, 'pitch_not_pending', 'second accept is refused');
select t.eq(length(regenerate_calendar_token()), 64, 'feed token is 64 chars');
create temp table first_token as select token from calendar_feeds;
select t.ok(regenerate_calendar_token() <> (select token from first_token), 'regenerating replaces the token');
reset role;
set role authenticated; select t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select t.eq((select count(*) from calendar_feeds), 0::bigint, 'users cannot see others'' feed tokens');
reset role; set role anon;
select t.throws('select * from calendar_feeds', 'permission denied', 'anon cannot read feed tokens');
