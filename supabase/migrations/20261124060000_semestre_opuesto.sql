-- Semestre opuesto (Res. 0108-00-2024, Art. 7 c, 23 y 62).
--
-- Al volver a cursar, el estudiante elige "Semestre normal" o "Semestre
-- opuesto". En el opuesto la materia se ofrece solo para parciales y finales,
-- sin recuperatorio (Art. 23), y hace falta tener las prácticas aprobadas y la
-- asistencia de teoría cumplida (Art. 7 c): por eso se conservan el
-- laboratorio y la asistencia. Los tres llamados de finales son de la materia
-- y se comparten con el semestre normal: el opuesto solo se puede elegir si
-- queda al menos un final sin rendir en la cursada (el Recu y la Regu son
-- parciales: no gastan un final), y los finales de la cursada siguen contando. Quien
-- reprobó tres veces o dejó pasar dos periodos pierde el opuesto (Art. 62).
--
-- cursar_semestre_opuesto guarda el mismo respaldo que recursar_materia, con
-- 'modo' = 'opuesto', así deshacer_recursada lo puede devolver. Corre con los
-- permisos de quien la llama (security invoker): RLS sigue mandando.
alter table public.materias_estudiante
  add column if not exists semestre_opuesto boolean not null default false;

create or replace function public.cursar_semestre_opuesto(p_materia uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  me public.materias_estudiante;
  usados int;
  respaldo jsonb;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select * into me from public.materias_estudiante
   where usuario_id = u and materia_id = p_materia for update;
  if me.estado = 'aprobada' then
    raise exception 'Ya aprobaste esta materia';
  end if;
  if me.estado = 'cursando' and me.respaldo_recursada is not null then
    raise exception 'Ya marcaste que volvés a cursar esta materia';
  end if;
  select count(*) into usados from public.examenes_finales
   where usuario_id = u and materia_id = p_materia and not cursada_anterior and llamado is not null and tipo = 'final';
  if usados >= 3 then
    raise exception 'Ya usaste los tres llamados: tenés que volver a cursar en el semestre normal (Art. 62)';
  end if;

  respaldo := jsonb_build_object(
    'modo', 'opuesto',
    'estado', coalesce(me.estado::text, 'pendiente'),
    'nota_final', me.nota_final,
    'nota_desde_final', coalesce(me.nota_desde_final, false),
    'promedio_firma', me.promedio_firma,
    'semestre_opuesto', coalesce(me.semestre_opuesto, false),
    'evaluaciones', coalesce((select jsonb_agg(to_jsonb(e)) from public.evaluaciones e
                               where e.usuario_id = u and e.materia_id = p_materia and e.componente = 'teoria'), '[]'::jsonb),
    'finales', coalesce((select jsonb_agg(f.id) from public.examenes_finales f
                          where f.usuario_id = u and f.materia_id = p_materia and not f.cursada_anterior), '[]'::jsonb)
  );

  -- Solo se rinden de nuevo los parciales teóricos.
  delete from public.evaluaciones where usuario_id = u and materia_id = p_materia and componente = 'teoria';

  insert into public.materias_estudiante (usuario_id, materia_id, estado, nota_final, promedio_firma, nota_desde_final, respaldo_recursada, semestre_opuesto)
  values (u, p_materia, 'cursando', null, null, false, respaldo, true)
  on conflict (usuario_id, materia_id)
  do update set estado = 'cursando', nota_final = null, promedio_firma = null, nota_desde_final = false,
                respaldo_recursada = excluded.respaldo_recursada, semestre_opuesto = true;
end;
$$;

-- Volver a cursar en el semestre normal: ya no es semestre opuesto. Una materia
-- aprobada no se recursa.
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
  if me.estado = 'aprobada' then
    raise exception 'Ya aprobaste esta materia';
  end if;
  if me.estado = 'cursando' and me.respaldo_recursada is not null then
    raise exception 'Ya marcaste que volvés a cursar esta materia';
  end if;

  respaldo := jsonb_build_object(
    'estado', coalesce(me.estado::text, 'pendiente'),
    'nota_final', me.nota_final,
    'nota_desde_final', coalesce(me.nota_desde_final, false),
    'promedio_firma', me.promedio_firma,
    'semestre_opuesto', coalesce(me.semestre_opuesto, false),
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

  insert into public.materias_estudiante (usuario_id, materia_id, estado, nota_final, promedio_firma, nota_desde_final, respaldo_recursada, semestre_opuesto)
  values (u, p_materia, 'cursando', null, null, false, respaldo, false)
  on conflict (usuario_id, materia_id)
  do update set estado = 'cursando', nota_final = null, promedio_firma = null, nota_desde_final = false,
                respaldo_recursada = excluded.respaldo_recursada, semestre_opuesto = false;
end;
$$;

-- Deshacer: igual que antes para el semestre normal. Para el opuesto, la
-- asistencia y los finales no se tocaron, así que solo se exige que no haya
-- parciales nuevos ni finales cargados después.
create or replace function public.deshacer_recursada(p_materia uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  r jsonb;
  opuesto boolean;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select respaldo_recursada into r from public.materias_estudiante
   where usuario_id = u and materia_id = p_materia for update;
  if r is null then
    raise exception 'No hay nada para deshacer en esta materia';
  end if;
  opuesto := coalesce(r->>'modo', '') = 'opuesto';

  if exists (select 1 from public.evaluaciones where usuario_id = u and materia_id = p_materia and componente = 'teoria')
     or (not opuesto and exists (select 1 from public.asistencias where usuario_id = u and materia_id = p_materia and componente = 'teoria'))
     or exists (select 1 from public.examenes_finales where usuario_id = u and materia_id = p_materia and not cursada_anterior
                  and id not in (select (x #>> '{}')::uuid from jsonb_array_elements(r->'finales') x)) then
    raise exception 'Ya cargaste parciales, asistencia o finales de la nueva cursada: no se puede deshacer';
  end if;
  insert into public.evaluaciones
    select * from jsonb_populate_recordset(null::public.evaluaciones, r->'evaluaciones') e
     where e.usuario_id = u and e.materia_id = p_materia and e.componente = 'teoria';
  if not opuesto and jsonb_typeof(r->'asistencia') = 'object' then
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
         semestre_opuesto = coalesce((r->>'semestre_opuesto')::boolean, false),
         respaldo_recursada = null
   where usuario_id = u and materia_id = p_materia;
end;
$$;

revoke execute on function public.cursar_semestre_opuesto(uuid) from public, anon;
grant execute on function public.cursar_semestre_opuesto(uuid) to authenticated;
revoke execute on function public.recursar_materia(uuid) from public, anon;
grant execute on function public.recursar_materia(uuid) to authenticated;
revoke execute on function public.deshacer_recursada(uuid) from public, anon;
grant execute on function public.deshacer_recursada(uuid) to authenticated;
