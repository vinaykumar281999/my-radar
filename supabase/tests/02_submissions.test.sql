-- Public submissions: anon inserts revoked, guard triggers, rate limit, blocking, pause.
\set ON_ERROR_STOP 1
select t.make_user('aaaaaaaa-0000-0000-0000-000000000001', 'alice');
insert into plans (id, user_id, title, category, timeframe) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Public plan', 'Trip', 'This Month');
insert into plans (id, user_id, title, category, timeframe, is_archived) values
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Archived', 'Trip', 'This Month', true);

set role anon; select t.as_user(null);
select t.throws($$insert into plan_pitches (target_user_id, title, category, timeframe, pitcher_name, pitcher_handle)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'Trip', 'This Month', 'x', '@x')$$, 'permission denied', 'anon cannot insert pitches');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle)
  values ('11111111-0000-0000-0000-000000000001', 'x', '@x')$$, 'permission denied', 'anon cannot insert interests');
select t.throws($$select consume_rate_limit('x', 1, 1)$$, 'permission denied', 'anon cannot call the rate limiter');
reset role;

set role service_role;
insert into plan_pitches (target_user_id, title, category, timeframe, pitcher_name, pitcher_handle, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Ramen', 'Food & Nightlife', 'This Month', 'Alex', '@Alex.R', 'accepted');
select t.eq((select status from plan_pitches where title = 'Ramen'), 'pending', 'new pitches are always pending');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle)
  values ('11111111-0000-0000-0000-000000000003', 'x', '@x')$$, 'plan_unavailable', 'no interest on archived plans');
select t.eq((select string_agg(consume_rate_limit('ip1', 5, 600)::text, ',') from generate_series(1, 7)),
  'true,true,true,true,true,false,false', 'rate limiter allows the limit, then refuses');
insert into interests (plan_id, visitor_name, contact_handle) values
  ('11111111-0000-0000-0000-000000000001', 'Alex', 'instagram.com/alex.r/'),
  ('11111111-0000-0000-0000-000000000001', 'Sam', '+1 (555) 123-4567');
reset role;

set role authenticated; select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.eq(jsonb_array_length(block_contact('@ALEX.r')->'pitch_ids'), 1, 'blocking dismisses the sender''s pending pitches');
select t.eq((select count(*) from interests), 1::bigint, 'blocking deletes the sender''s interests');
reset role;

set role service_role;
select t.throws($$insert into plan_pitches (target_user_id, title, category, timeframe, pitcher_name, pitcher_handle)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'Trip', 'This Month', 'A', 'https://www.instagram.com/alex.r?hl=en')$$,
  'sender_blocked', 'blocked sender is refused in any spelling');
select t.eq(normalize_contact('+1 555 123 4567'), '15551234567', 'phones normalize to digits');
update profiles set pitches_paused = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.throws($$insert into plan_pitches (target_user_id, title, category, timeframe, pitcher_name, pitcher_handle)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'Trip', 'This Month', 'C', '@carol')$$, 'pitches_paused', 'paused profiles refuse pitches');
