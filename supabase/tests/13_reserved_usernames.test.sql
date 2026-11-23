-- Reserved usernames are enforced by the database, not just the app.
\set ON_ERROR_STOP 1
select t.make_user('aaaaaaaa-0000-0000-0000-000000000001', 'alice');

-- ===== Every reserved name is rejected, on profiles and in history =====
select t.ok(is_reserved_username('demo') and is_reserved_username('DeMo') and is_reserved_username('_next'), 'reserved names match case-insensitively');
select t.ok(not is_reserved_username('demo_fan') and not is_reserved_username('alice'), 'similar names are fine');

insert into auth.users (id) values ('bbbbbbbb-0000-0000-0000-000000000002');
select t.throws($$insert into profiles (id, username, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'demo', 'Demo')$$,
  'profiles_username_not_reserved', 'a new profile can''t be called demo');
select t.throws($$insert into profiles (id, username, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'dashboard', 'D')$$,
  'profiles_username_not_reserved', '...or dashboard');

set role authenticated; select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.throws($$update profiles set username = 'settings' where id = auth.uid()$$,
  'profiles_username_not_reserved', 'renaming to a reserved name is rejected');
select t.eq((select username from profiles where id = auth.uid()), 'alice', '...and nothing changed');
reset role;
select t.eq((select count(*) from username_history), 0::bigint, '...and no history was written');

select t.throws($$insert into username_history (username, user_id) values ('login', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  'username_history_not_reserved', 'history can''t hold a reserved name either');

-- Every name in the list, checked one by one (the unit test keeps the list equal to the app's).
do $$
declare
  v_name text;
begin
  foreach v_name in array array['login','logout','onboarding','dashboard','auth','api','admin','settings','about','help','radar','_next','join','demo'] loop
    begin
      insert into profiles (id, username, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002', v_name, 'x');
      raise exception 'FAIL: % was accepted', v_name;
    exception when check_violation then
      null;
    end;
  end loop;
  raise notice 'PASS  all 14 reserved names rejected on insert';
end $$;

-- ===== username_available: reserved names are never available =====
set role authenticated; select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.eq(username_available('demo'), false, 'demo is not available');
select t.eq(username_available('Join'), false, 'reserved, any case');
select t.eq(username_available('demo_fan'), true, 'a similar free name is available');
select t.eq(username_available('alice'), true, 'your own current name still counts as yours');
reset role;
