-- =============================================================
-- App CEQ: recordatorio antes de cada clase del horario semanal
--  * horario.aviso_minutos: cuántos minutos antes avisar (nulo = sin aviso)
--  * horario.avisado_el: último día en que ya se avisó (no repetir)
--  * encolar_recordatorios_clases(): cada minuto deja en la cola de
--    notificaciones los avisos de las clases que están por empezar.
--    El cartero (procesar_notificaciones) los manda como cualquier
--    recordatorio, respetando "Recordatorios de mi agenda" del perfil.
-- Se ejecuta una vez en el SQL Editor del proyecto ceq-app. Se puede
-- volver a ejecutar sin romper nada.
-- =============================================================

alter table public.horario add column if not exists aviso_minutos smallint;
alter table public.horario add column if not exists avisado_el date;
alter table public.horario drop constraint if exists horario_aviso_minutos_check;
alter table public.horario add constraint horario_aviso_minutos_check
  check (aviso_minutos is null or aviso_minutos between 5 and 240);

-- Si cambia el día, la hora o el aviso de una clase, vuelve a avisar.
create or replace function public.reactivar_aviso_clase()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.dia_semana is distinct from old.dia_semana
     or new.hora_inicio is distinct from old.hora_inicio
     or new.aviso_minutos is distinct from old.aviso_minutos then
    new.avisado_el := null;
  end if;
  return new;
end;
$$;
drop trigger if exists horario_reactivar_aviso on public.horario;
create trigger horario_reactivar_aviso before update on public.horario
  for each row execute function public.reactivar_aviso_clase();

-- Las clases son en hora de Paraguay. Se mira hoy y mañana para que una
-- clase temprana con aviso largo (p. ej. 00:30 avisando 1 h antes) no se pierda.
create or replace function public.encolar_recordatorios_clases(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  hoy date := (p_ahora at time zone 'America/Asuncion')::date;
  n   integer;
begin
  with candidatas as (
    select h.id, d.dia, (d.dia + h.hora_inicio) at time zone 'America/Asuncion' as empieza
    from public.horario h
    cross join lateral (values (hoy), (hoy + 1)) as d(dia)
    where h.aviso_minutos is not null
      and extract(isodow from d.dia) = h.dia_semana
      and h.avisado_el is distinct from d.dia
  ),
  vencidas as (
    update public.horario h set avisado_el = c.dia
    from candidatas c
    where h.id = c.id
      and h.avisado_el is distinct from c.dia  -- se vuelve a mirar al bloquear la fila
      and p_ahora < c.empieza
      and p_ahora >= c.empieza - make_interval(mins => h.aviso_minutos)
    returning h.usuario_id, h.titulo, h.materia_id, h.hora_inicio, h.aula
  )
  insert into public.notificaciones (tipo, titulo, cuerpo, ruta, usuario_id, programada_para, creada_por)
  select 'recordatorio',
         left(coalesce(nullif(btrim(coalesce(v.titulo, m.nombre)), ''), 'Clase'), 120),
         left('Empieza a las ' || to_char(v.hora_inicio, 'HH24:MI')
              || coalesce(' en ' || nullif(btrim(v.aula), ''), '') || '.', 500),
         '/agenda', v.usuario_id, now(), null
  from vencidas v
  left join public.materias m on m.id = v.materia_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.encolar_recordatorios_clases(timestamptz) from public, anon, authenticated;

-- Cada minuto (solo donde existe pg_cron). Corre en paralelo con el cartero,
-- así que el aviso puede salir hasta un minuto después de lo programado.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ceq-recordatorios-clases', '* * * * *', 'select public.encolar_recordatorios_clases()');
  end if;
end $$;
