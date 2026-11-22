-- Pruebas de seguridad por fila (RLS) de la app CEQ.
-- Se corren contra un Postgres de prueba con stub_supabase.sql y las
-- migraciones aplicadas (ver .github/workflows/verificar.yml).
-- Cada prueba que falla corta la ejecución con un error que la nombra.
\set ON_ERROR_STOP on
set client_min_messages = warning;
\o /dev/null

-- Ayudantes ---------------------------------------------------------
create or replace function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  execute format('set role %I', case when uid is null then 'anon' else 'authenticated' end);
end $$;

create or replace function pg_temp.debe_fallar(nombre text, consulta text) returns void language plpgsql as $$
begin
  execute consulta;
  raise exception 'FALLÓ: % (se esperaba un error y no lo hubo)', nombre;
exception
  when raise_exception then
    if sqlerrm like 'FALLÓ:%' then raise; end if;
  when others then null;
end $$;

create or replace function pg_temp.debe_ser(nombre text, obtenido bigint, esperado bigint) returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLÓ: % (obtenido %, esperado %)', nombre, obtenido, esperado;
  end if;
end $$;

create or replace function pg_temp.filas(consulta text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute consulta;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- Datos de base (como dueño de la base) ----------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.com', '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.com', '{"full_name":"Beto"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@ejemplo.com', '{"full_name":"Admin"}');
update public.perfiles set rol = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

insert into public.carreras (id, nombre, semestres) values ('10000000-0000-0000-0000-000000000001', 'Química', 10);
insert into public.planes (id, carrera_id, nombre) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Plan 2018');
insert into public.materias (id, plan_id, nombre, semestre) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Química General', 1),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Física I', 1);
insert into public.encuestas (id, pregunta) values ('40000000-0000-0000-0000-000000000001', '¿Te gusta la app?');
insert into public.opciones_encuesta (id, encuesta_id, texto) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Sí'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'No');
insert into public.evaluaciones (usuario_id, materia_id, nombre, ponderacion, porcentaje)
  values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', '1P de Beto', 30, 80);

-- Sin sesión (anon) -------------------------------------------------
select pg_temp.como(null);
select pg_temp.debe_fallar('anon no lee carreras', 'select * from public.carreras');
select pg_temp.debe_fallar('anon no lee perfiles', 'select * from public.perfiles');
select pg_temp.debe_fallar('anon no vota', $$select public.votar('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001')$$);
reset role;

-- Estudiante Ana ----------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana lee el catálogo', (select count(*) from public.materias), 2);
select pg_temp.debe_ser('Ana ve solo su perfil', (select count(*) from public.perfiles), 1);
select pg_temp.debe_ser('Ana no ve evaluaciones de Beto', (select count(*) from public.evaluaciones), 0);
select pg_temp.debe_fallar('Ana no edita el catálogo', $$insert into public.carreras (nombre, semestres) values ('Trucha', 5)$$);
select pg_temp.debe_ser('Ana no modifica materias', pg_temp.filas($q$update public.materias set nombre = 'x'$q$), 0);
select pg_temp.debe_fallar('Ana no se hace admin', $$update public.perfiles set rol = 'admin' where id = auth.uid()$$);
select pg_temp.debe_ser('Ana edita su nombre', pg_temp.filas($q$update public.perfiles set nombre = 'Ana María' where id = auth.uid()$q$), 1);
select pg_temp.debe_ser('Ana no edita el perfil de Beto', pg_temp.filas($q$update public.perfiles set nombre = 'x' where id = '00000000-0000-0000-0000-00000000000b'$q$), 0);
select pg_temp.debe_fallar('Ana no carga notas a nombre de Beto',
  $$insert into public.evaluaciones (usuario_id, materia_id, nombre, ponderacion) values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 'x', 10)$$);
insert into public.evaluaciones (materia_id, nombre, ponderacion, porcentaje) values ('30000000-0000-0000-0000-000000000001', '1P', 30, 70);
select pg_temp.debe_ser('Ana carga su nota', (select count(*) from public.evaluaciones), 1);
insert into public.eventos (titulo, fecha) values ('Parcial', now() + interval '7 days');
select pg_temp.debe_ser('Ana crea su evento sin pasar usuario_id', (select count(*) from public.eventos where usuario_id = auth.uid()), 1);
select pg_temp.debe_fallar('Ana no crea eventos oficiales', $$insert into public.eventos (usuario_id, titulo, fecha) values (null, 'Falso', now())$$);
select pg_temp.debe_fallar('Ana no se responde su sugerencia',
  $$insert into public.sugerencias (texto, estado, respuesta) values ('Hola CEQ', 'respondida', 'Sí, aprobado')$$);
insert into public.sugerencias (texto) values ('Más enchufes en la biblioteca');
select pg_temp.debe_fallar('Ana no lee los votos', 'select * from public.votos');
select pg_temp.debe_fallar('Ana no vacía tablas', 'truncate public.evaluaciones');
select public.votar('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
select pg_temp.debe_fallar('Ana no vota dos veces', $$select public.votar('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002')$$);
select pg_temp.debe_ser('resultados visibles', (select votos from public.resultados_encuesta where opcion_id = '50000000-0000-0000-0000-000000000001'), 1);
select pg_temp.debe_ser('Ana no ve carnets ajenos', (select count(*) from public.socios), 0);
insert into public.examenes_finales (materia_id, llamado, nota) values ('30000000-0000-0000-0000-000000000001', 1, 1);
select pg_temp.debe_ser('aplazo no aprueba la materia', (select count(*) from public.materias_estudiante where estado = 'aprobada'), 0);
insert into public.examenes_finales (materia_id, llamado, nota) values ('30000000-0000-0000-0000-000000000001', 2, 5);
select pg_temp.debe_ser('final aprobado aprueba con su nota', (select nota_final::int from public.materias_estudiante where estado = 'aprobada'), 5);
select pg_temp.debe_fallar('Ana no carga finales a nombre de Beto',
  $$insert into public.examenes_finales (usuario_id, materia_id, nota) values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 5)$$);
select pg_temp.debe_fallar('mismo llamado dos veces',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, nota) values ('30000000-0000-0000-0000-000000000001', '2025-1', 3, 1), ('30000000-0000-0000-0000-000000000001', '2025-1', 3, 2)$$);
delete from public.examenes_finales where nota = 5;
select pg_temp.debe_ser('borrar el final aprobado vuelve a firmada', (select count(*) from public.materias_estudiante where estado = 'firmada' and nota_final is null), 1);
update public.materias_estudiante set estado = 'aprobada', nota_final = 4 where materia_id = '30000000-0000-0000-0000-000000000001';
delete from public.examenes_finales where nota = 1;
select pg_temp.debe_ser('borrar un aplazo no toca una aprobada a mano', (select nota_final::int from public.materias_estudiante where estado = 'aprobada'), 4);
insert into public.examenes_finales (materia_id, nota) values ('30000000-0000-0000-0000-000000000002', 3);
update public.examenes_finales set materia_id = '30000000-0000-0000-0000-000000000001' where materia_id = '30000000-0000-0000-0000-000000000002';
select pg_temp.debe_ser('mover un intento desaprueba la materia vieja', (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000002' and estado = 'aprobada'), 0);
delete from public.examenes_finales;
select pg_temp.debe_fallar('nota de final fuera de escala', $$insert into public.examenes_finales (materia_id, nota) values ('30000000-0000-0000-0000-000000000001', 6)$$);
reset role;

-- Estudiante Beto ---------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto ve solo su evaluación', (select count(*) from public.evaluaciones), 1);
select pg_temp.debe_ser('Beto no ve eventos de Ana', (select count(*) from public.eventos), 0);
select pg_temp.debe_ser('Beto no ve sugerencias de Ana', (select count(*) from public.sugerencias), 0);
select pg_temp.debe_ser('Beto no borra notas de Ana', pg_temp.filas($q$delete from public.evaluaciones where nombre = '1P'$q$), 0);
select pg_temp.debe_ser('Beto no ve finales de Ana', (select count(*) from public.examenes_finales), 0);
reset role;

-- Admin -------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
insert into public.carreras (nombre, semestres) values ('Farmacia', 10);
select pg_temp.debe_ser('admin edita el catálogo', (select count(*) from public.carreras), 2);
insert into public.eventos (usuario_id, titulo, fecha) values (null, 'Inscripciones', now());
select pg_temp.debe_ser('admin ve todos los perfiles', (select count(*) from public.perfiles), 3);
update public.perfiles set rol = 'validador' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.debe_ser('admin ve sugerencias', (select count(*) from public.sugerencias), 1);
select pg_temp.debe_ser('admin no ve notas de estudiantes', (select count(*) from public.evaluaciones), 0);
select pg_temp.debe_fallar('admin tampoco lee votos', 'select * from public.votos');
reset role;

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana ve el evento oficial', (select count(*) from public.eventos where usuario_id is null), 1);
reset role;

-- Promedio de firma ------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into public.materias_estudiante (materia_id, estado, promedio_firma)
  values ('30000000-0000-0000-0000-000000000002', 'firmada', 70)
  on conflict (usuario_id, materia_id) do update set promedio_firma = excluded.promedio_firma;
select pg_temp.debe_ser('Ana guarda su promedio de firma',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000002' and promedio_firma = 70), 1);
select pg_temp.debe_fallar('promedio de firma mayor a 100',
  $$update public.materias_estudiante set promedio_firma = 101 where materia_id = '30000000-0000-0000-0000-000000000002'$$);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto no ve la firma de Ana',
  (select count(*) from public.materias_estudiante where promedio_firma is not null), 0);
reset role;

-- Porcentaje del final -----------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into public.examenes_finales (materia_id, periodo, llamado, nota, porcentaje)
  values ('30000000-0000-0000-0000-000000000002', '2026-2', 1, 4, 88.5);
select pg_temp.debe_ser('Ana guarda el porcentaje del final',
  (select count(*) from public.examenes_finales where porcentaje = 88.5), 1);
select pg_temp.debe_fallar('porcentaje del final mayor a 100',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, nota, porcentaje) values ('30000000-0000-0000-0000-000000000002', '2026-2', 2, 4, 120)$$);
reset role;

-- Todas las tablas públicas tienen RLS ------------------------------
select pg_temp.debe_ser('tablas sin RLS',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0);

\o
\echo 'Todas las pruebas de seguridad pasaron.'
