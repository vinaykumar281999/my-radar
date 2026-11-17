-- Minimal Supabase stand-ins + test helpers, loaded before schema.sql.
create schema auth;
create table auth.users (id uuid primary key);
-- Same contract as Supabase: the signed-in user's id from the request JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

create schema t;

-- Act as a user for the following statements: `set role authenticated; select t.as_user('...');`
create function t.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;

create function t.ok(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

create function t.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

-- The statement must fail with an error message containing p_like.
create function t.throws(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then
      raise notice 'PASS  % (% %)', p_label, sqlstate, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % (wanted error like "%", got % "%")', p_label, p_like, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (wanted error like "%", but it succeeded)', p_label, p_like;
end $$;

grant usage on schema t to anon, authenticated, service_role;
