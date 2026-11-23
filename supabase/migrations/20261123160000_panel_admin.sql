-- =============================================================
-- Panel del CEQ, segunda parte:
--  1. Aviso al panel (y al celular de cada admin) cuando alguien pide
--     validar su carnet.
--  2. Horarios de finales: el admin sube el PDF de cada carrera, la app
--     detecta materias, llamados, fechas y horas, y al publicarlo le
--     llega a los estudiantes de esa carrera.
--  3. Ventanas flotantes: carteles que el admin arma a gusto (texto,
--     imagen, botón, color, forma, a quién, cuándo y cada cuánto).
-- Se puede ejecutar más de una vez sin romper nada.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Carnets por validar
-- ---------------------------------------------------------------
create or replace function public.avisar_solicitud_carnet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado <> 'pendiente' then return new; end if;
  -- Un reenvío de la misma persona en los últimos 10 minutos no vuelve a avisar.
  if tg_op = 'UPDATE' and old.created_at > now() - interval '10 minutes' then return new; end if;
  insert into public.notificaciones (tipo, titulo, cuerpo, ruta, usuario_id, programada_para, creada_por)
  select 'mensaje', 'Carnet para validar',
         left(coalesce(nullif(btrim(new.nombre), ''), 'Un estudiante') || ' pidió validar su carnet del CEQ. Revisalo en el panel.', 500),
         '/admin/solicitudes-carnet', p.id, now(), null
  from public.perfiles p
  where p.rol = 'admin' and p.id <> new.usuario_id;
  return new;
end;
$$;
revoke execute on function public.avisar_solicitud_carnet() from public, anon, authenticated;

drop trigger if exists solicitudes_carnet_avisar on public.solicitudes_carnet;
create trigger solicitudes_carnet_avisar after insert or update of created_at on public.solicitudes_carnet
  for each row execute function public.avisar_solicitud_carnet();

-- ---------------------------------------------------------------
-- 2. Horarios de finales
-- ---------------------------------------------------------------
create table if not exists public.horarios_finales (
  id            uuid primary key default gen_random_uuid(),
  carrera_id    uuid not null references public.carreras(id) on delete cascade,
  titulo        text not null check (char_length(btrim(titulo)) between 3 and 120),
  pdf_path      text,
  publicado     boolean not null default false,
  publicado_en  timestamptz,
  creado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists horarios_finales_carrera on public.horarios_finales (carrera_id, publicado_en desc);
drop trigger if exists horarios_finales_updated on public.horarios_finales;
create trigger horarios_finales_updated before update on public.horarios_finales
  for each row execute function public.set_updated_at();

create table if not exists public.fechas_finales (
  id          uuid primary key default gen_random_uuid(),
  horario_id  uuid not null references public.horarios_finales(id) on delete cascade,
  materia     text not null check (char_length(btrim(materia)) between 2 and 150),
  llamado     smallint not null check (llamado between 1 and 5),
  fecha       date not null,
  hora        time,
  aula        text check (aula is null or char_length(aula) <= 60),
  created_at  timestamptz not null default now()
);
create index if not exists fechas_finales_horario on public.fechas_finales (horario_id, fecha);

alter table public.horarios_finales enable row level security;
alter table public.fechas_finales enable row level security;
revoke all on public.horarios_finales, public.fechas_finales from anon;
revoke truncate, references, trigger on public.horarios_finales, public.fechas_finales from authenticated;

-- Los estudiantes ven solo lo publicado; el admin ve también los borradores.
drop policy if exists "ver horarios de finales" on public.horarios_finales;
create policy "ver horarios de finales" on public.horarios_finales for select to authenticated
  using (publicado or (select public.es_admin()));
drop policy if exists "admin carga horarios de finales" on public.horarios_finales;
create policy "admin carga horarios de finales" on public.horarios_finales for insert to authenticated
  with check ((select public.es_admin()) and not publicado);
drop policy if exists "admin edita horarios de finales" on public.horarios_finales;
create policy "admin edita horarios de finales" on public.horarios_finales for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra horarios de finales" on public.horarios_finales;
create policy "admin borra horarios de finales" on public.horarios_finales for delete to authenticated
  using ((select public.es_admin()));

drop policy if exists "ver fechas de finales" on public.fechas_finales;
create policy "ver fechas de finales" on public.fechas_finales for select to authenticated
  using (exists (select 1 from public.horarios_finales h where h.id = horario_id and (h.publicado or (select public.es_admin()))));
drop policy if exists "admin carga fechas de finales" on public.fechas_finales;
create policy "admin carga fechas de finales" on public.fechas_finales for insert to authenticated
  with check ((select public.es_admin()));
drop policy if exists "admin edita fechas de finales" on public.fechas_finales;
create policy "admin edita fechas de finales" on public.fechas_finales for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra fechas de finales" on public.fechas_finales;
create policy "admin borra fechas de finales" on public.fechas_finales for delete to authenticated
  using ((select public.es_admin()));

-- Publica el horario y, si se pide, avisa al celular de los estudiantes
-- de esa carrera. Volver a publicar no vuelve a notificar.
create or replace function public.publicar_horario_finales(p_id uuid, p_notificar boolean default true)
returns integer language plpgsql security definer set search_path = public as $$
declare
  h public.horarios_finales;
  n integer;
  carrera text;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  select * into h from public.horarios_finales where id = p_id for update;
  if not found then raise exception 'Ese horario ya no existe'; end if;
  select count(*) into n from public.fechas_finales where horario_id = p_id;
  if n = 0 then raise exception 'El horario no tiene fechas: agregá al menos una antes de publicarlo'; end if;
  if h.publicado then return n; end if;

  update public.horarios_finales set publicado = true, publicado_en = now() where id = p_id;
  if p_notificar then
    select coalesce(c.sigla, c.nombre) into carrera from public.carreras c where c.id = h.carrera_id;
    insert into public.notificaciones (tipo, titulo, cuerpo, ruta, carrera_id, programada_para)
    values ('mensaje', 'Salieron las fechas de finales',
            left('Ya está el horario de finales de ' || coalesce(carrera, 'tu carrera') || ' (' || btrim(h.titulo) || '). Mirá cuándo rendís tus materias.', 500),
            '/finales-fechas', h.carrera_id, now());
  end if;
  return n;
end;
$$;
revoke all on function public.publicar_horario_finales(uuid, boolean) from public, anon;
grant execute on function public.publicar_horario_finales(uuid, boolean) to authenticated;

-- Guarda todas las fechas de un horario de una vez (reemplaza las que
-- había): o se guardan todas o ninguna.
create or replace function public.guardar_fechas_finales(p_horario uuid, p_fechas jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not public.es_admin() then raise exception 'Solo para administradores'; end if;
  if not exists (select 1 from public.horarios_finales where id = p_horario) then
    raise exception 'Ese horario ya no existe';
  end if;
  if jsonb_typeof(p_fechas) <> 'array' then raise exception 'Formato de fechas inválido'; end if;
  if jsonb_array_length(p_fechas) > 2000 then raise exception 'Demasiadas fechas en un solo horario'; end if;
  delete from public.fechas_finales where horario_id = p_horario;
  insert into public.fechas_finales (horario_id, materia, llamado, fecha, hora, aula)
  select p_horario, btrim(f ->> 'materia'), (f ->> 'llamado')::smallint, (f ->> 'fecha')::date,
         nullif(f ->> 'hora', '')::time, nullif(btrim(coalesce(f ->> 'aula', '')), '')
  from jsonb_array_elements(p_fechas) f;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.guardar_fechas_finales(uuid, jsonb) from public, anon;
grant execute on function public.guardar_fechas_finales(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------
-- 3. Ventanas flotantes
-- ---------------------------------------------------------------
create table if not exists public.ventanas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (char_length(btrim(titulo)) between 1 and 80),
  cuerpo         text not null default '' check (char_length(cuerpo) <= 600),
  imagen_url     text check (imagen_url is null or imagen_url ~ '^https://[^\s]+$'),
  icono          text check (icono is null or icono ~ '^[a-z0-9-]{1,40}$'),
  boton_texto    text check (boton_texto is null or char_length(btrim(boton_texto)) between 1 and 30),
  boton_destino  text check (boton_destino is null or boton_destino ~ '^(/[A-Za-z0-9/_-]*|https://[^\s]+)$'),
  -- Color de la ventana: uno de la paleta o un color propio (#RRGGBB).
  color          text not null default 'celeste'
                 check (color ~ '^(celeste|marino|rojo|amarillo|gris|blanco|#[0-9A-Fa-f]{6})$'),
  forma          text not null default 'centro' check (forma in ('centro', 'abajo', 'pantalla')),
  alineacion     text not null default 'centro' check (alineacion in ('izquierda', 'centro')),
  -- Dónde aparece: al abrir el inicio o en cualquier pestaña.
  donde          text not null default 'inicio' check (donde in ('inicio', 'todas')),
  frecuencia     text not null default 'una_vez' check (frecuencia in ('una_vez', 'diaria', 'siempre')),
  cerrable       boolean not null default true,
  carrera_id     uuid references public.carreras(id) on delete cascade,
  desde          timestamptz not null default now(),
  hasta          timestamptz,
  activa         boolean not null default true,
  prioridad      smallint not null default 0 check (prioridad between 0 and 100),
  creada_por     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (hasta is null or hasta > desde),
  check ((boton_texto is null) = (boton_destino is null))
);
create index if not exists ventanas_vigentes on public.ventanas (desde, hasta) where activa;
drop trigger if exists ventanas_updated on public.ventanas;
create trigger ventanas_updated before update on public.ventanas
  for each row execute function public.set_updated_at();

alter table public.ventanas enable row level security;
revoke all on public.ventanas from anon;
revoke truncate, references, trigger on public.ventanas from authenticated;

drop policy if exists "ver ventanas" on public.ventanas;
create policy "ver ventanas" on public.ventanas for select to authenticated
  using (
    (select public.es_admin())
    or (activa and desde <= now() and (hasta is null or hasta > now())
        and (carrera_id is null or carrera_id = (select public.mi_carrera())))
  );
drop policy if exists "admin crea ventanas" on public.ventanas;
create policy "admin crea ventanas" on public.ventanas for insert to authenticated
  with check ((select public.es_admin()));
drop policy if exists "admin edita ventanas" on public.ventanas;
create policy "admin edita ventanas" on public.ventanas for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra ventanas" on public.ventanas;
create policy "admin borra ventanas" on public.ventanas for delete to authenticated
  using ((select public.es_admin()));

-- ---------------------------------------------------------------
-- Lo que el panel tiene pendiente (aparte de resumen_admin, para no
-- pisarlo si se vuelve a ejecutar la migración de notificaciones).
-- ---------------------------------------------------------------
create or replace function public.pendientes_panel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para administradores';
  end if;
  return jsonb_build_object(
    'carnets_pendientes', (select count(*) from public.solicitudes_carnet where estado = 'pendiente'),
    'ventanas_activas', (select count(*) from public.ventanas where activa and desde <= now() and (hasta is null or hasta > now())),
    'horarios_borrador', (select count(*) from public.horarios_finales where not publicado)
  );
end;
$$;
revoke execute on function public.pendientes_panel() from public, anon;
grant execute on function public.pendientes_panel() to authenticated;

-- ---------------------------------------------------------------
-- Archivos: PDF de horarios (privado, lo ve quien inició sesión) e
-- imágenes de las ventanas (públicas, para mostrarlas rápido).
-- Solo el admin sube o borra.
-- ---------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('horarios-finales', 'horarios-finales', false, 20971520, array['application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ventanas', 'ventanas', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "horarios-finales: ver" on storage.objects;
  create policy "horarios-finales: ver" on storage.objects for select to authenticated
    using (bucket_id = 'horarios-finales');
  drop policy if exists "horarios-finales: subir" on storage.objects;
  create policy "horarios-finales: subir" on storage.objects for insert to authenticated
    with check (bucket_id = 'horarios-finales' and (select public.es_admin()));
  drop policy if exists "horarios-finales: borrar" on storage.objects;
  create policy "horarios-finales: borrar" on storage.objects for delete to authenticated
    using (bucket_id = 'horarios-finales' and (select public.es_admin()));

  drop policy if exists "ventanas: subir" on storage.objects;
  create policy "ventanas: subir" on storage.objects for insert to authenticated
    with check (bucket_id = 'ventanas' and (select public.es_admin()));
  drop policy if exists "ventanas: borrar" on storage.objects;
  create policy "ventanas: borrar" on storage.objects for delete to authenticated
    using (bucket_id = 'ventanas' and (select public.es_admin()));
end $$;
