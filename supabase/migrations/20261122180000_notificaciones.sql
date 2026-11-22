-- =============================================================
-- App CEQ: panel de admin y notificaciones push
--  * avisos programados (publicar_en) y por carrera (carrera_id)
--  * cola de notificaciones: avisos, mensajes del admin y
--    recordatorios automáticos de la agenda
--  * registro seguro de celulares (arregla el upsert de dispositivos)
--  * envío por el servicio de push de Expo cada minuto (pg_cron + pg_net)
-- Se ejecuta una vez en el SQL Editor del proyecto ceq-app. Se puede
-- volver a ejecutar sin romper nada. No toca ningún otro proyecto.
-- =============================================================

-- 1. Extensiones de Supabase para tareas programadas y pedidos HTTP.
--    En el Postgres de pruebas no existen y se saltean.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

-- 2. Preferencias de cada estudiante (las edita desde Mi perfil).
alter table public.perfiles add column if not exists notif_avisos boolean not null default true;
alter table public.perfiles add column if not exists notif_recordatorios boolean not null default true;

-- 3. Avisos programados y dirigidos a una carrera.
alter table public.avisos add column if not exists publicar_en timestamptz not null default now();
alter table public.avisos add column if not exists carrera_id uuid references public.carreras(id) on delete set null;
create index if not exists avisos_publicar_en on public.avisos (publicar_en desc);

create or replace function public.mi_carrera()
returns uuid language sql stable security definer set search_path = public as $$
  select carrera_id from public.perfiles where id = auth.uid();
$$;

-- Un estudiante ve un aviso cuando ya se publicó y es para todos o para
-- su carrera. El admin los ve todos (también los programados).
drop policy if exists "leer avisos" on public.avisos;
create policy "leer avisos" on public.avisos for select to authenticated
  using (
    (select public.es_admin())
    or (publicado and publicar_en <= now() and (carrera_id is null or carrera_id = (select public.mi_carrera())))
  );

-- 4. Cola de notificaciones.
create table if not exists public.notificaciones (
  id               uuid primary key default gen_random_uuid(),
  -- aviso: sale al publicar un aviso; mensaje: solo notificación del admin;
  -- recordatorio: automático, de una fecha de la agenda.
  tipo             text not null default 'mensaje' check (tipo in ('aviso', 'mensaje', 'recordatorio')),
  titulo           text not null check (char_length(titulo) between 1 and 120),
  cuerpo           text not null check (char_length(cuerpo) between 1 and 500),
  ruta             text check (ruta is null or ruta ~ '^/[A-Za-z0-9/_-]*$'),  -- pantalla que abre al tocarla
  aviso_id         uuid references public.avisos(id) on delete cascade,
  evento_id        uuid references public.eventos(id) on delete cascade,
  usuario_id       uuid references auth.users(id) on delete cascade,      -- un solo destinatario
  carrera_id       uuid references public.carreras(id) on delete cascade, -- nulo = todas
  plan_id          uuid references public.planes(id) on delete cascade,   -- nulo = todos
  programada_para  timestamptz not null default now(),
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'enviada', 'cancelada', 'sin_destinatarios', 'error')),
  enviada_en       timestamptz,
  destinatarios    integer,
  creada_por       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
-- Si la tabla ya existía de una versión anterior, actualizar los estados válidos.
alter table public.notificaciones drop constraint if exists notificaciones_estado_check;
alter table public.notificaciones add constraint notificaciones_estado_check
  check (estado in ('pendiente', 'enviada', 'cancelada', 'sin_destinatarios', 'error'));
create unique index if not exists notificaciones_un_aviso on public.notificaciones (aviso_id) where aviso_id is not null;
create index if not exists notificaciones_pendientes on public.notificaciones (programada_para) where estado = 'pendiente';
create index if not exists notificaciones_recientes on public.notificaciones (created_at desc);

alter table public.notificaciones enable row level security;
revoke all on public.notificaciones from anon;
revoke truncate, references, trigger on public.notificaciones from authenticated;

-- El admin maneja las notificaciones generales. Los recordatorios
-- personales (con usuario_id) son privados: ni el admin los ve.
drop policy if exists "admin ve notificaciones" on public.notificaciones;
create policy "admin ve notificaciones" on public.notificaciones for select to authenticated
  using ((select public.es_admin()) and usuario_id is null);
drop policy if exists "admin programa notificaciones" on public.notificaciones;
create policy "admin programa notificaciones" on public.notificaciones for insert to authenticated
  with check ((select public.es_admin()) and tipo = 'mensaje' and usuario_id is null and evento_id is null
              and aviso_id is null and estado = 'pendiente');
drop policy if exists "admin edita pendientes" on public.notificaciones;
create policy "admin edita pendientes" on public.notificaciones for update to authenticated
  using ((select public.es_admin()) and usuario_id is null and estado = 'pendiente')
  with check ((select public.es_admin()) and usuario_id is null and estado in ('pendiente', 'cancelada'));
drop policy if exists "admin borra notificaciones" on public.notificaciones;
create policy "admin borra notificaciones" on public.notificaciones for delete to authenticated
  using ((select public.es_admin()) and usuario_id is null);

-- 5. Al publicar (o programar) un aviso con "notificar", se encola su
--    notificación. Si se despublica antes de salir, se cancela. Una vez
--    enviada no se vuelve a mandar aunque se edite el aviso.
create or replace function public.notificar_aviso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.notificar and new.publicado then
    insert into public.notificaciones (tipo, titulo, cuerpo, ruta, aviso_id, carrera_id, programada_para, creada_por)
    values (
      'aviso',
      coalesce(nullif(btrim(left(new.titulo, 120)), ''), 'Aviso del CEQ'),
      coalesce(nullif(btrim(left(new.cuerpo, 180)), ''), 'Nuevo aviso del CEQ'),
      '/aviso/' || new.id,
      new.id, new.carrera_id, new.publicar_en, auth.uid()
    )
    on conflict (aviso_id) where aviso_id is not null do update
      set titulo = excluded.titulo, cuerpo = excluded.cuerpo, carrera_id = excluded.carrera_id,
          programada_para = excluded.programada_para, estado = 'pendiente'
      where public.notificaciones.estado in ('pendiente', 'cancelada');
  else
    update public.notificaciones set estado = 'cancelada' where aviso_id = new.id and estado = 'pendiente';
  end if;
  return new;
end;
$$;
-- Los avisos que ya existían antes de esta migración cuentan como
-- notificados: editarlos después no debe mandar un push a todos.
insert into public.notificaciones (tipo, titulo, cuerpo, aviso_id, carrera_id, programada_para, estado, enviada_en, destinatarios, creada_por)
select 'aviso', coalesce(nullif(btrim(left(a.titulo, 120)), ''), 'Aviso del CEQ'),
       coalesce(nullif(btrim(left(a.cuerpo, 180)), ''), 'Nuevo aviso del CEQ'),
       a.id, a.carrera_id, a.created_at, 'enviada', a.created_at, 0, null
from public.avisos a
where a.publicado and a.notificar
  and not exists (select 1 from public.notificaciones n where n.aviso_id = a.id)
on conflict (aviso_id) where aviso_id is not null do nothing;

drop trigger if exists avisos_notificar on public.avisos;
create trigger avisos_notificar after insert or update of titulo, cuerpo, notificar, publicado, publicar_en, carrera_id
  on public.avisos for each row execute function public.notificar_aviso();

-- 6. Si cambia la fecha de un evento de la agenda, su recordatorio vuelve a salir.
create or replace function public.reactivar_recordatorio()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.fecha is distinct from old.fecha or new.aviso_minutos is distinct from old.aviso_minutos then
    new.notificado := false;
  end if;
  return new;
end;
$$;
drop trigger if exists eventos_reactivar_recordatorio on public.eventos;
create trigger eventos_reactivar_recordatorio before update on public.eventos
  for each row execute function public.reactivar_recordatorio();

-- 7. Celulares. Un mismo celular (token) pasa al último usuario que
--    inició sesión en él; antes el upsert fallaba por RLS.
create or replace function public.registrar_dispositivo(p_token text, p_plataforma text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' then
    raise exception 'Token de notificaciones inválido';
  end if;
  insert into public.dispositivos (token, usuario_id, plataforma, updated_at)
  values (p_token, auth.uid(), left(p_plataforma, 20), now())
  on conflict (token) do update
    set usuario_id = excluded.usuario_id, plataforma = excluded.plataforma, updated_at = now();
end;
$$;
revoke execute on function public.registrar_dispositivo(text, text) from public, anon;
grant execute on function public.registrar_dispositivo(text, text) to authenticated;

-- 8. Para el panel: a cuántos celulares llegaría y números generales.
create or replace function public.alcance_notificacion(p_carrera uuid default null)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para administradores';
  end if;
  return (
    select count(distinct d.token)::int
    from public.dispositivos d join public.perfiles p on p.id = d.usuario_id
    where p.notif_avisos and (p_carrera is null or p.carrera_id = p_carrera)
  );
end;
$$;
revoke execute on function public.alcance_notificacion(uuid) from public, anon;
grant execute on function public.alcance_notificacion(uuid) to authenticated;

create or replace function public.resumen_admin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para administradores';
  end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from public.perfiles),
    'celulares', (select count(*) from public.dispositivos),
    'sugerencias_nuevas', (select count(*) from public.sugerencias where estado = 'recibida'),
    'programadas', (select count(*) from public.notificaciones where estado = 'pendiente' and usuario_id is null)
  );
end;
$$;
revoke execute on function public.resumen_admin() from public, anon;
grant execute on function public.resumen_admin() to authenticated;

-- 9. Registro de cada envío a Expo, para borrar los celulares que ya no
--    existen (app desinstalada). Nadie lo lee desde la app.
create table if not exists public.envios_push (
  id               bigserial primary key,
  notificacion_id  uuid references public.notificaciones(id) on delete cascade,
  request_id       bigint,
  tokens           text[] not null,
  revisado         boolean not null default false,
  created_at       timestamptz not null default now()
);
alter table public.envios_push enable row level security;
revoke all on public.envios_push from anon, authenticated;

-- 10. El cartero: corre cada minuto.
create or replace function public.procesar_notificaciones()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n        record;
  r        record;
  tokens   text[];
  lote     text[];
  mensajes jsonb;
  req      bigint;
  i        integer;
  enviadas integer := 0;
begin
  -- a) Recordatorios de la agenda que ya toca avisar (y que todavía no pasaron).
  with vencidos as (
    update public.eventos e set notificado = true
    where not e.notificado
      and e.fecha > now()
      and e.fecha - make_interval(mins => greatest(e.aviso_minutos, 0)) <= now()
    returning e.id, e.usuario_id, e.plan_id, e.titulo, e.fecha
  )
  insert into public.notificaciones (tipo, titulo, cuerpo, ruta, evento_id, usuario_id, plan_id, programada_para, creada_por)
  select 'recordatorio', coalesce(nullif(btrim(left(v.titulo, 120)), ''), 'Recordatorio'),
         'Es el ' || to_char(v.fecha at time zone 'America/Asuncion', 'DD/MM') || ' a las '
                  || to_char(v.fecha at time zone 'America/Asuncion', 'HH24:MI') || '.',
         '/agenda', v.id, v.usuario_id, v.plan_id, now(), null
  from vencidos v;

  -- b) Enviar lo que ya venció, en lotes de 100 (límite de Expo).
  for n in
    select * from public.notificaciones
    where estado = 'pendiente' and programada_para <= now()
    -- Primero las generales: muchos recordatorios personales no las atrasan.
    order by (usuario_id is not null), programada_para
    limit 50
    for update skip locked
  loop
    begin
    select array_agg(distinct d.token) into tokens
    from public.dispositivos d
    join public.perfiles p on p.id = d.usuario_id
    where (n.usuario_id is null or d.usuario_id = n.usuario_id)
      and (n.carrera_id is null or p.carrera_id = n.carrera_id)
      and (n.plan_id is null or p.plan_id = n.plan_id)
      and case when n.tipo = 'recordatorio' then p.notif_recordatorios else p.notif_avisos end;

    if tokens is null then
      update public.notificaciones set estado = 'sin_destinatarios', enviada_en = now(), destinatarios = 0 where id = n.id;
      continue;
    end if;

    for i in 0 .. (array_length(tokens, 1) - 1) / 100 loop
      lote := tokens[i * 100 + 1 : i * 100 + 100];
      select jsonb_agg(jsonb_build_object(
               'to', u.t, 'title', n.titulo, 'body', n.cuerpo, 'sound', 'default', 'priority', 'high',
               'channelId', case when n.tipo = 'recordatorio' then 'recordatorios' else 'avisos' end,
               'data', jsonb_build_object('ruta', n.ruta)) order by u.ord)
        into mensajes
        from unnest(lote) with ordinality as u(t, ord);
      req := net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := mensajes,
        headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
        timeout_milliseconds := 10000
      );
      insert into public.envios_push (notificacion_id, request_id, tokens) values (n.id, req, lote);
    end loop;

    update public.notificaciones
      set estado = 'enviada', enviada_en = now(), destinatarios = array_length(tokens, 1)
      where id = n.id;
    enviadas := enviadas + 1;
    exception when others then
      -- Una notificación con problemas no frena a las demás.
      update public.notificaciones set estado = 'error', enviada_en = now() where id = n.id;
    end;
  end loop;

  -- c) Borrar los celulares que Expo informa como dados de baja.
  for r in
    select e.id, e.tokens, h.status_code, h.content
    from public.envios_push e join net._http_response h on h.id = e.request_id
    where not e.revisado
  loop
    begin
      if r.status_code = 200 then
        delete from public.dispositivos where token in (
          select r.tokens[t.ord::int]
          from jsonb_array_elements(r.content::jsonb -> 'data') with ordinality as t(ticket, ord)
          where t.ticket ->> 'status' = 'error' and t.ticket -> 'details' ->> 'error' = 'DeviceNotRegistered'
        );
      end if;
    exception when others then
      null;  -- respuesta que no es JSON: se ignora
    end;
    update public.envios_push set revisado = true where id = r.id;
  end loop;

  -- d) Limpieza.
  delete from public.envios_push where created_at < now() - interval '2 days';
  delete from public.notificaciones where usuario_id is not null and created_at < now() - interval '30 days';

  return enviadas;
end;
$$;
revoke execute on function public.procesar_notificaciones() from public, anon, authenticated;

-- 11. Programar el cartero cada minuto (solo donde existe pg_cron).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ceq-notificaciones', '* * * * *', 'select public.procesar_notificaciones()');
  end if;
end $$;
