-- Finales rediseñados (pedido de Josie, 2026-11-25): al registrar el
-- resultado de una mesa se puede marcar "Rendí y espero la nota" o
-- "Estuve ausente", además de la nota.
--  * 'pendiente': rindió el final y todavía no sabe la nota. El llamado
--    queda usado (cuenta entre los 3 de la materia) pero no tiene nota ni
--    cuenta para los promedios hasta completarla.
--  * 'ausente': estaba en la mesa y no se presentó. Queda en el historial,
--    no es aplazo y no gasta uno de los 3 finales.
-- Igual que el Recu y la Regu, ninguno de los dos lleva nota ni porcentaje.
-- Se puede ejecutar más de una vez.
alter table public.examenes_finales
  drop constraint if exists examenes_finales_tipo_check;
alter table public.examenes_finales
  add constraint examenes_finales_tipo_check
  check (tipo in ('final', 'regularizacion', 'recuperatorio', 'pendiente', 'ausente'));

-- (La regla de la nota ya pide nota solo en 'final' y nada en los demás.)
alter table public.examenes_finales
  drop constraint if exists examenes_finales_nota_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_nota_segun_tipo
  check ((tipo = 'final' and nota is not null) or (tipo <> 'final' and nota is null and porcentaje is null));

-- Pendiente y ausente pueden ir en cualquiera de los 3 llamados.
alter table public.examenes_finales
  drop constraint if exists examenes_finales_llamado_segun_tipo;
alter table public.examenes_finales
  add constraint examenes_finales_llamado_segun_tipo
  check (tipo in ('final', 'pendiente', 'ausente') or llamado is null
         or (tipo = 'recuperatorio' and llamado = 1)
         or (tipo = 'regularizacion' and llamado in (1, 2)));

-- Un final rendido que espera la nota también gasta uno de los 3 llamados:
-- el semestre opuesto lo cuenta igual que la app.
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
   where usuario_id = u and materia_id = p_materia and not cursada_anterior and llamado is not null and tipo in ('final', 'pendiente');
  if usados >= 3 then
    raise exception 'Ya rendiste los tres finales: tenés que volver a cursar en el semestre normal (Art. 62)';
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


-- Guardar los llamados en UNA transacción: antes se borraba el semestre y
-- después se insertaba, y si el insert fallaba (o se cortaba la red, o al
-- mover un resultado de un semestre a otro) se perdían finales.
-- Borra los llamados de la cursada actual de los semestres indicados (no las
-- filas viejas sin llamado) e inserta las filas nuevas; si algo falla no
-- cambia nada. Corre con los permisos de quien la llama (RLS manda).
create or replace function public.guardar_llamados(p_materia uuid, p_periodos text[], p_filas jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  delete from public.examenes_finales
   where usuario_id = u and materia_id = p_materia and not cursada_anterior
     and llamado is not null and periodo = any(p_periodos);
  insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota, porcentaje, fecha)
  select p_materia, x.periodo, x.llamado, x.tipo, x.nota, x.porcentaje, x.fecha
    from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb))
      as x(periodo text, llamado smallint, tipo text, nota smallint, porcentaje numeric, fecha date);
end;
$$;

revoke execute on function public.guardar_llamados(uuid, text[], jsonb) from public, anon;
grant execute on function public.guardar_llamados(uuid, text[], jsonb) to authenticated;
