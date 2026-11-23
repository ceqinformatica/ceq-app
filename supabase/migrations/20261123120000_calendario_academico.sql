-- =============================================================
-- App CEQ: calendario académico oficial de la FCQ
--  * tabla calendario_academico: inscripciones, clases, finales,
--    vencimientos de aranceles, plazos de solicitudes, feriados y asuetos
--  * todos los estudiantes con sesión lo leen; solo el admin lo edita
--  * carga inicial: calendario 2026 (Res. 9048/2025) de
--    https://www.qui.una.py/academico/calendario-academico-fcq/ (23/11/2026)
-- Se ejecuta una vez en el SQL Editor del proyecto ceq-app. Se puede
-- volver a ejecutar: no duplica ni pisa filas editadas en el panel.
-- ARCHIVO GENERADO por scripts/seed-calendario.ts: editá los datos en
-- src/datos/calendario-fcq.ts y volvé a correr el script.
-- =============================================================

create table if not exists public.calendario_academico (
  id          uuid primary key default gen_random_uuid(),
  clave       text unique,
  anio        integer not null check (anio between 2000 and 2100),
  semestre    smallint check (semestre in (1, 2)),
  categoria   text not null check (categoria in ('clases', 'inscripcion', 'examenes', 'aranceles', 'solicitudes', 'horarios', 'feriado', 'asueto', 'ingresantes')),
  titulo      text not null check (length(btrim(titulo)) between 3 and 160),
  desde       date not null,
  hasta       date not null,
  detalle     text check (detalle is null or length(detalle) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendario_rango check (hasta >= desde)
);
create index if not exists calendario_academico_fechas on public.calendario_academico (hasta, desde);

alter table public.calendario_academico enable row level security;

drop policy if exists "ver calendario" on public.calendario_academico;
create policy "ver calendario" on public.calendario_academico for select to authenticated using (true);
drop policy if exists "admin crea calendario" on public.calendario_academico;
create policy "admin crea calendario" on public.calendario_academico for insert to authenticated
  with check ((select public.es_admin()));
drop policy if exists "admin edita calendario" on public.calendario_academico;
create policy "admin edita calendario" on public.calendario_academico for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
drop policy if exists "admin borra calendario" on public.calendario_academico;
create policy "admin borra calendario" on public.calendario_academico for delete to authenticated
  using ((select public.es_admin()));

revoke all on public.calendario_academico from anon;
grant select, insert, update, delete on public.calendario_academico to authenticated;

-- Carga inicial. Lo que el admin borró no vuelve (se recuerda la clave).
create table if not exists public.calendario_claves_borradas (clave text primary key);
alter table public.calendario_claves_borradas enable row level security;
revoke all on public.calendario_claves_borradas from anon, authenticated;

create or replace function public.calendario_recordar_borrado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.clave is not null then
    insert into public.calendario_claves_borradas (clave) values (old.clave) on conflict do nothing;
  end if;
  return old;
end $$;
revoke execute on function public.calendario_recordar_borrado() from public, anon, authenticated;
drop trigger if exists calendario_recordar_borrado on public.calendario_academico;
create trigger calendario_recordar_borrado after delete on public.calendario_academico
  for each row execute function public.calendario_recordar_borrado();

insert into public.calendario_academico (clave, anio, semestre, categoria, titulo, desde, hasta, detalle)
select v.clave, v.anio, v.semestre, v.categoria, v.titulo, v.desde::date, v.hasta::date, v.detalle
from (values
  ('2026-ing-matricula', 2026, null, 'ingresantes', 'Ingresantes: matriculación e inscripción a asignaturas', '2026-02-09', '2026-02-13', 'Hasta las 18:00.'),
  ('2026-ing-reunion', 2026, null, 'ingresantes', 'Ingresantes: reunión informativa', '2026-02-19', '2026-02-19', 'A las 09:00.'),
  ('2026-1-insc-ordinaria', 2026, 1, 'inscripcion', 'Matriculación e inscripción ordinaria', '2026-02-16', '2026-03-16', null),
  ('2026-1-insc-extraordinaria', 2026, 1, 'inscripcion', 'Matriculación e inscripción extraordinaria', '2026-03-17', '2026-04-06', null),
  ('2026-1-insc-extemporanea', 2026, 1, 'inscripcion', 'Matriculación e inscripción extemporánea (con recargo)', '2026-04-07', '2026-05-25', null),
  ('2026-2-insc-ordinaria', 2026, 2, 'inscripcion', 'Matriculación e inscripción ordinaria', '2026-07-29', '2026-08-24', null),
  ('2026-2-insc-extraordinaria', 2026, 2, 'inscripcion', 'Matriculación e inscripción extraordinaria', '2026-08-25', '2026-09-22', null),
  ('2026-2-insc-extemporanea', 2026, 2, 'inscripcion', 'Matriculación e inscripción extemporánea (con recargo)', '2026-09-23', '2026-11-02', null),
  ('2026-1-clases', 2026, 1, 'clases', 'Clases del primer semestre (15 semanas)', '2026-02-23', '2026-06-06', null),
  ('2026-2-clases', 2026, 2, 'clases', 'Clases del segundo semestre (15 semanas)', '2026-08-03', '2026-11-14', null),
  ('2026-1-cuota-1', 2026, 1, 'aranceles', 'Vence la 1.ª cuota de aranceles', '2026-03-23', '2026-03-23', null),
  ('2026-1-cuota-2', 2026, 1, 'aranceles', 'Vence la 2.ª cuota de aranceles', '2026-04-15', '2026-04-15', null),
  ('2026-1-cuota-3', 2026, 1, 'aranceles', 'Vence la 3.ª cuota de aranceles', '2026-05-13', '2026-05-13', null),
  ('2026-1-cuota-4', 2026, 1, 'aranceles', 'Vence la 4.ª cuota de aranceles', '2026-06-08', '2026-06-08', null),
  ('2026-2-cuota-1', 2026, 2, 'aranceles', 'Vence la 1.ª cuota de aranceles', '2026-08-31', '2026-08-31', null),
  ('2026-2-cuota-2', 2026, 2, 'aranceles', 'Vence la 2.ª cuota de aranceles', '2026-09-18', '2026-09-18', null),
  ('2026-2-cuota-3', 2026, 2, 'aranceles', 'Vence la 3.ª cuota de aranceles', '2026-10-16', '2026-10-16', null),
  ('2026-2-cuota-4', 2026, 2, 'aranceles', 'Vence la 4.ª cuota de aranceles', '2026-11-18', '2026-11-18', null),
  ('2026-1-final-1-insc', 2026, 1, 'examenes', 'Inscripción a finales: 1.er periodo', '2026-06-10', '2026-06-25', null),
  ('2026-1-final-1', 2026, 1, 'examenes', 'Exámenes finales: 1.er periodo', '2026-06-15', '2026-06-27', null),
  ('2026-1-final-2-insc', 2026, 1, 'examenes', 'Inscripción a finales: 2.º periodo', '2026-06-25', '2026-07-09', null),
  ('2026-1-final-2', 2026, 1, 'examenes', 'Exámenes finales: 2.º periodo', '2026-06-29', '2026-07-11', null),
  ('2026-1-final-3-insc', 2026, 1, 'examenes', 'Inscripción a finales: 3.er periodo', '2026-07-09', '2026-07-23', null),
  ('2026-1-final-3', 2026, 1, 'examenes', 'Exámenes finales: 3.er periodo', '2026-07-13', '2026-07-25', null),
  ('2026-2-final-1-insc', 2026, 2, 'examenes', 'Inscripción a finales: 1.er periodo', '2026-11-19', '2026-12-03', null),
  ('2026-2-final-1', 2026, 2, 'examenes', 'Exámenes finales: 1.er periodo', '2026-11-23', '2026-12-05', null),
  ('2026-2-final-2-insc', 2026, 2, 'examenes', 'Inscripción a finales: 2.º periodo', '2026-12-03', '2026-12-17', null),
  ('2026-2-final-2', 2026, 2, 'examenes', 'Exámenes finales: 2.º periodo', '2026-12-07', '2026-12-19', null),
  ('2026-2-final-3-insc', 2026, 2, 'examenes', 'Inscripción a finales: 3.er periodo', '2027-01-28', '2027-02-11', 'Fecha a confirmar: la web de la FCQ la publica como 28/01 al 11/02 de 2026.'),
  ('2026-2-final-3', 2026, 2, 'examenes', 'Exámenes finales: 3.er periodo', '2027-02-01', '2027-02-13', 'Fecha a confirmar: la web de la FCQ la publica como 01/02 al 13/02 de 2026.'),
  ('2026-1-horario-ante', 2026, 1, 'horarios', 'Se publica el anteproyecto de horario de finales', '2026-04-20', '2026-04-20', null),
  ('2026-1-horario-cambios', 2026, 1, 'horarios', 'Último día para pedir cambios al anteproyecto de horario de finales', '2026-05-19', '2026-05-19', null),
  ('2026-1-horario', 2026, 1, 'horarios', 'Se publica el horario de exámenes finales', '2026-05-29', '2026-05-29', null),
  ('2026-2-horario-ante', 2026, 2, 'horarios', 'Se publica el anteproyecto de horario de finales', '2026-09-25', '2026-09-25', null),
  ('2026-2-horario-cambios', 2026, 2, 'horarios', 'Último día para pedir cambios al anteproyecto de horario de finales', '2026-10-23', '2026-10-23', null),
  ('2026-2-horario', 2026, 2, 'horarios', 'Se publica el horario de exámenes finales', '2026-11-06', '2026-11-06', null),
  ('2026-1-sol-gratuidad', 2026, 1, 'solicitudes', 'Último día: Solicitud de gratuidad (arancel 0)', '2026-02-06', '2026-02-06', null),
  ('2026-2-sol-gratuidad', 2026, 2, 'solicitudes', 'Último día: Solicitud de gratuidad (arancel 0)', '2026-07-17', '2026-07-17', null),
  ('2026-1-sol-admision-directa', 2026, 1, 'solicitudes', 'Último día: Solicitud de admisión directa (egresados de la FCQ)', '2026-02-06', '2026-02-06', null),
  ('2026-2-sol-admision-directa', 2026, 2, 'solicitudes', 'Último día: Solicitud de admisión directa (egresados de la FCQ)', '2026-07-17', '2026-07-17', null),
  ('2026-1-sol-simultanea', 2026, 1, 'solicitudes', 'Último día: Solicitud de matriculación simultánea o traslado de carrera', '2026-02-20', '2026-02-20', null),
  ('2026-2-sol-simultanea', 2026, 2, 'solicitudes', 'Último día: Solicitud de matriculación simultánea o traslado de carrera', '2026-07-31', '2026-07-31', null),
  ('2026-1-sol-prorroga', 2026, 1, 'solicitudes', 'Último día: Solicitud de prórroga, extensión de prórroga y readmisión', '2026-02-06', '2026-02-06', null),
  ('2026-2-sol-prorroga', 2026, 2, 'solicitudes', 'Último día: Solicitud de prórroga, extensión de prórroga y readmisión', '2026-07-17', '2026-07-17', null),
  ('2026-1-sol-homologacion', 2026, 1, 'solicitudes', 'Último día: Solicitud de homologación o convalidación de asignaturas', '2026-02-20', '2026-02-20', null),
  ('2026-2-sol-homologacion', 2026, 2, 'solicitudes', 'Último día: Solicitud de homologación o convalidación de asignaturas', '2026-07-31', '2026-07-31', null),
  ('2026-1-sol-renuncia-parciales', 2026, 1, 'solicitudes', 'Último día: Renuncia al promedio de pruebas parciales', '2026-02-23', '2026-02-23', null),
  ('2026-2-sol-renuncia-parciales', 2026, 2, 'solicitudes', 'Último día: Renuncia al promedio de pruebas parciales', '2026-08-03', '2026-08-03', null),
  ('2026-1-sol-ayudantes', 2026, 1, 'solicitudes', 'Último día: Solicitud de nombramiento de ayudantes de cátedra', '2026-02-20', '2026-02-20', null),
  ('2026-2-sol-ayudantes', 2026, 2, 'solicitudes', 'Último día: Solicitud de nombramiento de ayudantes de cátedra', '2026-07-31', '2026-07-31', null),
  ('2026-1-sol-exoneraciones', 2026, 1, 'solicitudes', 'Último día: Solicitud de exoneraciones (ayuda al estudio, excelencia, deportivas, culturales, iniciación científica)', '2026-02-23', '2026-02-23', null),
  ('2026-2-sol-exoneraciones', 2026, 2, 'solicitudes', 'Último día: Solicitud de exoneraciones (ayuda al estudio, excelencia, deportivas, culturales, iniciación científica)', '2026-08-03', '2026-08-03', null),
  ('2026-1-sol-desmatriculacion', 2026, 1, 'solicitudes', 'Último día: Solicitud de desmatriculación de asignatura', '2026-03-16', '2026-03-16', null),
  ('2026-2-sol-desmatriculacion', 2026, 2, 'solicitudes', 'Último día: Solicitud de desmatriculación de asignatura', '2026-08-24', '2026-08-24', null),
  ('2026-1-sol-agregado', 2026, 1, 'solicitudes', 'Último día: Solicitud de agregado de inscripción a asignaturas', '2026-04-06', '2026-04-06', null),
  ('2026-2-sol-agregado', 2026, 2, 'solicitudes', 'Último día: Solicitud de agregado de inscripción a asignaturas', '2026-09-22', '2026-09-22', null),
  ('2026-1-sol-desmatriculacion-tardia', 2026, 1, 'solicitudes', 'Último día: Solicitud de desmatriculación tardía', '2026-04-29', '2026-04-29', null),
  ('2026-2-sol-desmatriculacion-tardia', 2026, 2, 'solicitudes', 'Último día: Solicitud de desmatriculación tardía', '2026-10-02', '2026-10-02', null),
  ('2026-fer-anio-nuevo', 2026, null, 'feriado', 'Año Nuevo', '2026-01-01', '2026-01-01', null),
  ('2026-fer-heroes', 2026, null, 'feriado', 'Día de los Héroes', '2026-03-01', '2026-03-01', null),
  ('2026-fer-jueves-santo', 2026, null, 'feriado', 'Jueves Santo', '2026-04-02', '2026-04-02', null),
  ('2026-fer-viernes-santo', 2026, null, 'feriado', 'Viernes Santo', '2026-04-03', '2026-04-03', null),
  ('2026-fer-trabajador', 2026, null, 'feriado', 'Día del Trabajador', '2026-05-01', '2026-05-01', null),
  ('2026-fer-independencia', 2026, null, 'feriado', 'Independencia Nacional', '2026-05-14', '2026-05-15', null),
  ('2026-fer-paz-chaco', 2026, null, 'feriado', 'Paz del Chaco', '2026-06-12', '2026-06-12', null),
  ('2026-fer-constitucion', 2026, null, 'feriado', 'Jura de la Constitución Nacional', '2026-06-20', '2026-06-20', null),
  ('2026-fer-asuncion', 2026, null, 'feriado', 'Fundación de Asunción', '2026-08-15', '2026-08-15', null),
  ('2026-fer-boqueron', 2026, null, 'feriado', 'Victoria de Boquerón', '2026-09-29', '2026-09-29', null),
  ('2026-fer-inmaculada', 2026, null, 'feriado', 'Virgen de Caacupé (Inmaculada Concepción)', '2026-12-08', '2026-12-08', null),
  ('2026-fer-navidad', 2026, null, 'feriado', 'Navidad', '2026-12-25', '2026-12-25', null),
  ('2026-asu-miercoles-santo', 2026, null, 'asueto', 'Miércoles Santo', '2026-04-01', '2026-04-01', null),
  ('2026-asu-sabado-santo', 2026, null, 'asueto', 'Sábado Santo', '2026-04-04', '2026-04-04', null),
  ('2026-asu-maestro', 2026, null, 'asueto', 'Día del Maestro', '2026-04-30', '2026-04-30', null),
  ('2026-asu-quimico', 2026, null, 'asueto', 'Día del Químico', '2026-05-08', '2026-05-08', null),
  ('2026-asu-san-lorenzo', 2026, null, 'asueto', 'Fundación de San Lorenzo (sede central)', '2026-08-10', '2026-08-10', null),
  ('2026-asu-juventud', 2026, null, 'asueto', 'Día de la Juventud', '2026-09-21', '2026-09-21', null),
  ('2026-asu-una', 2026, null, 'asueto', 'Aniversario de la UNA', '2026-09-24', '2026-09-24', null),
  ('2026-asu-nochebuena', 2026, null, 'asueto', 'Nochebuena', '2026-12-24', '2026-12-24', null),
  ('2026-asu-noche-vieja', 2026, null, 'asueto', 'Noche Vieja', '2026-12-31', '2026-12-31', null)
) as v (clave, anio, semestre, categoria, titulo, desde, hasta, detalle)
where not exists (select 1 from public.calendario_claves_borradas b where b.clave = v.clave)
on conflict (clave) do nothing;
