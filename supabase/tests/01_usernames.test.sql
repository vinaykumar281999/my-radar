-- Username changes: reservation, take-back, rename cap, redirects lookup.
\set ON_ERROR_STOP 1
select t.make_user('aaaaaaaa-0000-0000-0000-000000000001', 'alice');
select t.make_user('bbbbbbbb-0000-0000-0000-000000000002', 'bob');

set role authenticated;
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update profiles set username = 'alice2' where id = auth.uid();

select t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select t.throws($$update profiles set username = 'alice' where id = auth.uid()$$, 'username_reserved',
  'another user cannot take a renamed user''s old name');
select t.eq(username_available('alice'), false, 'old name is unavailable to others');

reset role; set role anon; select t.as_user(null);
select t.eq(resolve_username('alice'), 'alice2', 'old name resolves to the current one');
select t.eq(resolve_username('nobody_here'), null::text, 'unknown name resolves to null');
select t.throws('select * from username_history', 'permission denied', 'anon cannot read username history');

reset role; set role authenticated;
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.eq(username_available('alice'), true, 'owner can take their old name back');
update profiles set username = 'alice' where id = auth.uid();
reset role;
select t.eq((select string_agg(username, ',') from username_history), 'alice2', 'taking a name back removes it from history');

set role authenticated;
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
do $$
begin
  for i in 1..9 loop
    update profiles set username = 'alice_v' || i where id = auth.uid();
  end loop;
end $$;
select t.throws($$update profiles set username = 'alice_v99' where id = auth.uid()$$, 'too_many_username_changes',
  'renames are capped at 10 reserved old names');
