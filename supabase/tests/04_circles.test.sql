-- Circles: circle plans are visible only to the owner and signed-in members,
-- never through public/unlisted paths, and nothing hints that they exist.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set C '''cccccccc-0000-0000-0000-00000000000c'''
\set D '''dddddddd-0000-0000-0000-00000000000d'''
\set E '''eeeeeeee-0000-0000-0000-00000000000e'''
\set COLLEGE '''c1c1c1c1-0000-0000-0000-000000000001'''
\set WORK '''c2c2c2c2-0000-0000-0000-000000000002'''
\set BOBS '''c3c3c3c3-0000-0000-0000-000000000003'''
\set P_PUBLIC '''f1f1f1f1-0000-0000-0000-000000000001'''
\set P_UNLISTED '''f2f2f2f2-0000-0000-0000-000000000002'''
\set P_COLLEGE '''f3f3f3f3-0000-0000-0000-000000000003'''
\set P_WORK '''f4f4f4f4-0000-0000-0000-000000000004'''
\set P_ARCHIVED '''f5f5f5f5-0000-0000-0000-000000000005'''
\set NOPE '''99999999-0000-0000-0000-000000000009'''

select t.make_user(:A, 'alice');  -- owner
select t.make_user(:B, 'bob');    -- member of College
select t.make_user(:C, 'carol');  -- signed in, member of nothing
select t.make_user(:D, 'dave');   -- joins College via invite link
select t.make_user(:E, 'erin');

insert into circles (id, owner_id, name) values
  (:COLLEGE, :A, 'College'), (:WORK, :A, 'Work'), (:BOBS, :B, 'Bob crew');
insert into circle_members (circle_id, user_id) values (:COLLEGE, :B);
insert into plans (id, user_id, title, category, timeframe, visibility, is_archived) values
  (:P_PUBLIC,   :A, 'Public plan',   'Trip', 'This Month', 'public',   false),
  (:P_UNLISTED, :A, 'Unlisted plan', 'Trip', 'This Month', 'unlisted', false),
  (:P_COLLEGE,  :A, 'College plan',  'Trip', 'This Month', 'circles',  false),
  (:P_WORK,     :A, 'Work plan',     'Trip', 'This Month', 'circles',  false),
  (:P_ARCHIVED, :A, 'Old college',   'Trip', 'This Month', 'circles',  true);
insert into plan_audiences (plan_id, owner_id, circle_id) values
  (:P_COLLEGE, :A, :COLLEGE), (:P_WORK, :A, :WORK), (:P_ARCHIVED, :A, :COLLEGE);

-- ===== Signed out =====
set role anon; select t.as_user(null);
select t.eq((select string_agg(title, ',') from plans), 'Public plan', 'anon: lists only the public plan');
select t.eq((select count(*) from get_public_plan(:P_COLLEGE)), 0::bigint, 'anon: direct link to a circle plan returns nothing');
select t.eq((select count(*) from get_public_plan(:NOPE)), 0::bigint, 'anon: ...exactly like a plan that does not exist');
select t.eq((select title from get_public_plan(:P_UNLISTED)), 'Unlisted plan', 'anon: unlisted still loads by id');
select t.eq(viewer_in_plan_circles(:P_COLLEGE), false, 'anon: not in any circle');
select t.throws($$select get_shared_plans('aaaaaaaa-0000-0000-0000-00000000000a')$$, 'permission denied', 'anon: cannot call get_shared_plans');
select t.throws($$select get_shared_plan('f3f3f3f3-0000-0000-0000-000000000003')$$, 'permission denied', 'anon: cannot call get_shared_plan');
select t.throws($$select can_user_see_plan('f3f3f3f3-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-00000000000b')$$, 'permission denied', 'anon: cannot ask about other users');
select t.throws($$select * from preview_visible_plans(null)$$, 'permission denied', 'anon: cannot preview');
select t.throws('select * from circles', 'permission denied', 'anon: cannot read circles');
select t.throws('select * from circle_members', 'permission denied', 'anon: cannot read memberships');
select t.throws('select * from circle_invites', 'permission denied', 'anon: cannot read invites');
select t.throws('select * from plan_audiences', 'permission denied', 'anon: cannot read plan audiences');
reset role;

-- ===== Signed in, not a member =====
set role authenticated; select t.as_user(:C);
select t.eq((select string_agg(title, ',') from plans where user_id = :A), 'Public plan', 'non-member: lists only the public plan');
select t.eq(get_shared_plans(:A), '[]'::jsonb, 'non-member: nothing shared');
select t.eq(get_shared_plan(:P_COLLEGE), null::jsonb, 'non-member: direct circle plan is null');
select t.eq(get_shared_plan(:NOPE), null::jsonb, 'non-member: ...same as a missing plan');
select t.eq(viewer_circle_names(:P_COLLEGE), '{}'::text[], 'non-member: no circle names');
select t.eq((select count(*) from circles where owner_id = :A), 0::bigint, 'non-member: cannot see the owner''s circles');
select t.eq((select count(*) from circle_members), 0::bigint, 'non-member: sees no memberships');
select t.eq((select count(*) from plan_audiences), 0::bigint, 'non-member: sees no audiences');
select t.throws($$insert into circle_members (circle_id, user_id) values ('c1c1c1c1-0000-0000-0000-000000000001', auth.uid())$$,
  'row-level security', 'non-member: cannot add themselves to a circle');
-- Copy to my Radar: only from public plans, and the error never says why.
select t.throws($$insert into plans (user_id, title, category, timeframe, chained_from_plan_id)
  values (auth.uid(), 'Copy', 'Trip', 'This Month', 'f3f3f3f3-0000-0000-0000-000000000003')$$, 'copy_source_unavailable', 'copy: circle source refused');
select t.throws($$insert into plans (user_id, title, category, timeframe, chained_from_plan_id)
  values (auth.uid(), 'Copy', 'Trip', 'This Month', '99999999-0000-0000-0000-000000000009')$$, 'copy_source_unavailable', 'copy: missing source gives the same error');
select t.throws($$insert into plans (user_id, title, category, timeframe, chained_from_plan_id)
  values (auth.uid(), 'Copy', 'Trip', 'This Month', 'f2f2f2f2-0000-0000-0000-000000000002')$$, 'copy_source_unavailable', 'copy: unlisted source refused');
insert into plans (user_id, title, category, timeframe, chained_from_plan_id)
  values (auth.uid(), 'Copy', 'Trip', 'This Month', :P_PUBLIC);
select t.ok(true, 'copy: public source allowed');
reset role;

-- ===== Member =====
set role authenticated; select t.as_user(:B);
select t.eq((select string_agg(title, ',' order by title) from plans where user_id = :A), 'College plan,Public plan',
  'member: lists public + their circle''s plan (not unlisted, other circles, archived)');
select t.eq(jsonb_array_length(get_shared_plans(:A)), 1, 'member: one shared plan');
select t.eq(get_shared_plans(:A)->0->'shared_via', '["College"]'::jsonb, 'member: labelled with their circle');
select t.eq(get_shared_plan(:P_COLLEGE)->>'title', 'College plan', 'member: direct link works');
select t.eq(get_shared_plan(:P_WORK), null::jsonb, 'member: other circles stay hidden');
select t.eq(get_shared_plan(:P_ARCHIVED), null::jsonb, 'member: archived circle plans stay hidden');
select t.eq((select string_agg(name, ',' order by name) from circles), 'Bob crew,College', 'member: sees names of own + joined circles only');
select t.throws($$insert into plans (user_id, title, category, timeframe, chained_from_plan_id)
  values (auth.uid(), 'Copy', 'Trip', 'This Month', 'f3f3f3f3-0000-0000-0000-000000000003')$$, 'copy_source_unavailable', 'member: cannot copy a circle plan either');
select t.eq((select count(*) from preview_visible_plans(:C)), 0::bigint, 'member: preview only covers their own plans');
reset role;

-- ===== Owner =====
set role authenticated; select t.as_user(:A);
select t.eq((select count(*) from plans where user_id = :A), 5::bigint, 'owner: sees all own plans');
select t.eq(get_shared_plans(:A), '[]'::jsonb, 'owner: own page does not add "shared with you" plans');
select t.throws($$insert into plan_audiences (plan_id, owner_id, circle_id) values
  ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'c3c3c3c3-0000-0000-0000-000000000003')$$,
  'foreign key', 'owner: cannot share to someone else''s circle');
select t.throws($$insert into circle_members (circle_id, user_id) values ('c1c1c1c1-0000-0000-0000-000000000001', auth.uid())$$,
  'row-level security', 'owner: cannot add themselves');
select t.throws($$insert into circle_members (circle_id, user_id, invite_id) values ('c2c2c2c2-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-00000000000c', gen_random_uuid())$$,
  'row-level security', 'owner: cannot fake an invite join');
select t.throws($$update circle_members set user_id = 'cccccccc-0000-0000-0000-00000000000c'$$, 'permission denied', 'owner: can only update seen_at');
select t.eq((select string_agg(title, ',' order by title) from preview_visible_plans(:B)), 'College plan,Public plan', 'View as member');
select t.eq((select string_agg(title, ',' order by title) from preview_visible_plans(:C)), 'Public plan', 'View as non-member');
select t.eq((select string_agg(title, ',' order by title) from preview_visible_plans(null)), 'Public plan', 'View as signed out');

-- Invite links
insert into circle_invites (circle_id) values (:COLLEGE);
select t.throws($$insert into circle_invites (circle_id, token) values ('c1c1c1c1-0000-0000-0000-000000000001', 'weak')$$, 'permission denied', 'owner: cannot choose the token');
create temp table inv as select token from circle_invites;
grant select on inv to anon, authenticated;
select t.eq(length((select token from inv)), 64, 'invite token is 64 chars');
select t.eq((redeem_circle_invite((select token from inv)))->>'status', 'own_circle', 'owner redeeming own link is a no-op');
reset role;

set role anon; select t.as_user(null);
select t.eq(get_invite_preview((select token from inv))->>'circle_name', 'College', 'invite preview shows the circle');
select t.eq(get_invite_preview('nope'), '{"status": "invalid"}'::jsonb, 'bad token reveals nothing');
select t.throws($$select redeem_circle_invite('x')$$, 'permission denied', 'anon cannot redeem');
reset role;

set role authenticated; select t.as_user(:D);
select t.eq((redeem_circle_invite((select token from inv)))->>'status', 'joined', 'invitee joins');
select t.eq((redeem_circle_invite((select token from inv)))->>'status', 'already_member', 'second redeem is a no-op');
select t.eq(get_shared_plans(:A)->0->>'title', 'College plan', 'invitee now sees the circle plan');
select t.eq((select count(*) from circle_members), 1::bigint, 'invitee sees only their own membership');
reset role;
select t.eq((select uses from circle_invites), 1, 'use counted once');

set role authenticated; select t.as_user(:A);
select t.eq((select count(*) from circle_members where invite_id is not null and seen_at is null), 1::bigint, 'owner has a join notice');
update circle_members set seen_at = now() where user_id = :D;
select t.eq((select count(*) from circle_members where invite_id is not null and seen_at is null), 0::bigint, 'notice dismissed');
update circle_invites set revoked_at = now();
select t.throws('update circle_invites set revoked_at = null', 'invite_already_revoked', 'revoked link cannot be un-revoked');
select t.throws($$update circle_invites set revoked_at = now() + interval '1 day'$$, 'invite_already_revoked', 'revoked_at cannot be moved either');
select t.ok((select bool_and(revoked_at is not null) from circle_invites), 'link is still revoked');
select t.throws($$insert into circle_invites (circle_id, expires_at) values ('c2c2c2c2-0000-0000-0000-000000000002', now() + interval '91 days')$$,
  'circle_invites_expiry_cap', 'expiry past 90 days is rejected');
insert into circle_invites (circle_id, expires_at) values (:WORK, now() + interval '90 days');
select t.ok(true, 'expiry of exactly 90 days is allowed');
select t.eq((create_circle_invite(:WORK, 30, null)).max_uses, 500, 'create_circle_invite: no limit is the 500 cap');
select t.throws($$select create_circle_invite('c2c2c2c2-0000-0000-0000-000000000002', 91, 5)$$, 'invalid_expiry', 'create_circle_invite: refuses more than 90 days');
select t.throws($$select create_circle_invite('c3c3c3c3-0000-0000-0000-000000000003', 7, 5)$$, 'row-level security', 'create_circle_invite: not for someone else''s circle');
delete from circle_invites where circle_id = :WORK;
reset role;
set role authenticated; select t.as_user(:E);
select t.throws($$select redeem_circle_invite((select token from inv))$$, 'invite_invalid', 'revoked link refused');
select t.eq(get_invite_preview((select token from inv)), '{"status": "invalid"}'::jsonb, 'revoked link preview reveals nothing');
-- Revoked, expired and missing tokens must be indistinguishable to the redeemer.
create temp table redeem_errs (label text, state text, msg text);
do $$
declare v_state text; v_msg text; v_token text;
begin
  foreach v_token in array array[(select token from inv), 'no-such-token-at-all'] loop
    begin
      perform public.redeem_circle_invite(v_token);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      insert into redeem_errs values (case when v_token = 'no-such-token-at-all' then 'missing' else 'revoked' end, v_state, v_msg);
    end;
  end loop;
end $$;
select t.eq((select count(distinct (state, msg)) from redeem_errs), 1::bigint, 'revoked link error is identical to a missing token');
select t.ok((select bool_and(msg not ilike '%College%') from redeem_errs), 'revoked link error leaks no circle name');
reset role;

set role authenticated; select t.as_user(:A);
insert into circle_invites (circle_id, max_uses) values (:WORK, 1);
insert into circle_invites (circle_id, expires_at) values (:WORK, now() - interval '1 minute');
-- Capture tokens as the owner: other users can't read invites (RLS).
create temp table single_use as select token from circle_invites where max_uses = 1;
create temp table expired as select token from circle_invites where expires_at < now();
grant select on single_use, expired to authenticated;
reset role;
set role authenticated; select t.as_user(:E);
select t.eq((redeem_circle_invite((select token from single_use)))->>'status', 'joined', 'single-use link works once');
reset role;
set role authenticated; select t.as_user(:C);
select t.throws($$select redeem_circle_invite((select token from single_use))$$, 'invite_invalid', 'single-use link refused the second time');
select t.throws($$select redeem_circle_invite((select token from expired))$$, 'invite_invalid', 'expired link refused');
select t.eq(get_invite_preview((select token from expired)), '{"status": "invalid"}'::jsonb, 'expired link preview reveals nothing');
create temp table expired_errs (state text, msg text);
do $$
declare v_state text; v_msg text; v_token text;
begin
  foreach v_token in array array[(select token from expired), 'no-such-token-at-all'] loop
    begin
      perform public.redeem_circle_invite(v_token);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      insert into expired_errs values (v_state, v_msg);
    end;
  end loop;
end $$;
select t.eq((select count(*) from expired_errs), 2::bigint, 'expired and missing both refused');
select t.eq((select count(distinct (state, msg)) from expired_errs), 1::bigint, 'expired link error is identical to a missing token');
select t.ok((select bool_and(msg not ilike '%Work%') from expired_errs), 'expired link error leaks no circle name');
reset role;

-- ===== Server actions (service role) =====
set role service_role;
select t.eq(can_user_see_plan(:P_COLLEGE, :B), true, 'server: member can see');
select t.eq(can_user_see_plan(:P_COLLEGE, :C), false, 'server: non-member cannot');
select t.eq(can_user_see_plan(:P_COLLEGE, null), false, 'server: signed out cannot');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle) values ('f3f3f3f3-0000-0000-0000-000000000003', 'x', '@x')$$,
  'plan_unavailable', 'interest: signed-out on a circle plan refused');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle, user_id) values ('f3f3f3f3-0000-0000-0000-000000000003', 'x', '@x', 'cccccccc-0000-0000-0000-00000000000c')$$,
  'plan_unavailable', 'interest: non-member refused');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle) values ('99999999-0000-0000-0000-000000000009', 'x', '@x')$$,
  'plan_unavailable', 'interest: missing plan gives the same error');
insert into interests (plan_id, visitor_name, contact_handle, user_id) values (:P_COLLEGE, 'Bob', '@bob', :B);
select t.ok(true, 'interest: member allowed');
select t.throws($$insert into interests (plan_id, visitor_name, contact_handle, user_id) values ('f3f3f3f3-0000-0000-0000-000000000003', 'Bob', '@bob', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'duplicate key', 'interest: one per signed-in user per plan');
insert into interests (plan_id, visitor_name, contact_handle) values (:P_UNLISTED, 'Anon', '@anon');
select t.ok(true, 'interest: unlisted still accepts signed-out interest');
reset role;

-- ===== Circle settings: owner only =====
set role authenticated; select t.as_user(:A);
insert into circle_settings (circle_id, owner_id, preselect_for_new_plans, default_capacity, default_invite_days, default_invite_max_uses)
  values (:COLLEGE, :A, true, 6, 30, 5);
select t.eq((select default_capacity from circle_settings where circle_id = :COLLEGE), 6, 'owner reads their circle settings');
update circle_settings set default_capacity = 8 where circle_id = :COLLEGE;
select t.eq((select default_capacity from circle_settings where circle_id = :COLLEGE), 8, 'owner updates their circle settings');
select t.throws($$insert into circle_settings (circle_id, owner_id) values ('c3c3c3c3-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  'row-level security', 'owner cannot attach settings to someone else''s circle');
select t.throws($$update circle_settings set default_invite_days = 91$$, 'check constraint', 'settings invite days capped at 90');
reset role;
set role anon; select t.as_user(null);
select t.throws('select * from circle_settings', 'permission denied', 'signed out: cannot read circle settings');
select t.throws($$insert into circle_settings (circle_id, owner_id) values ('c2c2c2c2-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  'permission denied', 'signed out: cannot write circle settings');
reset role;
set role authenticated; select t.as_user(:B);
select t.eq((select count(*) from circle_settings), 0::bigint, 'member: cannot read the settings of a circle they''re in');
select t.ok((select count(*) from circles where id = :COLLEGE) = 1, '...even though they can read its name');
update circle_settings set default_capacity = 1 where circle_id = :COLLEGE;  -- RLS: matches nothing
select t.throws($$insert into circle_settings (circle_id, owner_id) values ('c2c2c2c2-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b')$$,
  'violates', 'member: cannot create settings for someone else''s circle');
select t.throws($$insert into circle_settings (circle_id, owner_id) values ('c2c2c2c2-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a')$$,
  'row-level security', 'member: cannot write settings posing as the owner');
select t.throws('delete from circle_settings', 'permission denied', 'nobody deletes settings directly (the circle''s cascade does)');
reset role;
set role authenticated; select t.as_user(:C);
select t.eq((select count(*) from circle_settings), 0::bigint, 'non-member: cannot read circle settings');
update circle_settings set preselect_for_new_plans = false;  -- RLS: matches nothing
reset role;
select t.eq((select (default_capacity, preselect_for_new_plans)::text from circle_settings where circle_id = :COLLEGE), '(8,t)',
  'non-owners'' updates changed nothing');

-- ===== Leaving, removal, circle deletion =====
set role authenticated; select t.as_user(:B);
delete from circle_members where user_id = :D;  -- RLS: matches no rows for a non-owner
delete from circle_members where user_id = :B;
reset role;
select t.eq((select count(*) from circle_members where user_id = :D), 1::bigint, 'member cannot remove others');
set role authenticated; select t.as_user(:B);
select t.eq(get_shared_plans(:A), '[]'::jsonb, 'member who left loses access');
reset role;
set role authenticated; select t.as_user(:A);
delete from circles where id = :COLLEGE;
reset role;
set role authenticated; select t.as_user(:D);
select t.eq(get_shared_plan(:P_COLLEGE), null::jsonb, 'deleting the circle hides its plans');
reset role;
select t.eq((select visibility from plans where id = :P_COLLEGE), 'circles', 'plan stays circles-only (visible to owner alone), never falls back to public');
select t.eq((select count(*) from circle_settings where circle_id = :COLLEGE), 0::bigint, 'deleting a circle deletes its settings');
