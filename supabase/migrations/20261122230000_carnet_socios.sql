-- Carnet de socio del CEQ con QR verificable.
--
-- El carnet tiene costo: solo lo tiene quien pagó y fue dado de alta por
-- el CEQ desde el panel (tabla socios, que solo edita un admin). El QR
-- lleva un código al azar, sin datos personales; lo verifica una cuenta
-- validadora o admin con verificar_carnet(), que deja registro.
-- Se puede ejecutar más de una vez sin romper nada.

-- ---------------------------------------------------------------
-- Columnas nuevas en socios
-- ---------------------------------------------------------------
create sequence if not exists public.numero_socio_seq start 1;

alter table public.socios
  add column if not exists codigo_qr   text,
  add column if not exists activo      boolean not null default true,
  add column if not exists pagado_en   date,
  add column if not exists observacion text,
  add column if not exists created_at  timestamptz not null default now();

update public.socios set codigo_qr = replace(gen_random_uuid()::text, '-', '') where codigo_qr is null;
alter table public.socios alter column codigo_qr set default replace(gen_random_uuid()::text, '-', '');
alter table public.socios alter column codigo_qr set not null;
create unique index if not exists socios_codigo_qr_key on public.socios (codigo_qr);

-- Número de socio automático (CEQ-0001) si el admin no pone uno.
-- La cuenta del estudiante NO se vincula sola por C.I. (cualquiera podría
-- escribir la C.I. de otro en su perfil): la elige el admin al dar el alta.
create or replace function public.socios_completar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.ci := regexp_replace(coalesce(new.ci, ''), '[^0-9A-Za-z]', '', 'g');
  if new.ci = '' then raise exception 'Falta la cédula del socio'; end if;
  if new.numero_socio is null or btrim(new.numero_socio) = '' then
    new.numero_socio := 'CEQ-' || lpad(nextval('public.numero_socio_seq')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists socios_completar on public.socios;
create trigger socios_completar before insert or update of ci, numero_socio on public.socios
  for each row execute function public.socios_completar();
grant usage on sequence public.numero_socio_seq to authenticated;

-- ---------------------------------------------------------------
-- Registro de verificaciones
-- ---------------------------------------------------------------
create table if not exists public.verificaciones_carnet (
  id           uuid primary key default gen_random_uuid(),
  socio_id     uuid references public.socios(id) on delete cascade,
  validador_id uuid references auth.users(id) on delete set null default auth.uid(),
  resultado    text not null check (resultado in ('vigente', 'vencido', 'inactivo', 'no_encontrado')),
  created_at   timestamptz not null default now()
);
create index if not exists verificaciones_carnet_socio on public.verificaciones_carnet (socio_id, created_at desc);
alter table public.verificaciones_carnet enable row level security;
drop policy if exists "admin ve verificaciones" on public.verificaciones_carnet;
create policy "admin ve verificaciones" on public.verificaciones_carnet for select to authenticated
  using ((select public.es_admin()));
revoke insert, update, delete on public.verificaciones_carnet from anon, authenticated;

-- ---------------------------------------------------------------
-- verificar_carnet: recibe lo que leyó la cámara (CEQ1:<código>), el
-- código suelto, el número de socio o la C.I. Solo validador o admin.
-- ---------------------------------------------------------------
create or replace function public.verificar_carnet(p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text := btrim(coalesce(p_texto, ''));
  s public.socios;
  carrera text;
  res text;
begin
  if not public.es_validador() then
    raise exception 'Solo las cuentas del CEQ pueden verificar carnets';
  end if;
  if t ilike 'CEQ1:%' then t := substr(t, 6); end if;
  if t = '' then raise exception 'Escaneá el QR o escribí el número de socio'; end if;

  select * into s from public.socios where codigo_qr = lower(t);
  if not found then select * into s from public.socios where upper(numero_socio) = upper(t); end if;
  if not found then
    select * into s from public.socios where ci = regexp_replace(t, '[^0-9A-Za-z]', '', 'g');
  end if;

  if s.id is null then
    insert into public.verificaciones_carnet (socio_id, resultado) values (null, 'no_encontrado');
    return jsonb_build_object('resultado', 'no_encontrado');
  end if;

  res := case
    when not s.activo then 'inactivo'
    when s.vigente_hasta is not null and s.vigente_hasta < (now() at time zone 'America/Asuncion')::date then 'vencido'
    else 'vigente' end;
  select c.nombre into carrera from public.perfiles p join public.carreras c on c.id = p.carrera_id where p.id = s.usuario_id;
  insert into public.verificaciones_carnet (socio_id, resultado) values (s.id, res);

  return jsonb_build_object(
    'resultado', res,
    'socio_id', s.id,
    'nombre', s.nombre,
    'numero_socio', s.numero_socio,
    'ci', s.ci,
    'carrera', carrera,
    'vigente_hasta', s.vigente_hasta,
    'foto_path', s.foto_path,
    'con_cuenta', s.usuario_id is not null
  );
end $$;
revoke all on function public.verificar_carnet(text) from public, anon;
grant execute on function public.verificar_carnet(text) to authenticated;

-- El dueño (o un admin) cambia el código del QR, por ejemplo si alguien
-- le sacó una captura. El código viejo deja de servir.
create or replace function public.renovar_codigo_carnet(p_socio uuid)
returns text language plpgsql security definer set search_path = public as $$
declare nuevo text := replace(gen_random_uuid()::text, '-', '');
begin
  update public.socios set codigo_qr = nuevo
  where id = p_socio and (usuario_id = auth.uid() or public.es_admin());
  if not found then raise exception 'No podés cambiar ese carnet'; end if;
  return nuevo;
end $$;
revoke all on function public.renovar_codigo_carnet(uuid) from public, anon;
grant execute on function public.renovar_codigo_carnet(uuid) to authenticated;

-- El socio pone su foto (subida antes a carnets/<su id>/...). Un admin
-- puede poner o sacar la de cualquiera.
create or replace function public.poner_foto_carnet(p_socio uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_path is not null and not public.es_admin()
     and split_part(p_path, '/', 1) <> coalesce(auth.uid()::text, '') then
    raise exception 'La foto tiene que estar en tu carpeta';
  end if;
  update public.socios set foto_path = p_path
  where id = p_socio and (usuario_id = auth.uid() or public.es_admin());
  if not found then raise exception 'No podés cambiar ese carnet'; end if;
end $$;
revoke all on function public.poner_foto_carnet(uuid, text) from public, anon;
grant execute on function public.poner_foto_carnet(uuid, text) to authenticated;

-- Para dar de alta: el admin busca la cuenta del estudiante por nombre,
-- C.I. o correo.
create or replace function public.buscar_estudiantes(p_texto text)
returns table (id uuid, nombre text, ci text, correo text, carrera text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo admin'; end if;
  if length(btrim(coalesce(p_texto, ''))) < 2 then return; end if;
  return query
    select p.id, p.nombre, p.ci, u.email::text, c.nombre
    from public.perfiles p
    join auth.users u on u.id = p.id
    left join public.carreras c on c.id = p.carrera_id
    where p.nombre ilike '%' || btrim(p_texto) || '%'
       or p.ci ilike '%' || btrim(p_texto) || '%'
       or u.email ilike '%' || btrim(p_texto) || '%'
    order by p.nombre
    limit 20;
end $$;
revoke all on function public.buscar_estudiantes(text) from public, anon;
grant execute on function public.buscar_estudiantes(text) to authenticated;

-- ---------------------------------------------------------------
-- Fotos del carnet: bucket privado "carnets", una carpeta por usuario.
-- (Solo si existe Storage; en el Postgres de pruebas puede no estar.)
-- ---------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  insert into storage.buckets (id, name, public) values ('carnets', 'carnets', false)
  on conflict (id) do nothing;

  drop policy if exists "carnets: ver" on storage.objects;
  create policy "carnets: ver" on storage.objects for select to authenticated
    using (bucket_id = 'carnets' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_validador())));
  drop policy if exists "carnets: subir" on storage.objects;
  create policy "carnets: subir" on storage.objects for insert to authenticated
    with check (bucket_id = 'carnets' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_admin())));
  drop policy if exists "carnets: reemplazar" on storage.objects;
  create policy "carnets: reemplazar" on storage.objects for update to authenticated
    using (bucket_id = 'carnets' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_admin())));
  drop policy if exists "carnets: borrar" on storage.objects;
  create policy "carnets: borrar" on storage.objects for delete to authenticated
    using (bucket_id = 'carnets' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_admin())));
end $$;
