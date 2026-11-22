-- Imitación mínima de lo que Supabase trae de fábrica (roles, esquema auth
-- y permisos por defecto), para probar las migraciones en un Postgres común.
-- Solo para pruebas locales o en GitHub Actions: NUNCA ejecutar en Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Imitación de pg_net: en vez de llamar a Expo, guarda cada pedido para
-- que las pruebas vean qué se habría enviado.
create schema net;
create table net._http_response (id bigint primary key, status_code integer, content text);
create table net.pedidos (id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                              headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$
  insert into net.pedidos (url, body, headers) values (url, body, headers) returning id;
$$;
