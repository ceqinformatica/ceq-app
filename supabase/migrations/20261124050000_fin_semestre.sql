-- =============================================================
-- Fin del semestre: cada estudiante puede elegir el último día de
-- clases (perfiles.fin_clases). Desde el día siguiente:
--   * encolar_recordatorios_clases() ya no avisa sus clases;
--   * vaciar_horarios_terminados() (una vez por día con pg_cron) borra
--     su horario semanal y deja la fecha en blanco para el próximo
--     semestre. Las fechas (parciales, finales) no se tocan.
-- Se puede volver a ejecutar sin romper nada.
-- =============================================================

alter table public.perfiles add column if not exists fin_clases date;
comment on column public.perfiles.fin_clases is 'Último día de clases del semestre; después se vacía el horario';

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
      -- Pasado el fin del semestre que eligió el estudiante, no se avisa más.
      and not exists (select 1 from public.perfiles p
                      where p.id = h.usuario_id and p.fin_clases is not null and d.dia > p.fin_clases)
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

create or replace function public.vaciar_horarios_terminados(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  hoy date := (p_ahora at time zone 'America/Asuncion')::date;
  n   integer;
begin
  delete from public.horario h
  using public.perfiles p
  where p.id = h.usuario_id and p.fin_clases is not null and p.fin_clases < hoy;
  get diagnostics n = row_count;
  update public.perfiles set fin_clases = null
  where fin_clases is not null and fin_clases < hoy;
  return n;
end;
$$;
revoke execute on function public.vaciar_horarios_terminados(timestamptz) from public, anon, authenticated;

-- Todos los días a las 00:10 de Paraguay (03:10 UTC), solo donde existe pg_cron.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ceq-fin-semestre', '10 3 * * *', 'select public.vaciar_horarios_terminados()');
  end if;
end $$;
