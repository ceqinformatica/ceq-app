-- =============================================================
-- App CEQ: horarios de clases oficiales
--  * el admin sube el PDF del horario de clases de una carrera (casi
--    siempre escaneado); la app lo lee con OCR, el admin revisa las
--    clases y lo publica;
--  * los estudiantes de esa carrera ven el horario publicado y cargan sus
--    clases a la agenda con un toque.
-- Se puede volver a ejecutar sin problema.
-- =============================================================

create table if not exists public.horarios_clases (
  id            uuid primary key default gen_random_uuid(),
  carrera_id    uuid not null references public.carreras(id) on delete cascade,
  plan_anio     smallint check (plan_anio is null or plan_anio between 2000 and 2100),
  titulo        text not null check (char_length(btrim(titulo)) between 3 and 120),
  pdf_path      text,
  publicado     boolean not null default false,
  publicado_en  timestamptz,
  creado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists horarios_clases_carrera on public.horarios_clases (carrera_id, publicado_en desc);
drop trigger if exists horarios_clases_updated on public.horarios_clases;
create trigger horarios_clases_updated before update on public.horarios_clases
  for each row execute function public.set_updated_at();

create table if not exists public.clases_oficiales (
  id           uuid primary key default gen_random_uuid(),
  horario_id   uuid not null references public.horarios_clases(id) on delete cascade,
  materia      text not null check (char_length(btrim(materia)) between 2 and 150),
  nivel        smallint check (nivel is null or nivel between 1 and 12),
  seccion      text check (seccion is null or char_length(seccion) <= 20),
  dia_semana   smallint not null check (dia_semana between 1 and 7),
  hora_inicio  time not null,
  hora_fin     time not null,
  aula         text check (aula is null or char_length(aula) <= 60),
  tipo_clase   text check (tipo_clase is null or tipo_clase in ('teoria', 'rp', 'laboratorio')),
  created_at   timestamptz not null default now(),
  constraint clases_oficiales_horas check (hora_fin > hora_inicio)
);
create index if not exists clases_oficiales_horario on public.clases_oficiales (horario_id, dia_semana, hora_inicio);

alter table public.horarios_clases enable row level security;
alter table public.clases_oficiales enable row level security;
revoke all on public.horarios_clases, public.clases_oficiales from anon;
revoke truncate, references, trigger on public.horarios_clases, public.clases_oficiales from authenticated;
grant select, insert, update, delete on public.horarios_clases, public.clases_oficiales to authenticated;

-- Los estudiantes ven solo lo publicado; el admin ve también los borradores.
drop policy if exists "ver horarios de clases" on public.horarios_clases;
create policy "ver horarios de clases" on public.horarios_clases for select to authenticated
  using (publicado or (select public.es_admin()));
drop policy if exists "admin carga horarios de clases" on public.horarios_clases;
create policy "admin carga horarios de clases" on public.horarios_clases for insert to authenticated
  with check ((select public.es_admin()) and not publicado);
drop policy if exists "admin edita horarios de clases" on public.horarios_clases;
create policy "admin edita horarios de clases" on public.horarios_clases for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra horarios de clases" on public.horarios_clases;
create policy "admin borra horarios de clases" on public.horarios_clases for delete to authenticated
  using ((select public.es_admin()));

drop policy if exists "ver clases oficiales" on public.clases_oficiales;
create policy "ver clases oficiales" on public.clases_oficiales for select to authenticated
  using (exists (select 1 from public.horarios_clases h where h.id = horario_id and (h.publicado or (select public.es_admin()))));
drop policy if exists "admin carga clases oficiales" on public.clases_oficiales;
create policy "admin carga clases oficiales" on public.clases_oficiales for insert to authenticated
  with check ((select public.es_admin()));
drop policy if exists "admin edita clases oficiales" on public.clases_oficiales;
create policy "admin edita clases oficiales" on public.clases_oficiales for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra clases oficiales" on public.clases_oficiales;
create policy "admin borra clases oficiales" on public.clases_oficiales for delete to authenticated
  using ((select public.es_admin()));

-- Guarda todas las clases de un horario de una vez (reemplaza las que
-- había): o se guardan todas o ninguna.
create or replace function public.guardar_clases_oficiales(p_horario uuid, p_clases jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  if not exists (select 1 from public.horarios_clases where id = p_horario) then
    raise exception 'Ese horario ya no existe';
  end if;
  if jsonb_typeof(p_clases) <> 'array' then raise exception 'Formato de clases inválido'; end if;
  if jsonb_array_length(p_clases) > 3000 then raise exception 'Demasiadas clases en un solo horario'; end if;
  delete from public.clases_oficiales where horario_id = p_horario;
  insert into public.clases_oficiales (horario_id, materia, nivel, seccion, dia_semana, hora_inicio, hora_fin, aula, tipo_clase)
  select p_horario, btrim(c ->> 'materia'), nullif(c ->> 'nivel', '')::smallint,
         nullif(btrim(coalesce(c ->> 'seccion', '')), ''), (c ->> 'dia_semana')::smallint,
         (c ->> 'hora_inicio')::time, (c ->> 'hora_fin')::time,
         nullif(btrim(coalesce(c ->> 'aula', '')), ''), nullif(c ->> 'tipo_clase', '')
  from jsonb_array_elements(p_clases) c;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.guardar_clases_oficiales(uuid, jsonb) from public, anon;
grant execute on function public.guardar_clases_oficiales(uuid, jsonb) to authenticated;

-- Publica el horario y, si se pide, avisa a los estudiantes de la carrera.
-- Volver a publicar no vuelve a notificar.
create or replace function public.publicar_horario_clases(p_id uuid, p_notificar boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  h public.horarios_clases;
  n integer;
  carrera text;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  select * into h from public.horarios_clases where id = p_id for update;
  if not found then raise exception 'Ese horario ya no existe'; end if;
  select count(*) into n from public.clases_oficiales where horario_id = p_id;
  if n = 0 then raise exception 'El horario no tiene clases: agregá al menos una antes de publicarlo'; end if;
  if h.publicado then return n; end if;

  update public.horarios_clases set publicado = true, publicado_en = coalesce(publicado_en, now()) where id = p_id;
  if p_notificar and h.publicado_en is null then
    select coalesce(c.sigla, c.nombre) into carrera from public.carreras c where c.id = h.carrera_id;
    insert into public.notificaciones (tipo, titulo, cuerpo, ruta, carrera_id, programada_para)
    values ('mensaje', 'Salió el horario de clases',
            left('Ya está el horario de clases de ' || coalesce(carrera, 'tu carrera') || ' (' || btrim(h.titulo) || '). Cargá tus clases a la agenda con un toque.', 500),
            '/agenda', h.carrera_id, now());
  end if;
  return n;
end;
$$;
revoke all on function public.publicar_horario_clases(uuid, boolean) from public, anon;
grant execute on function public.publicar_horario_clases(uuid, boolean) to authenticated;

-- PDF original: privado; lo ve el admin y, una vez publicado, los estudiantes.
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('horarios-clases', 'horarios-clases', false, 20971520, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "horarios-clases: ver" on storage.objects;
  create policy "horarios-clases: ver" on storage.objects for select to authenticated
    using (bucket_id = 'horarios-clases' and ((select public.es_admin())
      or exists (select 1 from public.horarios_clases h where h.pdf_path = name and h.publicado)));
  drop policy if exists "horarios-clases: subir" on storage.objects;
  create policy "horarios-clases: subir" on storage.objects for insert to authenticated
    with check (bucket_id = 'horarios-clases' and (select public.es_admin()));
  drop policy if exists "horarios-clases: borrar" on storage.objects;
  create policy "horarios-clases: borrar" on storage.objects for delete to authenticated
    using (bucket_id = 'horarios-clases' and (select public.es_admin()));
end $$;

-- Resumen del panel: también cuenta los horarios de clases en borrador.
create or replace function public.pendientes_panel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para administradores';
  end if;
  return jsonb_build_object(
    'carnets_pendientes', (select count(*) from public.solicitudes_carnet where estado = 'pendiente'),
    'ventanas_activas', (select count(*) from public.ventanas where activa and desde <= now() and (hasta is null or hasta > now())),
    'horarios_borrador', (select count(*) from public.horarios_finales where not publicado),
    'clases_borrador', (select count(*) from public.horarios_clases where not publicado)
  );
end;
$$;
revoke execute on function public.pendientes_panel() from public, anon;
grant execute on function public.pendientes_panel() to authenticated;
