-- Rediseño de Parciales (2026-11-26): el Recu y la Regu guardan si el llamado
-- fue del semestre normal u opuesto ("Semestre del llamado" en la hoja).
-- Solo reemplaza guardar_parcial: lee p_uso->>'semestre_opuesto' (por
-- defecto false). Es re-ejecutable. La app nueva funciona sin esta migración
-- (el dato simplemente no se guarda) y la vieja con ella (manda false).

create or replace function public.guardar_parcial(
  p_materia uuid, p_eval_id uuid, p_eval jsonb, p_uso jsonb, p_liberar boolean default false)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  previo public.examenes_finales;
  v_tipo text := p_uso->>'tipo';
  v_periodo text := nullif(p_uso->>'periodo', '');
  v_llamado smallint := (p_uso->>'llamado')::smallint;
  v_opuesto boolean := coalesce((p_uso->>'semestre_opuesto')::boolean, false);
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  if p_eval_id is null then
    raise exception 'Falta el identificador de la evaluación.';
  end if;
  perform pg_advisory_xact_lock(hashtext('finales:' || u::text || ':' || p_materia::text));

  insert into public.evaluaciones (id, usuario_id, materia_id, nombre, componente, ponderacion, porcentaje, puntaje_obtenido, puntaje_total, rendida, fecha)
  values (p_eval_id, u, p_materia, p_eval->>'nombre', coalesce(p_eval->>'componente', 'teoria')::public.componente_eval,
          coalesce((p_eval->>'ponderacion')::numeric, 1), (p_eval->>'porcentaje')::numeric,
          (p_eval->>'puntaje_obtenido')::numeric, (p_eval->>'puntaje_total')::numeric,
          coalesce((p_eval->>'rendida')::boolean, true), nullif(p_eval->>'fecha', '')::date)
  on conflict (id) do update
     set nombre = excluded.nombre, componente = excluded.componente, ponderacion = excluded.ponderacion,
         porcentaje = excluded.porcentaje, puntaje_obtenido = excluded.puntaje_obtenido,
         puntaje_total = excluded.puntaje_total, rendida = excluded.rendida, fecha = excluded.fecha
   where public.evaluaciones.usuario_id = u and public.evaluaciones.materia_id = p_materia;
  if not found then
    raise exception 'No se pudo guardar la evaluación.';
  end if;

  select * into previo from public.examenes_finales
   where usuario_id = u and materia_id = p_materia and not cursada_anterior
     and tipo in ('recuperatorio', 'regularizacion')
   for update;

  if p_uso is not null and jsonb_typeof(p_uso) = 'object' then
    if v_tipo not in ('recuperatorio', 'regularizacion') or v_periodo is null or v_llamado is null then
      raise exception 'Falta el semestre o el llamado del Recu o la Regu.';
    end if;
    if v_tipo = 'recuperatorio' and v_opuesto then
      raise exception 'El Recu se rinde solo en el semestre normal.';
    end if;
    if exists (select 1 from public.examenes_finales
                where usuario_id = u and materia_id = p_materia and not cursada_anterior
                  and periodo = v_periodo and llamado = v_llamado and id is distinct from previo.id) then
      raise exception 'En ese llamado ya cargaste un resultado de final. Elegí otro llamado o cambiá ese resultado en Finales.';
    end if;
    if previo.id is not null then
      update public.examenes_finales
         set tipo = v_tipo, periodo = v_periodo, llamado = v_llamado, semestre_opuesto = v_opuesto, nota = null, porcentaje = null, evaluacion_id = p_eval_id
       where id = previo.id;
    else
      insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota, porcentaje, evaluacion_id, semestre_opuesto)
      values (p_materia, v_periodo, v_llamado, v_tipo, null, null, p_eval_id, v_opuesto);
    end if;
  elsif p_liberar and previo.id is not null then
    delete from public.examenes_finales where id = previo.id;
  end if;

  perform public.validar_orden_llamados(u, p_materia);
  return p_eval_id;
end;
$$;
