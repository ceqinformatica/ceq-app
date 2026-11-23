-- Validar el carnet físico desde la app.
--
-- El carnet del CEQ dura 3 años (6 semestres). Quien ya lo pagó y tiene
-- el carnet físico le saca una foto en la app y carga su vencimiento; si
-- no está vencido queda una solicitud pendiente, y el CEQ la aprueba con
-- un toque desde el panel (mirando la foto). Al aprobarla se habilita el
-- carnet digital con QR. La foto va a un bucket privado aparte, que solo
-- ven el dueño y el admin.
-- Se puede ejecutar más de una vez sin romper nada.

create table if not exists public.solicitudes_carnet (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nombre        text not null,
  ci            text not null,
  numero_socio  text,
  vigente_hasta date not null,
  foto_path     text not null,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo        text,
  revisado_por  uuid references auth.users(id) on delete set null,
  revisado_en   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists solicitudes_carnet_una_pendiente
  on public.solicitudes_carnet (usuario_id) where estado = 'pendiente';
create index if not exists solicitudes_carnet_estado on public.solicitudes_carnet (estado, created_at);

alter table public.solicitudes_carnet enable row level security;
drop policy if exists "ver solicitudes de carnet" on public.solicitudes_carnet;
create policy "ver solicitudes de carnet" on public.solicitudes_carnet for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));
-- Nadie escribe directo: se usa solicitar_carnet() y las funciones del admin.
revoke insert, update, delete on public.solicitudes_carnet from anon, authenticated;

-- ---------------------------------------------------------------
-- El estudiante envía (o reemplaza) su solicitud.
-- ---------------------------------------------------------------
create or replace function public.solicitar_carnet(
  p_nombre text, p_ci text, p_numero text, p_vence date, p_foto text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hoy date := (now() at time zone 'America/Asuncion')::date;
  v_ci text := regexp_replace(coalesce(p_ci, ''), '[^0-9A-Za-z]', '', 'g');
  nueva uuid;
begin
  if uid is null then raise exception 'Iniciá sesión para validar tu carnet'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then raise exception 'Escribí tu nombre completo'; end if;
  if length(v_ci) < 4 or length(v_ci) > 12 then raise exception 'Revisá tu número de cédula'; end if;
  if p_foto is null or split_part(p_foto, '/', 1) <> uid::text then raise exception 'Falta la foto del carnet'; end if;
  if p_vence is null then raise exception 'Elegí la fecha de vencimiento del carnet'; end if;
  if p_vence < hoy then
    raise exception 'Tu carnet está vencido. Renovalo en la sede del CEQ para tener el carnet digital';
  end if;
  if p_vence > (hoy + interval '3 years 1 month')::date then
    raise exception 'Esa fecha de vencimiento no es posible: el carnet dura 3 años';
  end if;
  if exists (select 1 from public.socios s where s.usuario_id = uid and s.activo
             and (s.vigente_hasta is null or s.vigente_hasta >= hoy)) then
    raise exception 'Ya tenés tu carnet digital habilitado';
  end if;
  if exists (select 1 from public.socios s where (s.usuario_id = uid or s.ci = v_ci) and not s.activo) then
    raise exception 'Tu carnet fue dado de baja por el CEQ. Consultá en la sede';
  end if;

  update public.solicitudes_carnet
     set nombre = btrim(p_nombre), ci = v_ci, numero_socio = nullif(btrim(coalesce(p_numero, '')), ''),
         vigente_hasta = p_vence, foto_path = p_foto, created_at = now()
   where usuario_id = uid and estado = 'pendiente'
  returning id into nueva;
  if nueva is null then
    insert into public.solicitudes_carnet (usuario_id, nombre, ci, numero_socio, vigente_hasta, foto_path)
    values (uid, btrim(p_nombre), v_ci, nullif(btrim(coalesce(p_numero, '')), ''), p_vence, p_foto)
    returning id into nueva;
  end if;
  return nueva;
end $$;
revoke all on function public.solicitar_carnet(text, text, text, date, text) from public, anon;
grant execute on function public.solicitar_carnet(text, text, text, date, text) to authenticated;

-- ---------------------------------------------------------------
-- El admin aprueba: crea o renueva el socio y habilita el carnet.
-- ---------------------------------------------------------------
-- Se aprueba la versión que el admin vio: si el estudiante la reenvió
-- mientras tanto (cambia created_at), hay que volver a mirarla.
drop function if exists public.aprobar_solicitud_carnet(uuid);
create or replace function public.aprobar_solicitud_carnet(p_id uuid, p_version timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sol public.solicitudes_carnet;
  socio_id uuid;
begin
  if not public.es_admin() then raise exception 'Solo admin'; end if;
  select * into sol from public.solicitudes_carnet where id = p_id and estado = 'pendiente' for update;
  if not found then raise exception 'La solicitud ya fue revisada o no existe'; end if;
  if sol.created_at is distinct from p_version then
    raise exception 'El estudiante cambió la solicitud. Actualizá la lista y revisala de nuevo';
  end if;

  if sol.numero_socio is not null and exists (
       select 1 from public.socios where upper(numero_socio) = upper(sol.numero_socio)
         and usuario_id is distinct from sol.usuario_id and ci <> sol.ci) then
    raise exception 'El número de socio % ya es de otra persona', sol.numero_socio;
  end if;

  if exists (select 1 from public.socios where ci = sol.ci and usuario_id is not null and usuario_id <> sol.usuario_id) then
    raise exception 'Esa cédula ya tiene el carnet habilitado en otra cuenta';
  end if;

  -- 1) Ya tenía socio con su cuenta: se renueva.
  select id into socio_id from public.socios where usuario_id = sol.usuario_id;
  -- 2) El CEQ lo había cargado sin cuenta, con la misma cédula: se vincula.
  if socio_id is null then
    select id into socio_id from public.socios where ci = sol.ci and usuario_id is null;
  end if;

  if socio_id is not null then
    update public.socios
       set usuario_id = sol.usuario_id, nombre = sol.nombre, ci = sol.ci,
           numero_socio = coalesce(sol.numero_socio, numero_socio),
           vigente_hasta = sol.vigente_hasta, activo = true
     where id = socio_id;
  else
    insert into public.socios (usuario_id, nombre, ci, numero_socio, vigente_hasta, activo)
    values (sol.usuario_id, sol.nombre, sol.ci, sol.numero_socio, sol.vigente_hasta, true)
    returning id into socio_id;
  end if;

  update public.solicitudes_carnet
     set estado = 'aprobada', revisado_por = auth.uid(), revisado_en = now(), motivo = null
   where id = p_id;
  return socio_id;
end $$;
revoke all on function public.aprobar_solicitud_carnet(uuid, timestamptz) from public, anon;
grant execute on function public.aprobar_solicitud_carnet(uuid, timestamptz) to authenticated;

create or replace function public.rechazar_solicitud_carnet(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo admin'; end if;
  update public.solicitudes_carnet
     set estado = 'rechazada', motivo = nullif(btrim(coalesce(p_motivo, '')), ''), revisado_por = auth.uid(), revisado_en = now()
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'La solicitud ya fue revisada o no existe'; end if;
end $$;
revoke all on function public.rechazar_solicitud_carnet(uuid, text) from public, anon;
grant execute on function public.rechazar_solicitud_carnet(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- Fotos de las solicitudes: bucket privado, solo dueño y admin.
-- ---------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('solicitudes-carnet', 'solicitudes-carnet', false, 8388608, array['image/jpeg', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "solicitudes-carnet: ver" on storage.objects;
  create policy "solicitudes-carnet: ver" on storage.objects for select to authenticated
    using (bucket_id = 'solicitudes-carnet' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_admin())));
  drop policy if exists "solicitudes-carnet: subir" on storage.objects;
  create policy "solicitudes-carnet: subir" on storage.objects for insert to authenticated
    with check (bucket_id = 'solicitudes-carnet' and (storage.foldername(name))[1] = (select auth.uid())::text);
  drop policy if exists "solicitudes-carnet: borrar" on storage.objects;
  create policy "solicitudes-carnet: borrar" on storage.objects for delete to authenticated
    using (bucket_id = 'solicitudes-carnet' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.es_admin())));
end $$;
