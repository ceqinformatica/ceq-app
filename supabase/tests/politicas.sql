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
insert into public.examenes_finales (materia_id, periodo, llamado, tipo) values ('30000000-0000-0000-0000-000000000001', '2026-2', 1, 'recuperatorio');
select pg_temp.debe_ser('el recuperatorio no aprueba la materia',
  (select count(*) from public.materias_estudiante where materia_id = '30000000-0000-0000-0000-000000000001' and estado = 'firmada'), 1);
delete from public.examenes_finales where tipo = 'recuperatorio';
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

-- Todas las tablas públicas tienen RLS ------------------------------
select pg_temp.debe_ser('tablas sin RLS',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0);

\o
\echo 'Todas las pruebas de seguridad pasaron.'
