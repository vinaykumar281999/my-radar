-- Helpers that need the schema's tables to exist.
-- Seed a signed-up, onboarded user (as the database owner, bypassing RLS).
create function t.make_user(p_id uuid, p_username text, p_name text default null) returns void language sql as $$
  insert into auth.users (id) values (p_id);
  insert into public.profiles (id, username, display_name) values (p_id, p_username, coalesce(p_name, initcap(p_username)));
$$;

grant execute on all functions in schema t to anon, authenticated, service_role;
revoke execute on function t.make_user(uuid, text, text) from anon, authenticated, service_role;
