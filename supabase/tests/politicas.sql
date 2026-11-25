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

-- Regularización y recursada ---------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from public.examenes_finales;
delete from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000001';
insert into public.materias_estudiante (materia_id, estado) values ('30000000-0000-0000-0000-000000000001', 'firmada');
insert into public.examenes_finales (materia_id, periodo, llamado, tipo)
  values ('30000000-0000-0000-0000-000000000001', '2026-1', 1, 'regularizacion');
select pg_temp.debe_ser('la regularización no aprueba la materia',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000001' and estado = 'firmada'), 1);
select pg_temp.debe_fallar('regularización con nota',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota) values ('30000000-0000-0000-0000-000000000001', '2026-1', 2, 'regularizacion', 5)$$);
select pg_temp.debe_fallar('final sin nota',
  $$insert into public.examenes_finales (materia_id, periodo, llamado) values ('30000000-0000-0000-0000-000000000001', '2026-1', 2)$$);
select pg_temp.debe_fallar('tipo de examen inválido',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota) values ('30000000-0000-0000-0000-000000000001', '2026-1', 2, 'otro', 3)$$);
select pg_temp.debe_fallar('el llamado de la regularización ya está usado',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, nota) values ('30000000-0000-0000-0000-000000000001', '2026-1', 1, 4)$$);
select pg_temp.debe_fallar('regularización en el 3.er llamado',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000001', '2026-2', 3, 'regularizacion')$$);
select pg_temp.debe_fallar('recuperatorio en el 2.º llamado',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000001', '2026-2', 2, 'recuperatorio')$$);
select pg_temp.debe_fallar('recuperatorio con nota',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota) values ('30000000-0000-0000-0000-000000000001', '2026-2', 1, 'recuperatorio', 4)$$);
-- Recu o Regu: uno solo por cursada, aunque sea en otro semestre (la
-- regularización del 2026-1 sigue cargada).
select pg_temp.debe_fallar('recu y regu en la misma cursada',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000001', '2026-2', 1, 'recuperatorio')$$);
select pg_temp.debe_fallar('dos regu en la misma cursada',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000001', '2026-2', 2, 'regularizacion')$$);
update public.examenes_finales set tipo = 'recuperatorio' where tipo = 'regularizacion';
select pg_temp.debe_ser('el recuperatorio no aprueba la materia',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000001' and estado = 'firmada'), 1);
-- Al recursar, la nueva cursada puede usar uno de nuevo.
update public.examenes_finales set cursada_anterior = true where tipo = 'recuperatorio';
insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000001', '2026-2', 1, 'regularizacion');
select pg_temp.debe_ser('al recursar se puede volver a usar uno',
  (select count(*) from public.examenes_finales where tipo in ('regularizacion', 'recuperatorio')), 2);
delete from public.examenes_finales where periodo = '2026-2';
update public.examenes_finales set tipo = 'regularizacion', cursada_anterior = false where tipo = 'recuperatorio';
-- Pasar una regularización a final con nota aprueba la materia.
update public.examenes_finales set tipo = 'final', nota = 3 where tipo = 'regularizacion';
select pg_temp.debe_ser('cambiar a final con nota aprueba',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000001' and estado = 'aprobada' and nota_final = 3), 1);
update public.examenes_finales set nota = 1;
-- Recursar: los finales quedan de la cursada anterior.
update public.examenes_finales set cursada_anterior = true where materia_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.debe_ser('Ana marca sus finales como de una cursada anterior',
  (select count(*) from public.examenes_finales where cursada_anterior), 1);
-- En la nueva cursada puede cargar el mismo periodo y llamado.
insert into public.examenes_finales (materia_id, periodo, llamado, nota) values ('30000000-0000-0000-0000-000000000001', '2026-1', 1, 2);
select pg_temp.debe_ser('nueva cursada aprueba con el mismo llamado',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000001' and estado = 'aprobada' and nota_final = 2), 1);
delete from public.examenes_finales where not cursada_anterior;
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
update public.examenes_finales set cursada_anterior = false;
reset role;
select pg_temp.debe_ser('Beto no cambia los finales de Ana',
  (select count(*) from public.examenes_finales where cursada_anterior), 1);

-- Notificaciones y panel de admin ----------------------------------
-- Un aviso de antes de la migración cuenta como ya notificado: editarlo
-- no le manda un push a todos.
alter table public.avisos disable trigger avisos_notificar;
insert into public.avisos (id, titulo, cuerpo) values ('60000000-0000-0000-0000-0000000000ff', 'Aviso viejo', 'De antes.');
alter table public.avisos enable trigger avisos_notificar;
\ir ../migrations/20261122180000_notificaciones.sql
update public.avisos set titulo = 'Aviso viejo (corregido)' where id = '60000000-0000-0000-0000-0000000000ff';
select pg_temp.debe_ser('editar un aviso viejo no lo notifica',
  (select count(*) from public.notificaciones where aviso_id = '60000000-0000-0000-0000-0000000000ff' and estado = 'pendiente'), 0);
update public.perfiles set carrera_id = '10000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_fallar('token inválido', $$select public.registrar_dispositivo('cualquiera', 'android')$$);
select public.registrar_dispositivo('ExponentPushToken[celuDeAna0001]', 'android');
select public.registrar_dispositivo('ExponentPushToken[celuCompartido01]', 'android');
select pg_temp.debe_ser('Ana ve sus celulares', (select count(*) from public.dispositivos), 2);
select pg_temp.debe_ser('Ana no lee la cola de notificaciones', (select count(*) from public.notificaciones), 0);
select pg_temp.debe_fallar('Ana no programa notificaciones',
  $$insert into public.notificaciones (titulo, cuerpo) values ('Spam', 'spam')$$);
select pg_temp.debe_fallar('Ana no ejecuta el cartero', 'select public.procesar_notificaciones()');
select pg_temp.debe_fallar('Ana no ve el resumen del admin', 'select public.resumen_admin()');
select pg_temp.debe_fallar('Ana no lee los envíos', 'select * from public.envios_push');
select pg_temp.debe_fallar('Ana no publica avisos', $$insert into public.avisos (titulo, cuerpo) values ('x', 'y')$$);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
-- Beto inicia sesión en el celular que antes usaba Ana: pasa a ser suyo.
select public.registrar_dispositivo('ExponentPushToken[celuCompartido01]', 'android');
select pg_temp.debe_ser('Beto se queda con el celular compartido', (select count(*) from public.dispositivos), 1);
insert into public.eventos (titulo, fecha, aviso_minutos) values ('Parcial de Beto', now() + interval '2 hours', 1440);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana ya no tiene el celular compartido', (select count(*) from public.dispositivos), 1);
insert into public.eventos (titulo, fecha, aviso_minutos) values ('Final de Química General', now() + interval '3 days', 1440);
reset role;

select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
insert into public.avisos (id, titulo, cuerpo) values ('60000000-0000-0000-0000-000000000001', 'Asamblea', 'El jueves a las 18 h.');
insert into public.avisos (id, titulo, cuerpo, publicar_en) values ('60000000-0000-0000-0000-000000000002', 'Programado', 'Sale mañana.', now() + interval '1 day');
insert into public.avisos (id, titulo, cuerpo, carrera_id) values ('60000000-0000-0000-0000-000000000003', 'Solo Química', 'Para Química.', '10000000-0000-0000-0000-000000000001');
insert into public.avisos (id, titulo, cuerpo, notificar) values ('60000000-0000-0000-0000-000000000004', 'Sin aviso', 'Silencioso.', false);
insert into public.notificaciones (titulo, cuerpo, programada_para) values ('Inscripción a finales', 'Cierra hoy.', now() - interval '1 minute');
insert into public.notificaciones (titulo, cuerpo, programada_para) values ('Para cancelar', 'x', now() + interval '1 hour');
select pg_temp.debe_ser('el admin ve las notificaciones generales', (select count(*) from public.notificaciones), 6);
select pg_temp.debe_ser('el admin cancela una programada',
  pg_temp.filas($q$update public.notificaciones set estado = 'cancelada' where titulo = 'Para cancelar'$q$), 1);
select pg_temp.debe_fallar('el admin no marca como enviada',
  $$update public.notificaciones set estado = 'enviada' where titulo = 'Inscripción a finales'$$);
select pg_temp.debe_fallar('el admin no escribe recordatorios personales',
  $$insert into public.notificaciones (titulo, cuerpo, usuario_id) values ('x', 'y', '00000000-0000-0000-0000-00000000000a')$$);
select pg_temp.debe_ser('el admin ve el aviso programado', (select count(*) from public.avisos where id = '60000000-0000-0000-0000-000000000002'), 1);
select pg_temp.debe_ser('alcance para todos', public.alcance_notificacion(null), 2);
select pg_temp.debe_ser('alcance para Química', public.alcance_notificacion('10000000-0000-0000-0000-000000000001'), 1);
reset role;

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana no ve el aviso programado', (select count(*) from public.avisos where id = '60000000-0000-0000-0000-000000000002'), 0);
select pg_temp.debe_ser('Ana ve el aviso de su carrera', (select count(*) from public.avisos where id = '60000000-0000-0000-0000-000000000003'), 1);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto no ve el aviso de otra carrera', (select count(*) from public.avisos where id = '60000000-0000-0000-0000-000000000003'), 0);
reset role;

-- El cartero (como lo corre pg_cron).
select pg_temp.debe_ser('salen aviso general, aviso de carrera, mensaje y recordatorio de Beto', public.procesar_notificaciones(), 4);
select pg_temp.debe_ser('el aviso programado sigue pendiente',
  (select count(*) from public.notificaciones where aviso_id = '60000000-0000-0000-0000-000000000002' and estado = 'pendiente'), 1);
select pg_temp.debe_ser('el aviso sin notificar no se encola',
  (select count(*) from public.notificaciones where aviso_id = '60000000-0000-0000-0000-000000000004'), 0);
select pg_temp.debe_ser('la cancelada no sale', (select count(*) from net.pedidos where body::text like '%Para cancelar%'), 0);
select pg_temp.debe_ser('el aviso general llega a los dos celulares',
  (select jsonb_array_length(body) from net.pedidos where body::text like '%Asamblea%'), 2);
select pg_temp.debe_ser('el aviso de Química llega solo a Ana',
  (select count(*) from net.pedidos where body::text like '%Solo Química%' and body::text like '%celuDeAna0001%' and jsonb_array_length(body) = 1), 1);
select pg_temp.debe_ser('el recordatorio de Beto llega solo a Beto',
  (select count(*) from net.pedidos where body::text like '%Parcial de Beto%' and body::text like '%celuCompartido01%' and jsonb_array_length(body) = 1), 1);
select pg_temp.debe_ser('el final de Ana (en 3 días) todavía no se avisa', (select count(*) from net.pedidos where body::text like '%Final de Química%'), 0);
select pg_temp.debe_ser('el tocar abre el aviso',
  (select count(*) from net.pedidos where body -> 0 -> 'data' ->> 'ruta' = '/aviso/60000000-0000-0000-0000-000000000001'), 1);
select pg_temp.debe_ser('una segunda pasada no repite nada', public.procesar_notificaciones(), 0);

-- Editar un aviso ya enviado no lo vuelve a mandar.
update public.avisos set titulo = 'Asamblea (cambió el horario)' where id = '60000000-0000-0000-0000-000000000001';
select pg_temp.debe_ser('editar un aviso enviado no lo reenvía', public.procesar_notificaciones(), 0);
-- Despublicar el programado lo cancela.
update public.avisos set publicado = false where id = '60000000-0000-0000-0000-000000000002';
select pg_temp.debe_ser('despublicar cancela la notificación',
  (select count(*) from public.notificaciones where aviso_id = '60000000-0000-0000-0000-000000000002' and estado = 'cancelada'), 1);

-- Ana apaga los avisos: no le llegan, pero sí sus recordatorios.
update public.perfiles set notif_avisos = false where id = '00000000-0000-0000-0000-00000000000a';
update public.eventos set fecha = now() + interval '1 hour' where titulo = 'Final de Química General';
insert into public.notificaciones (titulo, cuerpo, creada_por) values ('Solo para quien quiere avisos', 'x', null);
select pg_temp.debe_ser('sale el mensaje y el recordatorio de Ana', public.procesar_notificaciones(), 2);
select pg_temp.debe_ser('a Ana no le llega el mensaje',
  (select count(*) from net.pedidos where body::text like '%Solo para quien quiere avisos%' and body::text like '%celuDeAna0001%'), 0);
select pg_temp.debe_ser('a Ana le llega su recordatorio',
  (select count(*) from net.pedidos where body::text like '%Final de Química%' and body::text like '%celuDeAna0001%'), 1);

-- Un evento sin título no traba el envío para nadie.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into public.eventos (titulo, fecha, aviso_minutos) values ('', now() + interval '30 minutes', 60);
reset role;
insert into public.notificaciones (titulo, cuerpo, creada_por) values ('Sale igual', 'x', null);
select pg_temp.debe_ser('un evento sin título no rompe el cartero', public.procesar_notificaciones(), 2);
select pg_temp.debe_ser('el recordatorio sin título usa uno genérico',
  (select count(*) from net.pedidos where body -> 0 ->> 'title' = 'Recordatorio'), 1);

-- Expo avisa que el celular de Ana se desinstaló: se borra.
insert into net._http_response (id, status_code, content)
select id, 200, '{"data":[{"status":"error","details":{"error":"DeviceNotRegistered"}}]}'
from net.pedidos where body::text like '%Final de Química%';
insert into net._http_response (id, status_code, content)
select id, 500, 'no es json' from net.pedidos where body::text like '%Asamblea%';
select public.procesar_notificaciones();
select pg_temp.debe_ser('se borra el celular dado de baja', (select count(*) from public.dispositivos where token = 'ExponentPushToken[celuDeAna0001]'), 0);
select pg_temp.debe_ser('los demás celulares siguen', (select count(*) from public.dispositivos), 1);

-- Guía de trámites ---------------------------------------------------
reset role;
select pg_temp.debe_ser('la guía inicial se cargó una sola vez', (select count(*) from public.tramites where clave is not null), (select count(distinct clave) from public.tramites));
select pg_temp.debe_ser('la guía inicial no está vacía', (select (count(*) >= 30)::int from public.tramites), 1);
select pg_temp.debe_fallar('trámite con enlace inseguro', $$insert into public.tramites (nombre, pasos, formulario_url) values ('Algo', '{a}', 'http://x.com')$$);
select pg_temp.debe_fallar('trámite con modalidad inventada', $$insert into public.tramites (nombre, pasos, modalidad) values ('Algo', '{a}', 'fax')$$);
select pg_temp.como(null);
select pg_temp.debe_fallar('anon no lee trámites', 'select * from public.tramites');
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('admin oculta un trámite', pg_temp.filas($q$update public.tramites set publicado = false where clave = 'titulo-grado'$q$), 1);
insert into public.tramites (nombre, categoria, pasos) values ('Trámite del CEQ', 'Otros', '{Ir a la sede}');
select pg_temp.debe_ser('admin ve los ocultos', (select count(*) from public.tramites where not publicado), 1);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana no ve los ocultos', (select count(*) from public.tramites where clave = 'titulo-grado'), 0);
select pg_temp.debe_ser('Ana ve el trámite nuevo', (select count(*) from public.tramites where nombre = 'Trámite del CEQ'), 1);
select pg_temp.debe_fallar('Ana no crea trámites', $$insert into public.tramites (nombre, pasos) values ('Trucho', '{a}')$$);
select pg_temp.debe_ser('Ana no edita trámites', pg_temp.filas($q$update public.tramites set costo = 'gratis'$q$), 0);
select pg_temp.debe_ser('Ana no borra trámites', pg_temp.filas($q$delete from public.tramites$q$), 0);
reset role;

-- Carnet de socio con QR (solo quien pagó, verificable) -------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'vale@ejemplo.com', '{"full_name":"Vale"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'ceci@ejemplo.com', '{"full_name":"Ceci"}');
update public.perfiles set rol = 'validador' where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
select pg_temp.debe_fallar('Ceci no se da de alta como socia', $$insert into public.socios (ci, nombre, usuario_id) values ('111', 'Ana', '00000000-0000-0000-0000-00000000000a')$$);
select pg_temp.debe_fallar('Ceci no verifica carnets', $$select public.verificar_carnet('CEQ-0001')$$);
select pg_temp.debe_fallar('Ceci no busca estudiantes', $$select * from public.buscar_estudiantes('ana')$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('admin encuentra a Ana por correo', (select count(*) from public.buscar_estudiantes('ana@')), 1);
insert into public.socios (ci, nombre, usuario_id, vigente_hasta)
  values ('4.555.666', 'Ana', '00000000-0000-0000-0000-00000000000a', '2099-12-31');
insert into public.socios (ci, nombre, numero_socio) values ('888', 'A mano', 'CEQ-0003');
insert into public.socios (ci, nombre, vigente_hasta) values ('777', 'Vencida', '2020-12-31');
select pg_temp.debe_ser('número de socio automático sin chocar con uno a mano', (select count(*) from public.socios where numero_socio like 'CEQ-0%'), 3);
select pg_temp.debe_ser('C.I. sin puntos', (select count(*) from public.socios where ci = '4555666'), 1);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana ve solo su carnet', (select count(*) from public.socios), 1);
select pg_temp.debe_ser('Ana no edita su vigencia', pg_temp.filas($q$update public.socios set vigente_hasta = '2199-01-01'$q$), 0);
select pg_temp.debe_fallar('Ana no ve verificaciones', $$select public.verificar_carnet('x')$$);
select pg_temp.debe_fallar('Ana no pone foto fuera de su carpeta', $$select public.poner_foto_carnet((select id from public.socios), '00000000-0000-0000-0000-00000000000b/f.jpg')$$);
select public.poner_foto_carnet((select id from public.socios), '00000000-0000-0000-0000-00000000000a/f.jpg');
create temp table if not exists codigos (socio uuid, viejo text, nuevo text);
grant all on codigos to authenticated;
insert into codigos (socio, viejo) select id, codigo_qr from public.socios;
update codigos set nuevo = public.renovar_codigo_carnet((select id from public.socios));
select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
select pg_temp.debe_fallar('Ceci no renueva el QR de Ana', $$select public.renovar_codigo_carnet((select socio from codigos))$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select pg_temp.debe_ser('validador no baja la lista de carnets ni sus códigos', (select count(*) from public.socios), 0);
select pg_temp.debe_ser('QR vigente', (select (public.verificar_carnet('CEQ1:' || nuevo)->>'resultado' = 'vigente')::int from codigos), 1);
select pg_temp.debe_ser('QR viejo ya no sirve', (select (public.verificar_carnet('CEQ1:' || viejo)->>'resultado' = 'no_encontrado')::int from codigos), 1);
select pg_temp.debe_ser('por C.I. con puntos', (public.verificar_carnet('4.555.666')->>'nombre' = 'Ana')::int, 1);
select pg_temp.debe_ser('carnet vencido', (public.verificar_carnet('777')->>'resultado' = 'vencido')::int, 1);
select pg_temp.debe_ser('QR con espacio tras el prefijo', (select (public.verificar_carnet('CEQ1: ' || nuevo)->>'resultado' = 'vigente')::int from codigos), 1);
select pg_temp.debe_ser('validador no edita socios', pg_temp.filas($q$update public.socios set activo = false$q$), 0);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
update public.socios set activo = false where ci = '4555666';
select pg_temp.debe_ser('admin ve el registro de verificaciones', (select count(*) from public.verificaciones_carnet), 5);
select pg_temp.debe_ser('carnet dado de baja', (select (public.verificar_carnet('4555666')->>'resultado' = 'inactivo')::int), 1);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana no ve el registro', (select count(*) from public.verificaciones_carnet), 0);
select pg_temp.debe_fallar('nadie escribe el registro a mano', $$insert into public.verificaciones_carnet (resultado) values ('vigente')$$);
reset role;


-- Volver a cursar y deshacer ----------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from public.examenes_finales;
delete from public.evaluaciones where materia_id = '30000000-0000-0000-0000-000000000002';
delete from public.asistencias where materia_id = '30000000-0000-0000-0000-000000000002';
insert into public.materias_estudiante (materia_id, estado, promedio_firma)
  values ('30000000-0000-0000-0000-000000000002', 'firmada', 65)
  on conflict (usuario_id, materia_id) do update set estado = 'firmada', promedio_firma = 65, nota_final = null, nota_desde_final = false;
insert into public.evaluaciones (materia_id, nombre, ponderacion, porcentaje) values ('30000000-0000-0000-0000-000000000002', '1P', 1, 55), ('30000000-0000-0000-0000-000000000002', '2P', 1, 60);
insert into public.evaluaciones (materia_id, nombre, componente, ponderacion, porcentaje) values ('30000000-0000-0000-0000-000000000002', 'Lab', 'laboratorio', 1, 80);
insert into public.asistencias (materia_id, componente, clases_dictadas, clases_asistidas) values ('30000000-0000-0000-0000-000000000002', 'teoria', 20, 18);
insert into public.examenes_finales (materia_id, periodo, llamado, nota) values
  ('30000000-0000-0000-0000-000000000002', '2026-2', 1, 1), ('30000000-0000-0000-0000-000000000002', '2026-2', 2, 1), ('30000000-0000-0000-0000-000000000002', '2026-2', 3, 1);
select public.recursar_materia('30000000-0000-0000-0000-000000000002');
select pg_temp.debe_ser('recursar deja la materia cursando sin firma',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000002' and estado = 'cursando' and promedio_firma is null and respaldo_recursada is not null), 1);
select pg_temp.debe_fallar('no se recursa dos veces seguidas',
  $$select public.recursar_materia('30000000-0000-0000-0000-000000000002')$$);
select pg_temp.debe_ser('recursar borra parciales y conserva el laboratorio',
  (select count(*) from public.evaluaciones where materia_id = '30000000-0000-0000-0000-000000000002'), 1);
select pg_temp.debe_ser('recursar borra la asistencia de teoría',
  (select count(*) from public.asistencias where materia_id = '30000000-0000-0000-0000-000000000002'), 0);
select pg_temp.debe_ser('recursar deja los finales en la cursada anterior',
  (select count(*) from public.examenes_finales where materia_id = '30000000-0000-0000-0000-000000000002' and cursada_anterior), 3);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_fallar('Beto no deshace la recursada de Ana',
  $$select public.deshacer_recursada('30000000-0000-0000-0000-000000000002')$$);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
-- Con un parcial nuevo cargado no se deshace (no se borra nada).
insert into public.evaluaciones (materia_id, nombre, ponderacion, porcentaje) values ('30000000-0000-0000-0000-000000000002', 'Nuevo 1P', 1, 90);
select pg_temp.debe_fallar('no se deshace con datos nuevos',
  $$select public.deshacer_recursada('30000000-0000-0000-0000-000000000002')$$);
delete from public.evaluaciones where nombre = 'Nuevo 1P';
select public.deshacer_recursada('30000000-0000-0000-0000-000000000002');
select pg_temp.debe_ser('deshacer vuelve a firmada con su firma',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000002' and estado = 'firmada' and promedio_firma = 65 and respaldo_recursada is null), 1);
select pg_temp.debe_ser('deshacer devuelve los parciales',
  (select count(*) from public.evaluaciones where materia_id = '30000000-0000-0000-0000-000000000002'), 3);
select pg_temp.debe_ser('deshacer devuelve la asistencia',
  (select count(*) from public.asistencias where materia_id = '30000000-0000-0000-0000-000000000002' and clases_asistidas = 18), 1);
select pg_temp.debe_ser('deshacer devuelve los finales a la cursada',
  (select count(*) from public.examenes_finales where materia_id = '30000000-0000-0000-0000-000000000002' and not cursada_anterior), 3);
select pg_temp.debe_fallar('no se deshace dos veces',
  $$select public.deshacer_recursada('30000000-0000-0000-0000-000000000002')$$);
reset role;
select pg_temp.debe_fallar('sin sesión no se recursa',
  $$set local role anon; select public.recursar_materia('30000000-0000-0000-0000-000000000002')$$);

-- Recordatorios antes de clase ----------------------------------------
-- Horas de Paraguay: lunes 23/11/2026.
create or replace function pg_temp.py(t text) returns timestamptz language sql as $$
  select t::timestamp at time zone 'America/Asuncion'
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
insert into public.horario (titulo, dia_semana, hora_inicio, hora_fin, aula, aviso_minutos)
  values ('Química Orgánica', 1, '07:30', '09:30', 'Aula 12', 30);
insert into public.horario (titulo, dia_semana, hora_inicio, hora_fin) values ('Sin aviso', 1, '07:15', '08:00');
insert into public.horario (titulo, dia_semana, hora_inicio, hora_fin, aviso_minutos) values ('Muy temprano', 2, '00:15', '01:00', 60);
select pg_temp.debe_fallar('aviso de 1 minuto no se acepta',
  $$insert into public.horario (titulo, dia_semana, hora_inicio, hora_fin, aviso_minutos) values ('x', 3, '08:00', '09:00', 1)$$);
select pg_temp.debe_fallar('Beto no ejecuta el encolador', 'select public.encolar_recordatorios_clases()');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana no ve el horario de Beto', (select count(*) from public.horario), 0);
select pg_temp.debe_ser('Ana no cambia el aviso de Beto', pg_temp.filas('update public.horario set aviso_minutos = 5'), 0);
reset role;

select pg_temp.debe_ser('a las 06:59 todavía no', public.encolar_recordatorios_clases(pg_temp.py('2026-11-23 06:59')), 0);
select pg_temp.debe_ser('a las 07:00 avisa la clase de las 07:30', public.encolar_recordatorios_clases(pg_temp.py('2026-11-23 07:00')), 1);
select pg_temp.debe_ser('no repite el mismo día', public.encolar_recordatorios_clases(pg_temp.py('2026-11-23 07:10')), 0);
select public.procesar_notificaciones();
select pg_temp.debe_ser('el aviso de clase llega a Beto con el aula',
  (select count(*) from net.pedidos where body -> 0 ->> 'title' = 'Química Orgánica'
     and body -> 0 ->> 'body' = 'Empieza a las 07:30 en Aula 12.' and body::text like '%celuCompartido01%'), 1);
select pg_temp.debe_ser('la semana siguiente vuelve a avisar', public.encolar_recordatorios_clases(pg_temp.py('2026-11-30 07:05')), 1);
select pg_temp.debe_ser('ya empezada la clase no avisa', public.encolar_recordatorios_clases(pg_temp.py('2026-12-07 07:31')), 0);
update public.horario set hora_inicio = '08:00' where titulo = 'Química Orgánica';
select pg_temp.debe_ser('si cambia la hora vuelve a avisar ese día', public.encolar_recordatorios_clases(pg_temp.py('2026-11-30 07:40')), 1);
select pg_temp.debe_ser('la clase de las 00:15 del martes se avisa el lunes a la noche',
  public.encolar_recordatorios_clases(pg_temp.py('2026-11-23 23:20')), 1);
select pg_temp.debe_ser('la clase sin aviso nunca se encola',
  (select count(*) from public.notificaciones where titulo = 'Sin aviso'), 0);

-- Borrar mi cuenta ----------------------------------------------------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000cc', 'carla@ejemplo.com', '{"full_name":"Carla"}');
insert into public.evaluaciones (usuario_id, materia_id, nombre, ponderacion, porcentaje)
  values ('00000000-0000-0000-0000-0000000000cc', '30000000-0000-0000-0000-000000000001', '1P de Carla', 30, 70);
select pg_temp.como(null);
select pg_temp.debe_fallar('anon no puede borrar cuentas', 'select public.eliminar_mi_cuenta()');
select pg_temp.como('00000000-0000-0000-0000-0000000000cc');
select public.eliminar_mi_cuenta();
reset role;
select pg_temp.debe_ser('se borra el usuario', (select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000cc'), 0);
select pg_temp.debe_ser('se borra su perfil', (select count(*) from public.perfiles where id = '00000000-0000-0000-0000-0000000000cc'), 0);
select pg_temp.debe_ser('se borran sus notas', (select count(*) from public.evaluaciones where usuario_id = '00000000-0000-0000-0000-0000000000cc'), 0);
select pg_temp.debe_ser('los demás usuarios siguen', (select count(*) from auth.users where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 2);
select pg_temp.debe_ser('las notas de Beto siguen', (select (count(*) > 0)::int from public.evaluaciones where usuario_id = '00000000-0000-0000-0000-00000000000b'), 1);

-- Validar el carnet físico con una foto ------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
insert into public.socios (ci, nombre, vigente_hasta) values ('5300222', 'Carla Duarte', '2025-12-31');
select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
select pg_temp.debe_fallar('carnet vencido no se valida', $$select public.solicitar_carnet('Carla Vencida', '5300222', null, '2020-12-31', '00000000-0000-0000-0000-0000000000c2/f.jpg')$$);
select pg_temp.debe_fallar('vencimiento imposible (más de 6 años)', $$select public.solicitar_carnet('Carla', '5300222', null, (current_date + 2600), '00000000-0000-0000-0000-0000000000c2/f.jpg')$$);
select pg_temp.debe_fallar('la foto tiene que ser suya', $$select public.solicitar_carnet('Carla', '5300222', null, (current_date + 300), '00000000-0000-0000-0000-00000000000a/f.jpg')$$);
select pg_temp.debe_fallar('no escribe la tabla a mano', $$insert into public.solicitudes_carnet (nombre, ci, vigente_hasta, foto_path) values ('x', '1234', current_date + 10, 'x')$$);
-- Otro diseño de carnet, que dura más de 3 años: se acepta.
select public.solicitar_carnet('Carla Duarte', '5.300.222', null, (current_date + 1500), '00000000-0000-0000-0000-0000000000c2/f1.jpg');
select public.solicitar_carnet('Carla Duarte', '5300222', 'CEQ-0777', (current_date + 400), '00000000-0000-0000-0000-0000000000c2/f2.jpg');
select pg_temp.debe_ser('una sola pendiente (la segunda la reemplaza)', (select count(*) from public.solicitudes_carnet), 1);
select pg_temp.debe_fallar('no se aprueba a sí misma', $$select public.aprobar_solicitud_carnet(id, created_at) from public.solicitudes_carnet$$);
select pg_temp.debe_ser('Carla ve su solicitud', (select count(*) from public.solicitudes_carnet), 1);
select pg_temp.debe_ser('sin aprobar no tiene carnet', (select count(*) from public.socios), 0);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana no ve solicitudes ajenas', (select count(*) from public.solicitudes_carnet), 0);
reset role;
create temp table if not exists sols as select id, created_at from public.solicitudes_carnet;
grant select on sols to authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select pg_temp.debe_fallar('validador no aprueba', $$select public.aprobar_solicitud_carnet(id, created_at) from sols$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('admin ve la pendiente', (select count(*) from public.solicitudes_carnet where estado = 'pendiente'), 1);
select pg_temp.debe_fallar('no aprueba una versión que no vio', $$select public.aprobar_solicitud_carnet((select id from public.solicitudes_carnet where estado = 'pendiente'), '2000-01-01')$$);
select public.aprobar_solicitud_carnet(id, created_at) from public.solicitudes_carnet where estado = 'pendiente';
select pg_temp.debe_ser('se vincula al socio que el CEQ cargó con esa cédula', (select count(*) from public.socios where ci = '5300222' and usuario_id = '00000000-0000-0000-0000-0000000000c2' and numero_socio = 'CEQ-0777' and vigente_hasta = current_date + 400), 1);
select pg_temp.debe_fallar('no se aprueba dos veces', $$select public.aprobar_solicitud_carnet(id, created_at) from sols$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
select pg_temp.debe_ser('Carla ve su carnet', (select count(*) from public.socios), 1);
select pg_temp.debe_fallar('con carnet vigente no pide otro', $$select public.solicitar_carnet('Carla', '5300222', null, (current_date + 300), '00000000-0000-0000-0000-0000000000c2/f3.jpg')$$);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_fallar('socio dado de baja no se reactiva solo', $$select public.solicitar_carnet('Ana', '4555666', null, (current_date + 30), '00000000-0000-0000-0000-00000000000a/f.jpg')$$);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.solicitar_carnet('Beto', '6000111', null, (current_date + 30), '00000000-0000-0000-0000-00000000000b/f.jpg');
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select public.rechazar_solicitud_carnet((select id from public.solicitudes_carnet where estado = 'pendiente'), 'La foto no se lee');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto ve el motivo del rechazo', (select count(*) from public.solicitudes_carnet where estado = 'rechazada' and motivo = 'La foto no se lee'), 1);
select pg_temp.debe_ser('rechazada no habilita', (select count(*) from public.socios where activo), 0);
reset role;

-- Calendario académico ----------------------------------------------
reset role;
select pg_temp.debe_ser('el calendario 2026 se cargó una sola vez', (select count(*) from public.calendario_academico where clave is not null), (select count(distinct clave) from public.calendario_academico));
select pg_temp.debe_ser('el calendario no está vacío', (select (count(*) >= 60)::int from public.calendario_academico), 1);
select pg_temp.debe_fallar('rango al revés', $$insert into public.calendario_academico (anio, categoria, titulo, desde, hasta) values (2026, 'clases', 'Algo', '2026-05-02', '2026-05-01')$$);
select pg_temp.debe_fallar('categoría inventada', $$insert into public.calendario_academico (anio, categoria, titulo, desde, hasta) values (2026, 'fiesta', 'Algo', '2026-05-01', '2026-05-01')$$);
select pg_temp.como(null);
select pg_temp.debe_fallar('anon no lee el calendario', 'select * from public.calendario_academico');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana lee el calendario', (select (count(*) >= 60)::int from public.calendario_academico), 1);
select pg_temp.debe_fallar('Ana no agrega fechas', $$insert into public.calendario_academico (anio, categoria, titulo, desde, hasta) values (2026, 'clases', 'Trucho', '2026-05-01', '2026-05-01')$$);
select pg_temp.debe_ser('Ana no edita fechas', pg_temp.filas($q$update public.calendario_academico set titulo = 'Sin clases'$q$), 0);
select pg_temp.debe_ser('Ana no borra fechas', pg_temp.filas($q$delete from public.calendario_academico$q$), 0);
select pg_temp.debe_fallar('Ana no ve las claves borradas', 'select * from public.calendario_claves_borradas');
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
insert into public.calendario_academico (anio, semestre, categoria, titulo, desde, hasta) values (2027, 1, 'clases', 'Clases 2027', '2027-02-22', '2027-06-05');
select pg_temp.debe_ser('admin edita una fecha', pg_temp.filas($q$update public.calendario_academico set titulo = 'Navidad (feriado)' where clave = '2026-fer-navidad'$q$), 1);
select pg_temp.debe_ser('admin borra una fecha', pg_temp.filas($q$delete from public.calendario_academico where clave = '2026-asu-noche-vieja'$q$), 1);
reset role;
\i supabase/migrations/20261123120000_calendario_academico.sql
select pg_temp.debe_ser('lo borrado no vuelve al re-ejecutar', (select count(*) from public.calendario_academico where clave = '2026-asu-noche-vieja'), 0);
select pg_temp.debe_ser('lo editado no se pisa', (select count(*) from public.calendario_academico where titulo = 'Navidad (feriado)'), 1);

-- Panel: aviso de carnets por validar --------------------------------
reset role;
select pg_temp.debe_ser('al admin le llega un aviso por cada pedido (el reenvío inmediato no repite)',
  (select count(*) from public.notificaciones where ruta = '/admin/solicitudes-carnet' and usuario_id = '00000000-0000-0000-0000-0000000000ad'), 2);
select pg_temp.debe_ser('a los estudiantes no les llega',
  (select count(*) from public.notificaciones where ruta = '/admin/solicitudes-carnet' and usuario_id <> '00000000-0000-0000-0000-0000000000ad'), 0);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('el resumen cuenta los carnets pendientes', (public.pendientes_panel() ->> 'carnets_pendientes')::int, 0);
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_fallar('Ana no ve los pendientes del panel', 'select public.pendientes_panel()');

-- Horarios de finales ------------------------------------------------
select pg_temp.debe_fallar('Ana no carga horarios', $$insert into public.horarios_finales (carrera_id, titulo) values ('10000000-0000-0000-0000-000000000001', 'Trucho')$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_fallar('no se crea ya publicado', $$insert into public.horarios_finales (carrera_id, titulo, publicado) values ('10000000-0000-0000-0000-000000000001', 'Diciembre', true)$$);
insert into public.horarios_finales (id, carrera_id, titulo) values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Diciembre 2026');
select pg_temp.debe_fallar('no se publica vacío', $$select public.publicar_horario_finales('60000000-0000-0000-0000-000000000001')$$);
select pg_temp.debe_ser('guarda las fechas de una vez', public.guardar_fechas_finales('60000000-0000-0000-0000-000000000001',
  '[{"materia":"Química General","llamado":1,"fecha":"2026-12-07","hora":"08:00"},{"materia":"Química General","llamado":2,"fecha":"2026-12-21","hora":""},{"materia":"Física I","llamado":1,"fecha":"2026-12-09","hora":"13:30","aula":"Aula 3"}]'::jsonb), 3);
select pg_temp.debe_fallar('fecha inválida no guarda nada', $$select public.guardar_fechas_finales('60000000-0000-0000-0000-000000000001', '[{"materia":"Física I","llamado":1,"fecha":"2026-13-40"}]'::jsonb)$$);
select pg_temp.debe_ser('las fechas siguen enteras tras el error', (select count(*) from public.fechas_finales), 3);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto no ve el borrador', (select count(*) from public.horarios_finales), 0);
select pg_temp.debe_ser('Beto no ve sus fechas', (select count(*) from public.fechas_finales), 0);
select pg_temp.debe_fallar('Beto no publica', $$select public.publicar_horario_finales('60000000-0000-0000-0000-000000000001')$$);
select pg_temp.debe_fallar('Beto no guarda fechas', $$select public.guardar_fechas_finales('60000000-0000-0000-0000-000000000001', '[]'::jsonb)$$);
select pg_temp.debe_ser('Beto no publica a mano', pg_temp.filas($q$update public.horarios_finales set publicado = true$q$), 0);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('publicar devuelve las fechas', public.publicar_horario_finales('60000000-0000-0000-0000-000000000001'), 3);
select public.publicar_horario_finales('60000000-0000-0000-0000-000000000001');
update public.horarios_finales set publicado = false where id = '60000000-0000-0000-0000-000000000001';
select public.publicar_horario_finales('60000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.debe_ser('avisa una sola vez a la carrera (ni al re-publicar tras ocultarlo)', (select count(*) from public.notificaciones where ruta = '/finales-fechas' and carrera_id = '10000000-0000-0000-0000-000000000001' and usuario_id is null), 1);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto ve el horario publicado', (select count(*) from public.fechas_finales), 3);
select pg_temp.debe_ser('Beto no borra fechas', pg_temp.filas($q$delete from public.fechas_finales$q$), 0);

-- Horarios de clases oficiales ---------------------------------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_fallar('Ana no carga horarios de clases', $$insert into public.horarios_clases (carrera_id, titulo) values ('10000000-0000-0000-0000-000000000001', 'Trucho')$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_fallar('no se crea ya publicado (clases)', $$insert into public.horarios_clases (carrera_id, titulo, publicado) values ('10000000-0000-0000-0000-000000000001', '1.er periodo', true)$$);
insert into public.horarios_clases (id, carrera_id, plan_anio, titulo) values ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2018, '1.er periodo 2027');
select pg_temp.debe_fallar('no se publica sin clases', $$select public.publicar_horario_clases('61000000-0000-0000-0000-000000000001')$$);
select pg_temp.debe_ser('guarda las clases de una vez', public.guardar_clases_oficiales('61000000-0000-0000-0000-000000000001',
  '[{"materia":"Química General","nivel":1,"seccion":"A","dia_semana":1,"hora_inicio":"07:00","hora_fin":"08:30","aula":"Aula 12","tipo_clase":"teoria"},{"materia":"Física I","nivel":1,"dia_semana":2,"hora_inicio":"07:00","hora_fin":"08:30","aula":"","tipo_clase":""}]'::jsonb), 2);
select pg_temp.debe_fallar('hora al revés no guarda nada', $$select public.guardar_clases_oficiales('61000000-0000-0000-0000-000000000001', '[{"materia":"Física I","dia_semana":2,"hora_inicio":"09:00","hora_fin":"08:00"}]'::jsonb)$$);
select pg_temp.debe_fallar('tipo de clase inventado', $$select public.guardar_clases_oficiales('61000000-0000-0000-0000-000000000001', '[{"materia":"Física I","dia_semana":2,"hora_inicio":"07:00","hora_fin":"08:00","tipo_clase":"siesta"}]'::jsonb)$$);
select pg_temp.debe_ser('las clases siguen enteras tras el error', (select count(*) from public.clases_oficiales), 2);
select pg_temp.debe_ser('el panel cuenta el borrador', (public.pendientes_panel() ->> 'clases_borrador')::int, 1);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto no ve el horario en borrador', (select count(*) from public.horarios_clases), 0);
select pg_temp.debe_ser('Beto no ve sus clases', (select count(*) from public.clases_oficiales), 0);
select pg_temp.debe_fallar('Beto no publica el horario de clases', $$select public.publicar_horario_clases('61000000-0000-0000-0000-000000000001')$$);
select pg_temp.debe_fallar('Beto no guarda clases', $$select public.guardar_clases_oficiales('61000000-0000-0000-0000-000000000001', '[]'::jsonb)$$);
select pg_temp.debe_ser('Beto no publica a mano (clases)', pg_temp.filas($q$update public.horarios_clases set publicado = true$q$), 0);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('publicar devuelve las clases', public.publicar_horario_clases('61000000-0000-0000-0000-000000000001'), 2);
update public.horarios_clases set publicado = false where id = '61000000-0000-0000-0000-000000000001';
select public.publicar_horario_clases('61000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.debe_ser('avisa una sola vez a la carrera (clases)', (select count(*) from public.notificaciones where ruta = '/agenda' and carrera_id = '10000000-0000-0000-0000-000000000001' and usuario_id is null and titulo = 'Salió el horario de clases'), 1);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto ve el horario de clases publicado', (select count(*) from public.clases_oficiales), 2);
select pg_temp.debe_ser('Beto no borra clases oficiales', pg_temp.filas($q$delete from public.clases_oficiales$q$), 0);
select pg_temp.debe_ser('Beto no cambia clases oficiales', pg_temp.filas($q$update public.clases_oficiales set aula = 'Patio'$q$), 0);

-- Ventanas flotantes -------------------------------------------------
select pg_temp.debe_fallar('Beto no crea ventanas', $$insert into public.ventanas (titulo) values ('Hola')$$);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_fallar('botón sin destino', $$insert into public.ventanas (titulo, boton_texto) values ('Hola', 'Ir')$$);
select pg_temp.debe_fallar('destino raro', $$insert into public.ventanas (titulo, boton_texto, boton_destino) values ('Hola', 'Ir', 'javascript:alert(1)')$$);
select pg_temp.debe_fallar('color inventado', $$insert into public.ventanas (titulo, color) values ('Hola', 'fucsia')$$);
select pg_temp.debe_fallar('imagen sin https', $$insert into public.ventanas (titulo, imagen_url) values ('Hola', 'http://x.com/a.png')$$);
insert into public.ventanas (titulo, cuerpo, boton_texto, boton_destino, color) values ('Para todos', 'Hola', 'Ver', '/calendario', '#1879B4');
insert into public.ventanas (titulo, carrera_id) values ('Para otra carrera', (select id from public.carreras where id <> '10000000-0000-0000-0000-000000000001' limit 1));
insert into public.ventanas (titulo, desde) values ('Programada', now() + interval '1 day');
insert into public.ventanas (titulo, activa) values ('Apagada', false);
insert into public.ventanas (titulo, desde, hasta) values ('Vencida', now() - interval '2 days', now() - interval '1 day');
select pg_temp.debe_ser('admin ve todas', (select count(*) from public.ventanas), 5);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto ve solo las vigentes para él', (select count(*) from public.ventanas), (select case when exists (select 1 from public.carreras where id <> '10000000-0000-0000-0000-000000000001') then 1 else 2 end));
select pg_temp.debe_ser('Beto no edita ventanas', pg_temp.filas($q$update public.ventanas set titulo = 'x'$q$), 0);
select pg_temp.como(null);
select pg_temp.debe_fallar('anon no ve ventanas', 'select * from public.ventanas');
reset role;

-- Fin del semestre -----------------------------------------------------
-- Beto elige el sábado 05/12/2026 como último día de clases.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('Beto elige su fin de semestre',
  pg_temp.filas($q$update public.perfiles set fin_clases = '2026-12-05' where id = '00000000-0000-0000-0000-00000000000b'$q$), 1);
select pg_temp.debe_fallar('Beto no ejecuta el vaciado', 'select public.vaciar_horarios_terminados()');
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_ser('Ana no cambia el fin de semestre de Beto',
  pg_temp.filas($q$update public.perfiles set fin_clases = '2030-01-01' where id = '00000000-0000-0000-0000-00000000000b'$q$), 0);
reset role;
select pg_temp.debe_ser('después del fin de semestre no se avisan clases',
  public.encolar_recordatorios_clases(pg_temp.py('2026-12-07 07:30')), 0);
create temp table clases_beto as
  select count(*) as n from public.horario where usuario_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.debe_ser('Beto tiene clases antes del vaciado', (select case when n > 0 then 1 else 0 end from clases_beto), 1);
select pg_temp.debe_ser('el último día de clases todavía no se vacía',
  public.vaciar_horarios_terminados(pg_temp.py('2026-12-05 23:59')), 0);
select pg_temp.debe_ser('al día siguiente se borra todo su horario',
  public.vaciar_horarios_terminados(pg_temp.py('2026-12-06 00:10')), (select n from clases_beto));
select pg_temp.debe_ser('y la fecha queda en blanco para el próximo semestre',
  (select count(*) from public.perfiles where fin_clases is not null), 0);
drop table clases_beto;

-- Lista de estudiantes y encuestas privadas --------------------------
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.debe_fallar('Ana no ve la lista de estudiantes', 'select * from public.listar_estudiantes()');
select pg_temp.como(null);
select pg_temp.debe_fallar('anon no ve la lista de estudiantes', 'select * from public.listar_estudiantes()');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('admin ve a todos los registrados',
  (select count(*) from public.listar_estudiantes()), (select count(*) from public.perfiles));
select pg_temp.debe_ser('admin ve el correo de Ana',
  (select count(*) from public.listar_estudiantes() where correo = 'ana@ejemplo.com'), 1);
select pg_temp.debe_ser('admin crea una encuesta privada',
  pg_temp.filas($q$insert into public.encuestas (id, pregunta, resultados_publicos) values ('40000000-0000-0000-0000-000000000009', '¿Privada?', false)$q$), 1);
select pg_temp.debe_ser('admin carga sus opciones',
  pg_temp.filas($q$insert into public.opciones_encuesta (id, encuesta_id, texto) values ('50000000-0000-0000-0000-000000000091', '40000000-0000-0000-0000-000000000009', 'A'), ('50000000-0000-0000-0000-000000000092', '40000000-0000-0000-0000-000000000009', 'B')$q$), 2);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.votar('40000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000091');
select pg_temp.debe_fallar('Beto no lee los votos directamente', 'select count(*) from public.votos');
select pg_temp.debe_ser('Beto no ve los resultados de la encuesta privada',
  (select count(*) from public.resultados_encuesta where encuesta_id = '40000000-0000-0000-0000-000000000009'), 0);
select pg_temp.debe_ser('Beto sigue viendo los de una encuesta pública',
  (select count(*) from public.resultados_encuesta where encuesta_id = '40000000-0000-0000-0000-000000000001'), 2);
do $d$ begin
  update public.encuestas set resultados_publicos = true where id = '40000000-0000-0000-0000-000000000009';
exception when others then null;
end $d$;
reset role;
select pg_temp.debe_ser('la encuesta sigue privada',
  (select count(*) from public.encuestas where id = '40000000-0000-0000-0000-000000000009' and not resultados_publicos), 1);
select pg_temp.como('00000000-0000-0000-0000-0000000000ad');
select pg_temp.debe_ser('admin sí ve el voto de la encuesta privada',
  (select votos from public.resultados_encuesta where opcion_id = '50000000-0000-0000-0000-000000000091'), 1);
select pg_temp.debe_ser('admin puede hacer públicos los resultados después',
  pg_temp.filas($q$update public.encuestas set resultados_publicos = true where id = '40000000-0000-0000-0000-000000000009'$q$), 1);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.debe_ser('y entonces Beto los ve',
  (select votos from public.resultados_encuesta where opcion_id = '50000000-0000-0000-0000-000000000091'), 1);
reset role;

-- Finales por ID, tope de 3 y Recu/Regu (auditoría 25/11) -------------
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
delete from public.examenes_finales;
-- Un 4 importado del extracto (sin semestre ni llamado) corregido a 3: una sola fila.
insert into public.examenes_finales (materia_id, nota, fecha, origen, nota_extracto)
  values ('30000000-0000-0000-0000-000000000002', 4, '2025-12-01', 'extracto', 4);
select public.guardar_final('30000000-0000-0000-0000-000000000002',
  (select id from public.examenes_finales where origen = 'extracto'), 1,
  '{"periodo":"2025-2","llamado":1,"tipo":"final","nota":3,"fecha":"2025-12-01"}'::jsonb);
select pg_temp.debe_ser('editar un importado no lo duplica', (select count(*) from public.examenes_finales), 1);
select pg_temp.debe_ser('el importado conserva su origen y nota original',
  (select count(*) from public.examenes_finales where origen = 'extracto' and nota = 3 and nota_extracto = 4 and version = 2), 1);
select pg_temp.debe_ser('la materia queda aprobada con 3', (select nota_final::int from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000002'), 3);
select pg_temp.debe_fallar('versión vieja no pisa el cambio de otro dispositivo',
  $$select public.guardar_final('30000000-0000-0000-0000-000000000002', (select id from public.examenes_finales limit 1), 1, '{"periodo":"2025-2","llamado":1,"tipo":"final","nota":5}'::jsonb)$$);
select pg_temp.debe_fallar('borrar con versión vieja', $$select public.borrar_final((select id from public.examenes_finales limit 1), 1)$$);
select public.borrar_final((select id from public.examenes_finales limit 1), 2);
select pg_temp.debe_ser('borrado por ID', (select count(*) from public.examenes_finales), 0);
-- Tope de 3 finales rendidos (pendiente cuenta, ausente no), venga de donde venga.
insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota) values
  ('30000000-0000-0000-0000-000000000002', '2026-1', 1, 'final', 1),
  ('30000000-0000-0000-0000-000000000002', '2026-1', 2, 'ausente', null),
  ('30000000-0000-0000-0000-000000000002', '2026-1', 3, 'final', 1),
  ('30000000-0000-0000-0000-000000000002', '2026-2', 1, 'pendiente', null);
select pg_temp.debe_fallar('cuarto final en la base',
  $$insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota) values ('30000000-0000-0000-0000-000000000002', '2026-2', 2, 'final', 4)$$);
select pg_temp.debe_fallar('cuarto final por guardar_llamados',
  $$select public.guardar_llamados('30000000-0000-0000-0000-000000000002', array['2026-2'], '[{"periodo":"2026-2","llamado":1,"tipo":"pendiente"},{"periodo":"2026-2","llamado":2,"tipo":"final","nota":4}]'::jsonb)$$);
select pg_temp.debe_fallar('cuarto final por guardar_final',
  $$select public.guardar_final('30000000-0000-0000-0000-000000000002', null, null, '{"periodo":"2026-2","llamado":2,"tipo":"final","nota":4}'::jsonb)$$);
select pg_temp.debe_ser('ausente no gasta: otro ausente entra',
  pg_temp.filas($q$insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000002', '2026-2', 3, 'ausente')$q$), 1);
select pg_temp.debe_fallar('reemplazar un llamado ocupado sin que la app lo sepa',
  $$select public.guardar_final('30000000-0000-0000-0000-000000000002', null, null, '{"periodo":"2026-1","llamado":2,"tipo":"ausente"}'::jsonb)$$);
select public.guardar_final('30000000-0000-0000-0000-000000000002', null, null, '{"periodo":"2026-1","llamado":2,"tipo":"ausente","fecha":"2026-07-10"}'::jsonb,
  (select id from public.examenes_finales where periodo = '2026-1' and llamado = 2), 1);
select pg_temp.debe_ser('reemplazo avisado: sigue una sola fila en ese llamado',
  (select count(*) from public.examenes_finales where periodo = '2026-1' and llamado = 2 and fecha = '2026-07-10'), 1);
delete from public.examenes_finales;
-- Regu con su llamado, en una transacción y con ID estable.
select public.guardar_parcial('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  '{"nombre":"Regularización","componente":"teoria","ponderacion":1,"porcentaje":70,"rendida":true}'::jsonb,
  '{"tipo":"regularizacion","periodo":"2026-2","llamado":2}'::jsonb);
select public.guardar_parcial('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
  '{"nombre":"Regularización","componente":"teoria","ponderacion":1,"porcentaje":75,"rendida":true}'::jsonb,
  '{"tipo":"regularizacion","periodo":"2026-2","llamado":2}'::jsonb);
select pg_temp.debe_ser('reintentar la Regu no duplica la evaluación', (select count(*) from public.evaluaciones where id = '60000000-0000-0000-0000-000000000001' and porcentaje = 75), 1);
select pg_temp.debe_ser('ni el llamado', (select count(*) from public.examenes_finales where tipo = 'regularizacion' and llamado = 2 and evaluacion_id = '60000000-0000-0000-0000-000000000001'), 1);
select pg_temp.debe_fallar('Recu en el segundo llamado',
  $$select public.guardar_parcial('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '{"nombre":"Recuperatorio","porcentaje":70}'::jsonb, '{"tipo":"recuperatorio","periodo":"2026-2","llamado":2}'::jsonb)$$);
select pg_temp.debe_ser('un fallo no deja la evaluación a medias', (select count(*) from public.evaluaciones where nombre = 'Recuperatorio'), 0);
select pg_temp.debe_fallar('Regu después de un final',
  $$select public.guardar_final('30000000-0000-0000-0000-000000000001', null, null, '{"periodo":"2026-2","llamado":1,"tipo":"final","nota":1}'::jsonb)$$);
select public.borrar_parcial('60000000-0000-0000-0000-000000000001', true);
select pg_temp.debe_ser('borrar la Regu borra su llamado', (select count(*) from public.examenes_finales), 0);
select pg_temp.debe_ser('y la evaluación', (select count(*) from public.evaluaciones where id = '60000000-0000-0000-0000-000000000001'), 0);
-- Opuesto con importados sin ubicar: no se sabe cuántos quedan.
insert into public.examenes_finales (materia_id, nota, origen) values ('30000000-0000-0000-0000-000000000001', 1, 'extracto'), ('30000000-0000-0000-0000-000000000001', 1, 'extracto');
select pg_temp.debe_fallar('semestre opuesto con importados sin ubicar', $$select public.cursar_semestre_opuesto('30000000-0000-0000-0000-000000000001')$$);
delete from public.examenes_finales;
-- APK viejo: importar sin origen lo marca igual como del extracto.
insert into public.examenes_finales (materia_id, nota, fecha) values ('30000000-0000-0000-0000-000000000002', 2, '2024-12-01');
select pg_temp.debe_ser('import viejo queda como extracto', (select count(*) from public.examenes_finales where origen = 'extracto' and nota_extracto = 2), 1);
delete from public.examenes_finales;
-- guardar_llamados (APK viejo) conserva origen, nota del extracto y semestre opuesto.
insert into public.examenes_finales (materia_id, periodo, llamado, nota, origen, nota_extracto, semestre_opuesto)
  values ('30000000-0000-0000-0000-000000000002', '2026-1', 1, 3, 'extracto', 4, true);
select public.guardar_llamados('30000000-0000-0000-0000-000000000002', array['2026-1'], '[{"periodo":"2026-1","llamado":1,"tipo":"final","nota":3}]'::jsonb);
select pg_temp.debe_ser('guardar_llamados conserva lo del intento',
  (select count(*) from public.examenes_finales where origen = 'extracto' and nota_extracto = 4 and semestre_opuesto), 1);
delete from public.examenes_finales;
-- Con más de 3 de antes (la app vieja no limitaba), se pueden corregir igual.
reset role;
alter table public.examenes_finales disable trigger examenes_finales_tope;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into public.examenes_finales (materia_id, periodo, llamado, tipo, nota) values
  ('30000000-0000-0000-0000-000000000002', '2026-1', 1, 'final', 1), ('30000000-0000-0000-0000-000000000002', '2026-1', 2, 'final', 1),
  ('30000000-0000-0000-0000-000000000002', '2026-1', 3, 'final', 1), ('30000000-0000-0000-0000-000000000002', '2026-2', 1, 'pendiente', null);
reset role;
alter table public.examenes_finales enable trigger examenes_finales_tope;
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.guardar_final('30000000-0000-0000-0000-000000000002', (select id from public.examenes_finales where tipo = 'pendiente'), 1,
  '{"periodo":"2026-2","llamado":1,"tipo":"final","nota":2}'::jsonb);
select pg_temp.debe_ser('completar la nota con 4 viejos se puede', (select count(*) from public.examenes_finales where periodo = '2026-2' and nota = 2), 1);
delete from public.examenes_finales;
-- La Regu no se convierte en final por guardar_final.
insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000002', '2026-1', 1, 'regularizacion');
select pg_temp.debe_fallar('Regu a final por la API',
  $$select public.guardar_final('30000000-0000-0000-0000-000000000002', (select id from public.examenes_finales limit 1), 1, '{"periodo":"2026-1","llamado":1,"tipo":"final","nota":1}'::jsonb)$$);
delete from public.examenes_finales;
-- Plan de otra carrera.
select pg_temp.debe_fallar('plan que no es de la carrera',
  $$update public.perfiles set carrera_id = null, plan_id = '20000000-0000-0000-0000-000000000001' where id = auth.uid()$$);
insert into public.examenes_finales (id, materia_id, periodo, llamado, nota) values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-2', 1, 1);
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.borrar_final('70000000-0000-0000-0000-000000000001', 1);
select pg_temp.debe_fallar('Beto no edita el final de Ana',
  $$select public.guardar_final('30000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1, '{"periodo":"2026-2","llamado":1,"nota":5}'::jsonb)$$);
reset role;
select pg_temp.debe_ser('Beto no borra el final de Ana', (select count(*) from public.examenes_finales where id = '70000000-0000-0000-0000-000000000001' and nota = 1), 1);
delete from public.examenes_finales where id = '70000000-0000-0000-0000-000000000001';

-- Todas las tablas públicas tienen RLS ------------------------------
select pg_temp.debe_ser('tablas sin RLS',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0);

\o
\echo 'Todas las pruebas de seguridad pasaron.'
