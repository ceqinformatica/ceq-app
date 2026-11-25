-- Auditoría del 25/11/2026: integridad de finales, Regu/Recu y perfil.
-- Se puede ejecutar más de una vez.
--
--  1. Cada resultado se guarda y se borra por su ID, con una versión que
--     detecta si otro dispositivo lo cambió (antes se releía el semestre y
--     se reemplazaba entero: el último en guardar pisaba al otro, y editar
--     un final importado del extracto lo duplicaba).
--  2. Los importados del extracto conservan su origen y la nota original
--     (reimportar no los duplica aunque se haya corregido la nota).
--  3. La base pone el tope de 3 finales rendidos (con nota o esperando la
--     nota) por cursada, venga de donde venga el guardado. Ausente, Recu,
--     Regu y las cursadas anteriores no cuentan.
--  4. El Recu o la Regu y su llamado en Finales se guardan y se borran en
--     una sola transacción, con un ID estable (reintentar no duplica).
--  5. El semestre opuesto queda guardado en cada intento (la etiqueta ya no
--     depende de la fecha de hoy).
--  6. El plan del perfil tiene que ser de la carrera del perfil.
--  7. Guía: el semestre opuesto también vale para el plan 2018.

-- ---------------------------------------------------------------- columnas
alter table public.examenes_finales
  add column if not exists version integer not null default 1,
  add column if not exists origen text not null default 'manual',
  add column if not exists nota_extracto smallint,
  add column if not exists semestre_opuesto boolean not null default false,
  add column if not exists evaluacion_id uuid references public.evaluaciones(id) on delete set null;

alter table public.examenes_finales drop constraint if exists examenes_finales_origen_check;
alter table public.examenes_finales
  add constraint examenes_finales_origen_check check (origen in ('manual', 'extracto'));

-- Los que vinieron del extracto: sin semestre ni llamado (así los guardaba
-- la importación). Solo la primera vez (después ya tienen nota_extracto).
update public.examenes_finales
   set origen = 'extracto', nota_extracto = nota
 where origen = 'manual' and nota_extracto is null and periodo is null and llamado is null
   and tipo = 'final' and nota is not null;

-- Periodo académico de hoy en Asunción: "2026-1" (feb–jul) o "2026-2" (ago–ene).
create or replace function public.periodo_actual()
returns text language sql stable set search_path = public as $$
  select case
    when extract(month from (now() at time zone 'America/Asuncion')) = 1
      then (extract(year from (now() at time zone 'America/Asuncion'))::int - 1)::text || '-2'
    when extract(month from (now() at time zone 'America/Asuncion')) <= 7
      then extract(year from (now() at time zone 'America/Asuncion'))::int::text || '-1'
    else extract(year from (now() at time zone 'America/Asuncion'))::int::text || '-2'
  end;
$$;

-- La etiqueta "Semestre opuesto" que hoy se ve (materia en opuesto y
-- resultado de este semestre) queda guardada en el intento.
update public.examenes_finales f
   set semestre_opuesto = true
  from public.materias_estudiante me
 where me.usuario_id = f.usuario_id and me.materia_id = f.materia_id and me.semestre_opuesto
   and not f.cursada_anterior and not f.semestre_opuesto and f.periodo = public.periodo_actual();

-- ---------------------------------------------------------------- versión
create or replace function public.examenes_finales_version()
returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
drop trigger if exists examenes_finales_version on public.examenes_finales;
create trigger examenes_finales_version before update on public.examenes_finales
  for each row execute function public.examenes_finales_version();

-- ---------------------------------------------------------------- tope de 3
-- Finales rendidos de la cursada actual que ya tienen semestre y llamado.
-- Los importados sin ubicar no cuentan hasta que el estudiante los ubica
-- (el extracto puede traer intentos de cursadas anteriores): la app muestra
-- el saldo como "sin calcular" mientras haya alguno.
create or replace function public.examenes_finales_tope()
returns trigger language plpgsql set search_path = public as $$
declare
  usados int;
begin
  if new.cursada_anterior or new.llamado is null or new.tipo not in ('final', 'pendiente') then
    return new;
  end if;
  -- Una fila que ya contaba y sigue contando (completar la nota de un
  -- pendiente, corregir la fecha) no se frena: si alguien ya tenía más de 3
  -- de antes, igual puede corregirlos o borrarlos.
  if tg_op = 'UPDATE' and not old.cursada_anterior and old.llamado is not null
     and old.tipo in ('final', 'pendiente')
     and old.usuario_id = new.usuario_id and old.materia_id = new.materia_id then
    return new;
  end if;
  -- Dos guardados a la vez de la misma materia no pasan los dos el control.
  perform pg_advisory_xact_lock(hashtext('finales:' || new.usuario_id::text || ':' || new.materia_id::text));
  select count(*) into usados from public.examenes_finales
   where usuario_id = new.usuario_id and materia_id = new.materia_id and id <> new.id
     and not cursada_anterior and llamado is not null and tipo in ('final', 'pendiente');
  if usados >= 3 then
    raise exception 'Ya registraste los 3 finales de esta materia en esta cursada (Art. 62).'
      using errcode = 'P0001', hint = 'tope_finales';
  end if;
  return new;
end;
$$;
drop trigger if exists examenes_finales_tope on public.examenes_finales;
create trigger examenes_finales_tope before insert or update on public.examenes_finales
  for each row execute function public.examenes_finales_tope();

-- Recu o Regu después de un final rendido (en orden de semestre y llamado):
-- no corresponde, al final se llega con la firma.
create or replace function public.validar_orden_llamados(u uuid, m uuid)
returns void language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.examenes_finales r
      join public.examenes_finales f
        on f.usuario_id = r.usuario_id and f.materia_id = r.materia_id
       and not f.cursada_anterior and f.tipo in ('final', 'pendiente')
       and f.periodo is not null and f.llamado is not null
       and (f.periodo, f.llamado) < (r.periodo, r.llamado)
     where r.usuario_id = u and r.materia_id = m and not r.cursada_anterior
       and r.tipo in ('recuperatorio', 'regularizacion') and r.periodo is not null and r.llamado is not null
  ) then
    raise exception 'Ya rendiste un final: después no se puede rendir Recu ni Regu. Si te equivocaste, corregí ese resultado.'
      using errcode = 'P0001', hint = 'regu_tras_final';
  end if;
end;
$$;

-- ---------------------------------------------------------------- guardar un resultado
-- Crea (p_id null) o corrige (p_id + p_version) un resultado de final de la
-- cursada actual. Si el llamado elegido lo ocupa otro resultado de final,
-- se reemplaza solo si la app lo mostró así (p_reemplaza + p_reemplaza_version).
-- p_fila: periodo, llamado, tipo, nota, porcentaje, fecha, semestre_opuesto,
-- cursada_anterior (solo para mover un importado a una cursada anterior).
create or replace function public.guardar_final(
  p_materia uuid, p_id uuid, p_version integer, p_fila jsonb,
  p_reemplaza uuid default null, p_reemplaza_version integer default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  actual public.examenes_finales;
  ocupante public.examenes_finales;
  v_periodo text := nullif(p_fila->>'periodo', '');
  v_llamado smallint := (p_fila->>'llamado')::smallint;
  v_tipo text := coalesce(p_fila->>'tipo', 'final');
  v_nota smallint := (p_fila->>'nota')::smallint;
  v_pct numeric := (p_fila->>'porcentaje')::numeric;
  v_fecha date := nullif(p_fila->>'fecha', '')::date;
  v_opuesto boolean := coalesce((p_fila->>'semestre_opuesto')::boolean, false);
  v_anterior boolean := coalesce((p_fila->>'cursada_anterior')::boolean, false);
  nuevo uuid;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  if v_tipo in ('recuperatorio', 'regularizacion') then
    raise exception 'El Recu y la Regu se cargan desde Parciales.';
  end if;
  perform pg_advisory_xact_lock(hashtext('finales:' || u::text || ':' || p_materia::text));

  if p_id is not null then
    select * into actual from public.examenes_finales
     where id = p_id and usuario_id = u and materia_id = p_materia for update;
    if not found then
      raise exception 'Ese resultado ya no está: se borró desde otro dispositivo. Volvé a abrir la materia.'
        using errcode = 'P0001', hint = 'desactualizado';
    end if;
    if actual.version is distinct from p_version then
      raise exception 'Ese resultado cambió en otro dispositivo. Volvé a abrir la materia para ver lo último.'
        using errcode = 'P0001', hint = 'desactualizado';
    end if;
    if actual.cursada_anterior then
      raise exception 'Los resultados de una cursada anterior no se editan.';
    end if;
    if actual.tipo in ('recuperatorio', 'regularizacion') then
      raise exception 'El Recu y la Regu se cambian desde Parciales.';
    end if;
    if v_anterior and actual.origen <> 'extracto' then
      raise exception 'Solo un final importado del extracto se puede pasar a una cursada anterior.';
    end if;
  elsif v_anterior then
    raise exception 'Un resultado nuevo es de esta cursada.';
  end if;

  if not v_anterior then
    if v_periodo is null or v_llamado is null then
      raise exception 'Elegí el semestre y el llamado.';
    end if;
    select * into ocupante from public.examenes_finales
     where usuario_id = u and materia_id = p_materia and not cursada_anterior
       and periodo = v_periodo and llamado = v_llamado and id is distinct from p_id
     for update;
    if found then
      if ocupante.tipo in ('recuperatorio', 'regularizacion') then
        raise exception 'Ese llamado lo usaste para el Recu o la Regu. Elegí otro, o cambialo desde Parciales.';
      end if;
      if ocupante.id is distinct from p_reemplaza or ocupante.version is distinct from p_reemplaza_version then
        raise exception 'En ese llamado hay otro resultado que cambió en otro dispositivo. Volvé a abrir la materia.'
          using errcode = 'P0001', hint = 'desactualizado';
      end if;
      delete from public.examenes_finales where id = ocupante.id;
    end if;
  end if;

  if p_id is not null then
    update public.examenes_finales
       set periodo = case when v_anterior then actual.periodo else v_periodo end,
           llamado = case when v_anterior then actual.llamado else v_llamado end,
           tipo = case when v_anterior then actual.tipo else v_tipo end,
           nota = case when v_anterior then actual.nota else v_nota end,
           porcentaje = case when v_anterior then actual.porcentaje else v_pct end,
           fecha = case when v_anterior then actual.fecha else v_fecha end,
           semestre_opuesto = case when v_anterior then actual.semestre_opuesto else v_opuesto end,
           cursada_anterior = v_anterior
     where id = p_id;
    nuevo := p_id;
  else
    insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota, porcentaje, fecha, semestre_opuesto)
    values (p_materia, v_periodo, v_llamado, v_tipo, v_nota, v_pct, v_fecha, v_opuesto)
    returning id into nuevo;
  end if;

  perform public.validar_orden_llamados(u, p_materia);
  return nuevo;
end;
$$;

-- Borra un resultado de final (no el Recu ni la Regu) si nadie lo cambió.
create or replace function public.borrar_final(p_id uuid, p_version integer)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  actual public.examenes_finales;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select * into actual from public.examenes_finales where id = p_id and usuario_id = u for update;
  if not found then
    return; -- ya estaba borrado: reintentar no falla
  end if;
  if actual.version is distinct from p_version then
    raise exception 'Ese resultado cambió en otro dispositivo. Volvé a abrir la materia para ver lo último.'
      using errcode = 'P0001', hint = 'desactualizado';
  end if;
  if actual.tipo in ('recuperatorio', 'regularizacion') then
    raise exception 'El Recu y la Regu se borran desde Parciales.';
  end if;
  delete from public.examenes_finales where id = p_id;
end;
$$;

-- ---------------------------------------------------------------- Recu y Regu
-- Guarda una evaluación de Parciales y, si es un Recu o una Regu rendido, su
-- llamado en Finales, todo junto. p_eval_id es estable (lo genera la app al
-- abrir el formulario): un reintento actualiza la misma fila, no crea otra.
-- p_uso: {tipo, periodo, llamado} o null. Con p_uso null y p_liberar, se
-- quita el llamado de Recu o Regu de la cursada.
create or replace function public.guardar_parcial(
  p_materia uuid, p_eval_id uuid, p_eval jsonb, p_uso jsonb, p_liberar boolean default false)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  previo public.examenes_finales;
  v_tipo text := p_uso->>'tipo';
  v_periodo text := nullif(p_uso->>'periodo', '');
  v_llamado smallint := (p_uso->>'llamado')::smallint;
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
    if exists (select 1 from public.examenes_finales
                where usuario_id = u and materia_id = p_materia and not cursada_anterior
                  and periodo = v_periodo and llamado = v_llamado and id is distinct from previo.id) then
      raise exception 'En ese llamado ya cargaste un resultado de final. Elegí otro llamado o cambiá ese resultado en Finales.';
    end if;
    if previo.id is not null then
      update public.examenes_finales
         set tipo = v_tipo, periodo = v_periodo, llamado = v_llamado, nota = null, porcentaje = null, evaluacion_id = p_eval_id
       where id = previo.id;
    else
      insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota, porcentaje, evaluacion_id)
      values (p_materia, v_periodo, v_llamado, v_tipo, null, null, p_eval_id);
    end if;
  elsif p_liberar and previo.id is not null then
    delete from public.examenes_finales where id = previo.id;
  end if;

  perform public.validar_orden_llamados(u, p_materia);
  return p_eval_id;
end;
$$;

-- Borra una evaluación y, con p_liberar, el llamado de Recu o Regu, juntos.
create or replace function public.borrar_parcial(p_eval_id uuid, p_liberar boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  m uuid;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select materia_id into m from public.evaluaciones where id = p_eval_id and usuario_id = u;
  if m is null then
    return; -- ya estaba borrada
  end if;
  perform pg_advisory_xact_lock(hashtext('finales:' || u::text || ':' || m::text));
  if p_liberar then
    delete from public.examenes_finales
     where usuario_id = u and materia_id = m and not cursada_anterior and tipo in ('recuperatorio', 'regularizacion');
  end if;
  delete from public.evaluaciones where id = p_eval_id and usuario_id = u;
end;
$$;

-- ---------------------------------------------------------------- semestre opuesto
-- Igual que antes, pero si hay finales importados sin ubicar no se sabe
-- cuántos quedan: primero hay que ubicarlos.
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
  if exists (select 1 from public.examenes_finales
              where usuario_id = u and materia_id = p_materia and not cursada_anterior
                and llamado is null and tipo in ('final', 'pendiente')) then
    raise exception 'Tenés finales importados del extracto sin ubicar en esta materia. Indicá el semestre y el llamado de cada uno para saber cuántos te quedan.';
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

  delete from public.evaluaciones where usuario_id = u and materia_id = p_materia and componente = 'teoria';

  insert into public.materias_estudiante (usuario_id, materia_id, estado, nota_final, promedio_firma, nota_desde_final, respaldo_recursada, semestre_opuesto)
  values (u, p_materia, 'cursando', null, null, false, respaldo, true)
  on conflict (usuario_id, materia_id)
  do update set estado = 'cursando', nota_final = null, promedio_firma = null, nota_desde_final = false,
                respaldo_recursada = excluded.respaldo_recursada, semestre_opuesto = true;
end;
$$;

-- ---------------------------------------------------------------- APKs viejos
-- Un APK viejo importa el extracto sin decir el origen: una fila de final
-- con nota y sin semestre ni llamado es una importación.
create or replace function public.examenes_finales_origen()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.origen = 'manual' and new.periodo is null and new.llamado is null
     and new.tipo = 'final' and new.nota is not null and not new.cursada_anterior then
    new.origen := 'extracto';
    new.nota_extracto := coalesce(new.nota_extracto, new.nota);
  end if;
  return new;
end;
$$;
drop trigger if exists examenes_finales_origen on public.examenes_finales;
create trigger examenes_finales_origen before insert on public.examenes_finales
  for each row execute function public.examenes_finales_origen();

-- guardar_llamados (lo usa un APK viejo) borra y vuelve a insertar el
-- semestre: ahora conserva el origen, la nota del extracto, el semestre
-- opuesto y la evaluación de cada llamado que vuelve a guardar.
create or replace function public.guardar_llamados(p_materia uuid, p_periodos text[], p_filas jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  u uuid := auth.uid();
  viejos jsonb;
begin
  if u is null then
    raise exception 'Necesitás iniciar sesión';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'periodo', periodo, 'llamado', llamado, 'origen', origen, 'nota_extracto', nota_extracto,
           'semestre_opuesto', semestre_opuesto, 'evaluacion_id', evaluacion_id)), '[]'::jsonb)
    into viejos
    from public.examenes_finales
   where usuario_id = u and materia_id = p_materia and not cursada_anterior
     and llamado is not null and periodo = any(p_periodos);
  delete from public.examenes_finales
   where usuario_id = u and materia_id = p_materia and not cursada_anterior
     and llamado is not null and periodo = any(p_periodos);
  insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota, porcentaje, fecha,
                                       origen, nota_extracto, semestre_opuesto, evaluacion_id)
  select p_materia, x.periodo, x.llamado, x.tipo, x.nota, x.porcentaje, x.fecha,
         coalesce(v.origen, 'manual'), v.nota_extracto, coalesce(v.semestre_opuesto, false), v.evaluacion_id
    from jsonb_to_recordset(coalesce(p_filas, '[]'::jsonb))
      as x(periodo text, llamado smallint, tipo text, nota smallint, porcentaje numeric, fecha date)
    left join jsonb_to_recordset(viejos)
      as v(periodo text, llamado smallint, origen text, nota_extracto smallint, semestre_opuesto boolean, evaluacion_id uuid)
      on v.periodo = x.periodo and v.llamado = x.llamado;
end;
$$;
revoke execute on function public.guardar_llamados(uuid, text[], jsonb) from public, anon;
grant execute on function public.guardar_llamados(uuid, text[], jsonb) to authenticated;

-- ---------------------------------------------------------------- permisos
revoke execute on function public.guardar_final(uuid, uuid, integer, jsonb, uuid, integer) from public, anon;
grant execute on function public.guardar_final(uuid, uuid, integer, jsonb, uuid, integer) to authenticated;
revoke execute on function public.borrar_final(uuid, integer) from public, anon;
grant execute on function public.borrar_final(uuid, integer) to authenticated;
revoke execute on function public.guardar_parcial(uuid, uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.guardar_parcial(uuid, uuid, jsonb, jsonb, boolean) to authenticated;
revoke execute on function public.borrar_parcial(uuid, boolean) from public, anon;
grant execute on function public.borrar_parcial(uuid, boolean) to authenticated;
revoke execute on function public.validar_orden_llamados(uuid, uuid) from public, anon;
grant execute on function public.validar_orden_llamados(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- perfil
-- El plan elegido tiene que ser de la carrera elegida.
create or replace function public.perfiles_plan_de_carrera()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.plan_id is not null and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id or new.carrera_id is distinct from old.carrera_id)
     and not exists (select 1 from public.planes p where p.id = new.plan_id and p.carrera_id is not distinct from new.carrera_id) then
    raise exception 'Ese plan no es de la carrera elegida. Volvé a elegir la carrera y el plan.';
  end if;
  return new;
end;
$$;
drop trigger if exists perfiles_plan_de_carrera on public.perfiles;
create trigger perfiles_plan_de_carrera before insert or update of plan_id, carrera_id on public.perfiles
  for each row execute function public.perfiles_plan_de_carrera();

-- ---------------------------------------------------------------- guía
-- Solo si el texto sigue siendo el original (una edición del panel se respeta).
update public.tramites
   set descripcion = replace(descripcion,
         'No aplica a materias del plan 2018 ni equivalentes 2008 que estén en la oferta.',
         'También vale para las materias del plan 2018: una resolución posterior al Art. 23 lo abre cuando hay inscriptos (confirmalo en Secretaría Académica).')
 where clave = 'semestre-opuesto'
   and descripcion like '%No aplica a materias del plan 2018 ni equivalentes 2008 que estén en la oferta.%';
