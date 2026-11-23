-- Volver a cursar en un solo paso, y poder deshacerlo.
--
-- recursar_materia guarda en materias_estudiante.respaldo_recursada cómo
-- estaba la materia (estado, nota, firma, parciales y asistencia de teoría,
-- y qué finales eran de esa cursada). Después borra lo de teoría (Art. 45:
-- el laboratorio se conserva), marca esos finales como de una cursada
-- anterior y deja la materia en "cursando". deshacer_recursada lo devuelve
-- todo como estaba, pero solo mientras no se haya cargado nada nuevo de la
-- cursada (parciales, asistencia de teoría o finales): así deshacer nunca
-- borra datos. Cualquier cambio de estado a mano descarta el respaldo
-- (lo hace la app). Las dos corren con los permisos de quien las llama
-- (security invoker), así que RLS sigue mandando: cada uno solo toca lo suyo.
alter table public.materias_estudiante
  add column if not exists respaldo_recursada jsonb;

create or replace function public.recursar_materia(p_materia uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  me public.materias_estudiante;
  respaldo jsonb;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select * into me from public.materias_estudiante
   where usuario_id = u and materia_id = p_materia for update;
  -- Recursar dos veces seguidas pisaría el respaldo de la primera.
  if me.estado = 'cursando' and me.respaldo_recursada is not null then
    raise exception 'Ya marcaste que volvés a cursar esta materia';
  end if;

  respaldo := jsonb_build_object(
    'estado', coalesce(me.estado::text, 'pendiente'),
    'nota_final', me.nota_final,
    'nota_desde_final', coalesce(me.nota_desde_final, false),
    'promedio_firma', me.promedio_firma,
    'evaluaciones', coalesce((select jsonb_agg(to_jsonb(e)) from public.evaluaciones e
                               where e.usuario_id = u and e.materia_id = p_materia and e.componente = 'teoria'), '[]'::jsonb),
    'asistencia', (select to_jsonb(a) from public.asistencias a
                    where a.usuario_id = u and a.materia_id = p_materia and a.componente = 'teoria'),
    'finales', coalesce((select jsonb_agg(f.id) from public.examenes_finales f
                          where f.usuario_id = u and f.materia_id = p_materia and not f.cursada_anterior), '[]'::jsonb)
  );

  delete from public.evaluaciones where usuario_id = u and materia_id = p_materia and componente = 'teoria';
  delete from public.asistencias where usuario_id = u and materia_id = p_materia and componente = 'teoria';
  update public.examenes_finales set cursada_anterior = true
   where usuario_id = u and materia_id = p_materia and not cursada_anterior;

  insert into public.materias_estudiante (usuario_id, materia_id, estado, nota_final, promedio_firma, nota_desde_final, respaldo_recursada)
  values (u, p_materia, 'cursando', null, null, false, respaldo)
  on conflict (usuario_id, materia_id)
  do update set estado = 'cursando', nota_final = null, promedio_firma = null, nota_desde_final = false,
                respaldo_recursada = excluded.respaldo_recursada;
end;
$$;

create or replace function public.deshacer_recursada(p_materia uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  r jsonb;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select respaldo_recursada into r from public.materias_estudiante
   where usuario_id = u and materia_id = p_materia for update;
  if r is null then
    raise exception 'No hay nada para deshacer en esta materia';
  end if;

  -- Deshacer nunca borra: si ya cargó algo de la nueva cursada, no se puede.
  if exists (select 1 from public.evaluaciones where usuario_id = u and materia_id = p_materia and componente = 'teoria')
     or exists (select 1 from public.asistencias where usuario_id = u and materia_id = p_materia and componente = 'teoria')
     or exists (select 1 from public.examenes_finales where usuario_id = u and materia_id = p_materia and not cursada_anterior) then
    raise exception 'Ya cargaste parciales, asistencia o finales de la nueva cursada: no se puede deshacer';
  end if;
  insert into public.evaluaciones
    select * from jsonb_populate_recordset(null::public.evaluaciones, r->'evaluaciones') e
     where e.usuario_id = u and e.materia_id = p_materia and e.componente = 'teoria';
  if jsonb_typeof(r->'asistencia') = 'object' then
    insert into public.asistencias
      select * from jsonb_populate_record(null::public.asistencias, r->'asistencia') a
       where a.usuario_id = u and a.materia_id = p_materia and a.componente = 'teoria';
  end if;
  update public.examenes_finales set cursada_anterior = false
   where usuario_id = u and materia_id = p_materia
     and id in (select (x #>> '{}')::uuid from jsonb_array_elements(r->'finales') x);

  update public.materias_estudiante
     set estado = (r->>'estado')::public.estado_materia,
         nota_final = (r->>'nota_final')::numeric,
         nota_desde_final = coalesce((r->>'nota_desde_final')::boolean, false),
         promedio_firma = (r->>'promedio_firma')::numeric,
         respaldo_recursada = null
   where usuario_id = u and materia_id = p_materia;
end;
$$;

revoke execute on function public.recursar_materia(uuid) from public, anon;
grant execute on function public.recursar_materia(uuid) to authenticated;
revoke execute on function public.deshacer_recursada(uuid) from public, anon;
grant execute on function public.deshacer_recursada(uuid) to authenticated;
