/**
 * Calendario académico 2026 de la FCQ-UNA (Res. 9048/2025), sacado de
 * https://www.qui.una.py/academico/calendario-academico-fcq/ el 23/11/2026.
 * Es la carga inicial de la tabla calendario_academico: la migración
 * 20261123120000_calendario_academico.sql la genera scripts/seed-calendario.ts
 * con estos datos. Después el CEQ lo edita desde el panel.
 */
import type { CategoriaCalendario } from '../lib/calendario';

export interface FilaCalendario {
  /** Identifica la fila de la carga inicial (no se duplica al re-ejecutar). */
  clave: string;
  anio: number;
  /** 1 o 2; null = no es de un semestre (feriados, ingresantes). */
  semestre: 1 | 2 | null;
  categoria: CategoriaCalendario;
  titulo: string;
  /** AAAA-MM-DD */
  desde: string;
  hasta: string;
  detalle?: string | null;
}

export const FUENTE_CALENDARIO = 'https://www.qui.una.py/academico/calendario-academico-fcq/';

const f = (clave: string, semestre: 1 | 2 | null, categoria: CategoriaCalendario, titulo: string, desde: string, hasta = desde, detalle: string | null = null): FilaCalendario =>
  ({ clave, anio: 2026, semestre, categoria, titulo, desde, hasta, detalle });

export const CALENDARIO_FCQ_2026: FilaCalendario[] = [
  // Ingresantes
  f('2026-ing-matricula', null, 'ingresantes', 'Ingresantes: matriculación e inscripción a asignaturas', '2026-02-09', '2026-02-13', 'Hasta las 18:00.'),
  f('2026-ing-reunion', null, 'ingresantes', 'Ingresantes: reunión informativa', '2026-02-19', '2026-02-19', 'A las 09:00.'),

  // Matriculación e inscripción
  f('2026-1-insc-ordinaria', 1, 'inscripcion', 'Matriculación e inscripción ordinaria', '2026-02-16', '2026-03-16'),
  f('2026-1-insc-extraordinaria', 1, 'inscripcion', 'Matriculación e inscripción extraordinaria', '2026-03-17', '2026-04-06'),
  f('2026-1-insc-extemporanea', 1, 'inscripcion', 'Matriculación e inscripción extemporánea (con recargo)', '2026-04-07', '2026-05-25'),
  f('2026-2-insc-ordinaria', 2, 'inscripcion', 'Matriculación e inscripción ordinaria', '2026-07-29', '2026-08-24'),
  f('2026-2-insc-extraordinaria', 2, 'inscripcion', 'Matriculación e inscripción extraordinaria', '2026-08-25', '2026-09-22'),
  f('2026-2-insc-extemporanea', 2, 'inscripcion', 'Matriculación e inscripción extemporánea (con recargo)', '2026-09-23', '2026-11-02'),

  // Clases
  f('2026-1-clases', 1, 'clases', 'Clases del primer semestre (15 semanas)', '2026-02-23', '2026-06-06'),
  f('2026-2-clases', 2, 'clases', 'Clases del segundo semestre (15 semanas)', '2026-08-03', '2026-11-14'),

  // Aranceles por cuotas
  f('2026-1-cuota-1', 1, 'aranceles', 'Vence la 1.ª cuota de aranceles', '2026-03-23'),
  f('2026-1-cuota-2', 1, 'aranceles', 'Vence la 2.ª cuota de aranceles', '2026-04-15'),
  f('2026-1-cuota-3', 1, 'aranceles', 'Vence la 3.ª cuota de aranceles', '2026-05-13'),
  f('2026-1-cuota-4', 1, 'aranceles', 'Vence la 4.ª cuota de aranceles', '2026-06-08'),
  f('2026-2-cuota-1', 2, 'aranceles', 'Vence la 1.ª cuota de aranceles', '2026-08-31'),
  f('2026-2-cuota-2', 2, 'aranceles', 'Vence la 2.ª cuota de aranceles', '2026-09-18'),
  f('2026-2-cuota-3', 2, 'aranceles', 'Vence la 3.ª cuota de aranceles', '2026-10-16'),
  f('2026-2-cuota-4', 2, 'aranceles', 'Vence la 4.ª cuota de aranceles', '2026-11-18'),

  // Exámenes finales, primer semestre
  f('2026-1-final-1-insc', 1, 'examenes', 'Inscripción a finales: 1.er periodo', '2026-06-10', '2026-06-25'),
  f('2026-1-final-1', 1, 'examenes', 'Exámenes finales: 1.er periodo', '2026-06-15', '2026-06-27'),
  f('2026-1-final-2-insc', 1, 'examenes', 'Inscripción a finales: 2.º periodo', '2026-06-25', '2026-07-09'),
  f('2026-1-final-2', 1, 'examenes', 'Exámenes finales: 2.º periodo', '2026-06-29', '2026-07-11'),
  f('2026-1-final-3-insc', 1, 'examenes', 'Inscripción a finales: 3.er periodo', '2026-07-09', '2026-07-23'),
  f('2026-1-final-3', 1, 'examenes', 'Exámenes finales: 3.er periodo', '2026-07-13', '2026-07-25'),

  // Exámenes finales, segundo semestre
  f('2026-2-final-1-insc', 2, 'examenes', 'Inscripción a finales: 1.er periodo', '2026-11-19', '2026-12-03'),
  f('2026-2-final-1', 2, 'examenes', 'Exámenes finales: 1.er periodo', '2026-11-23', '2026-12-05'),
  f('2026-2-final-2-insc', 2, 'examenes', 'Inscripción a finales: 2.º periodo', '2026-12-03', '2026-12-17'),
  f('2026-2-final-2', 2, 'examenes', 'Exámenes finales: 2.º periodo', '2026-12-07', '2026-12-19'),
  // La web de la FCQ publica estas dos con año 2026; por el orden son de 2027.
  f('2026-2-final-3-insc', 2, 'examenes', 'Inscripción a finales: 3.er periodo', '2027-01-28', '2027-02-11', 'Fecha a confirmar: la web de la FCQ la publica como 28/01 al 11/02 de 2026.'),
  f('2026-2-final-3', 2, 'examenes', 'Exámenes finales: 3.er periodo', '2027-02-01', '2027-02-13', 'Fecha a confirmar: la web de la FCQ la publica como 01/02 al 13/02 de 2026.'),

  // Horario de exámenes finales
  f('2026-1-horario-ante', 1, 'horarios', 'Se publica el anteproyecto de horario de finales', '2026-04-20'),
  f('2026-1-horario-cambios', 1, 'horarios', 'Último día para pedir cambios al anteproyecto de horario de finales', '2026-05-19'),
  f('2026-1-horario', 1, 'horarios', 'Se publica el horario de exámenes finales', '2026-05-29'),
  f('2026-2-horario-ante', 2, 'horarios', 'Se publica el anteproyecto de horario de finales', '2026-09-25'),
  f('2026-2-horario-cambios', 2, 'horarios', 'Último día para pedir cambios al anteproyecto de horario de finales', '2026-10-23'),
  f('2026-2-horario', 2, 'horarios', 'Se publica el horario de exámenes finales', '2026-11-06'),

  // Solicitudes: fecha límite de cada semestre
  ...([
    ['gratuidad', 'Solicitud de gratuidad (arancel 0)', '2026-02-06', '2026-07-17'],
    ['admision-directa', 'Solicitud de admisión directa (egresados de la FCQ)', '2026-02-06', '2026-07-17'],
    ['simultanea', 'Solicitud de matriculación simultánea o traslado de carrera', '2026-02-20', '2026-07-31'],
    ['prorroga', 'Solicitud de prórroga, extensión de prórroga y readmisión', '2026-02-06', '2026-07-17'],
    ['homologacion', 'Solicitud de homologación o convalidación de asignaturas', '2026-02-20', '2026-07-31'],
    ['renuncia-parciales', 'Renuncia al promedio de pruebas parciales', '2026-02-23', '2026-08-03'],
    ['ayudantes', 'Solicitud de nombramiento de ayudantes de cátedra', '2026-02-20', '2026-07-31'],
    ['exoneraciones', 'Solicitud de exoneraciones (ayuda al estudio, excelencia, deportivas, culturales, iniciación científica)', '2026-02-23', '2026-08-03'],
    ['desmatriculacion', 'Solicitud de desmatriculación de asignatura', '2026-03-16', '2026-08-24'],
    ['agregado', 'Solicitud de agregado de inscripción a asignaturas', '2026-04-06', '2026-09-22'],
    ['desmatriculacion-tardia', 'Solicitud de desmatriculación tardía', '2026-04-29', '2026-10-02'],
  ] as const).flatMap(([c, t, s1, s2]) => [
    f(`2026-1-sol-${c}`, 1, 'solicitudes', `Último día: ${t}`, s1),
    f(`2026-2-sol-${c}`, 2, 'solicitudes', `Último día: ${t}`, s2),
  ]),

  // Feriados
  f('2026-fer-anio-nuevo', null, 'feriado', 'Año Nuevo', '2026-01-01'),
  f('2026-fer-heroes', null, 'feriado', 'Día de los Héroes', '2026-03-01'),
  f('2026-fer-jueves-santo', null, 'feriado', 'Jueves Santo', '2026-04-02'),
  f('2026-fer-viernes-santo', null, 'feriado', 'Viernes Santo', '2026-04-03'),
  f('2026-fer-trabajador', null, 'feriado', 'Día del Trabajador', '2026-05-01'),
  f('2026-fer-independencia', null, 'feriado', 'Independencia Nacional', '2026-05-14', '2026-05-15'),
  f('2026-fer-paz-chaco', null, 'feriado', 'Paz del Chaco', '2026-06-12'),
  f('2026-fer-constitucion', null, 'feriado', 'Jura de la Constitución Nacional', '2026-06-20'),
  f('2026-fer-asuncion', null, 'feriado', 'Fundación de Asunción', '2026-08-15'),
  f('2026-fer-boqueron', null, 'feriado', 'Victoria de Boquerón', '2026-09-29'),
  f('2026-fer-inmaculada', null, 'feriado', 'Virgen de Caacupé (Inmaculada Concepción)', '2026-12-08'),
  f('2026-fer-navidad', null, 'feriado', 'Navidad', '2026-12-25'),

  // Asuetos
  f('2026-asu-miercoles-santo', null, 'asueto', 'Miércoles Santo', '2026-04-01'),
  f('2026-asu-sabado-santo', null, 'asueto', 'Sábado Santo', '2026-04-04'),
  f('2026-asu-maestro', null, 'asueto', 'Día del Maestro', '2026-04-30'),
  f('2026-asu-quimico', null, 'asueto', 'Día del Químico', '2026-05-08'),
  f('2026-asu-san-lorenzo', null, 'asueto', 'Fundación de San Lorenzo (sede central)', '2026-08-10'),
  f('2026-asu-juventud', null, 'asueto', 'Día de la Juventud', '2026-09-21'),
  f('2026-asu-una', null, 'asueto', 'Aniversario de la UNA', '2026-09-24'),
  f('2026-asu-nochebuena', null, 'asueto', 'Nochebuena', '2026-12-24'),
  f('2026-asu-noche-vieja', null, 'asueto', 'Noche Vieja', '2026-12-31'),
];
