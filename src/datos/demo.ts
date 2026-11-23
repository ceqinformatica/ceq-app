/**
 * Modo demostración: con EXPO_PUBLIC_DEMO=1 la app arranca con una sesión
 * falsa y datos de ejemplo guardados en memoria, sin tocar Supabase.
 * Sirve para ver y probar la interfaz (capturas, revisión de diseño).
 * Los datos de acá son inventados: no son la malla real de ninguna carrera.
 */
import type {
  AsistenciaDb, AvisoDb, Carrera, EncuestaDb, EvaluacionDb, EventoDb, ExamenFinalDb, GrupoOptativasDb, HorarioDb, MateriaDb,
  MateriaEstudianteDb, OpcionEncuestaDb, Perfil, Plan, PrerrequisitoDb, ReglaFirmaDb, SocioDb, SolicitudCarnetDb, SugerenciaDb, NotificacionDb, TramiteDb,
} from '../lib/tipos-db';
import { GUIA_TRAMITES_FCQ } from './guia-tramites-fcq';

export const MODO_DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
export const UID_DEMO = '00000000-0000-4000-8000-000000000001';

const ahora = new Date();
const enDias = (d: number, h = 8) => {
  const f = new Date(ahora);
  f.setDate(f.getDate() + d);
  f.setHours(h, 0, 0, 0);
  return f.toISOString();
};

const carrera: Carrera = { id: 'car-1', nombre: 'Carrera de ejemplo', sigla: 'EJ', semestres: 8, activa: true, created_at: ahora.toISOString() };
const plan: Plan = { id: 'plan-1', carrera_id: 'car-1', nombre: 'Plan de ejemplo', anio: 2018, vigente: true, unidad_avance: 'materias', created_at: ahora.toISOString() };

let orden = 0;
const m = (id: string, nombre: string, semestre: number, lab = false, grupo: string | null = null, horas = 64): MateriaDb => ({
  id, plan_id: 'plan-1', codigo: id.toUpperCase(), nombre, semestre, horas, creditos: horas / 16, tiene_laboratorio: lab, grupo_optativa_id: grupo, orden: orden++,
});

const materias: MateriaDb[] = [
  m('qg1', 'Química General I', 1, true), m('mat1', 'Matemática I', 1), m('fis1', 'Física I', 1, true), m('bio', 'Biología General', 1, true), m('sem1', 'Seminario I', 1),
  m('qg2', 'Química General II', 2, true), m('mat2', 'Matemática II', 2), m('fis2', 'Física II', 2, true), m('est', 'Estadística', 2),
  m('qi', 'Química Inorgánica', 3, true), m('qo1', 'Química Orgánica I', 3, true), m('qa1', 'Química Analítica I', 3, true), m('fq1', 'Fisicoquímica I', 3),
  m('qo2', 'Química Orgánica II', 4, true), m('qa2', 'Química Analítica II', 4, true), m('fq2', 'Fisicoquímica II', 4, true), m('bq', 'Bioquímica', 4, true),
  m('ins', 'Análisis Instrumental', 5, true), m('micro', 'Microbiología', 5, true), m('op1', 'Gestión Ambiental', 5, false, 'g-opt', 48), m('op2', 'Inglés Técnico', 5, false, 'g-opt', 48),
  m('op3', 'Emprendedurismo', 6, false, 'g-opt', 48), m('ind', 'Procesos Industriales', 6, true), m('ctrl', 'Control de Calidad', 6, true), m('tesis', 'Trabajo Final de Grado', 8),
];

const grupos: GrupoOptativasDb[] = [{ id: 'g-opt', plan_id: 'plan-1', nombre: 'Optativas generales', cantidad_exigida: 2 }];

const pr = (materia_id: string, requiere_id: string, tipo: 'firmada' | 'aprobada' = 'firmada'): PrerrequisitoDb => ({ materia_id, requiere_id, tipo });
const prerrequisitos: PrerrequisitoDb[] = [
  pr('qg2', 'qg1'), pr('mat2', 'mat1'), pr('fis2', 'fis1'), pr('fis2', 'mat1', 'aprobada'),
  pr('qi', 'qg2'), pr('qo1', 'qg2'), pr('qa1', 'qg2'), pr('qa1', 'est'), pr('fq1', 'mat2'), pr('fq1', 'fis2'),
  pr('qo2', 'qo1'), pr('qa2', 'qa1'), pr('fq2', 'fq1'), pr('bq', 'qo1'), pr('bq', 'bio', 'aprobada'),
  pr('ins', 'qa2'), pr('micro', 'bq'), pr('ind', 'fq2'), pr('ctrl', 'ins'), pr('tesis', 'ctrl', 'aprobada'),
];

const reglas: ReglaFirmaDb[] = [{
  id: 'regla-1', plan_id: 'plan-1', materia_id: null, minimo_teoria: 50, minimo_laboratorio: 60, minimo_asistencia: 60,
  minimo_asistencia_lab: 100, modo_laboratorio: 'separado', peso_laboratorio: null, notas: 'Regla de ejemplo',
}];

const est = (materia_id: string, estado: MateriaEstudianteDb['estado'], nota: number | null = null): MateriaEstudianteDb => ({
  usuario_id: UID_DEMO, materia_id, estado, nota_final: nota, fecha: null, periodo: null, updated_at: ahora.toISOString(),
});

const ev = (id: string, materia_id: string, nombre: string, componente: 'teoria' | 'laboratorio', ponderacion: number, porcentaje: number | null, rendida = true, fecha: string | null = null): EvaluacionDb => ({
  id, usuario_id: UID_DEMO, materia_id, nombre, componente, ponderacion, porcentaje, puntaje_obtenido: null, puntaje_total: null, rendida, fecha, orden: 0, created_at: ahora.toISOString(),
});

const hor = (id: string, materia_id: string, dia: number, ini: string, fin: string, aula: string): HorarioDb => ({
  id, usuario_id: UID_DEMO, materia_id, titulo: null, dia_semana: dia, hora_inicio: ini, hora_fin: fin, aula, aviso_minutos: dia === 1 ? 15 : null, avisado_el: null,
});

export const db = {
  perfil: {
    id: UID_DEMO, nombre: 'Ana Giménez', ci: '5123456', carrera_id: 'car-1', plan_id: 'plan-1', anio_ingreso: 2023, rol: process.env.EXPO_PUBLIC_DEMO_ADMIN === '1' ? 'admin' : 'estudiante',
    notif_avisos: true, notif_recordatorios: true,
    avatar_url: null, created_at: ahora.toISOString(), updated_at: ahora.toISOString(),
  } as Perfil,
  correo: 'estudiante@ejemplo.com',
  carreras: [carrera],
  planes: [plan],
  materias,
  grupos,
  prerrequisitos,
  reglas,
  estados: [
    est('qg1', 'aprobada', 4), est('mat1', 'aprobada', 3), est('fis1', 'aprobada', 4), est('bio', 'aprobada', 5),
    est('qg2', 'aprobada', 4), est('mat2', 'aprobada', 3), est('fis2', 'firmada'), est('est', 'aprobada', 5),
    est('qi', 'aprobada', 4), est('qo1', 'firmada'),
    est('qa1', 'cursando'), est('fq1', 'cursando'), est('bq', 'cursando'),
  ] as MateriaEstudianteDb[],
  // Finales de ejemplo (ingresó en 2023), para ver la evolución en Estadísticas.
  finales: ([
    ['qg1', '2023-1', 1, 4], ['mat1', '2023-1', 1, 1], ['mat1', '2023-1', 2, 3],
    ['fis1', '2023-2', 1, 4], ['bio', '2023-2', 1, 5],
    ['qg2', '2024-1', 1, 4], ['mat2', '2024-1', 1, 3], ['fis2', '2024-1', 1, 1],
    ['est', '2024-2', 1, 5], ['qi', '2024-2', 2, 4],
  ] as const).map(([materia_id, periodo, llamado, nota], i): ExamenFinalDb => ({
    id: `fin-${i + 1}`, usuario_id: UID_DEMO, materia_id, periodo, llamado, fecha: null, nota, created_at: ahora.toISOString(), tipo: 'final', cursada_anterior: false,
  })),
  evaluaciones: [
    ev('e1', 'qa1', 'Primer parcial', 'teoria', 30, 72), ev('e2', 'qa1', 'Segundo parcial', 'teoria', 30, null, false, enDias(6)),
    ev('e3', 'qa1', 'Tercer parcial', 'teoria', 30, 85), ev('e4', 'qa1', 'Laboratorio', 'laboratorio', 100, 78),
    ev('e5', 'fq1', 'Primer parcial', 'teoria', 50, 41), ev('e6', 'fq1', 'Segundo parcial', 'teoria', 50, null, false, enDias(3)),
    ev('e7', 'bq', 'Primer parcial', 'teoria', 40, 88), ev('e8', 'bq', 'Seminarios', 'teoria', 20, 90), ev('e9', 'bq', 'Segundo parcial', 'teoria', 40, null, false, enDias(13)),
    ev('e10', 'bq', 'Laboratorio', 'laboratorio', 100, 92),
  ] as EvaluacionDb[],
  asistencias: [
    { usuario_id: UID_DEMO, materia_id: 'qa1', componente: 'teoria', clases_dictadas: 20, clases_asistidas: 17, clases_totales: 32 },
    { usuario_id: UID_DEMO, materia_id: 'fq1', componente: 'teoria', clases_dictadas: 22, clases_asistidas: 16, clases_totales: 30 },
    { usuario_id: UID_DEMO, materia_id: 'bq', componente: 'teoria', clases_dictadas: 18, clases_asistidas: 18, clases_totales: 30 },
    { usuario_id: UID_DEMO, materia_id: 'qa1', componente: 'laboratorio', clases_dictadas: 6, clases_asistidas: 6, clases_totales: 12 },
    { usuario_id: UID_DEMO, materia_id: 'bq', componente: 'laboratorio', clases_dictadas: 5, clases_asistidas: 5, clases_totales: 10 },
  ] as AsistenciaDb[],
  horario: [
    hor('h1', 'qa1', 1, '07:30:00', '09:30:00', 'Aula 12'), hor('h2', 'fq1', 1, '10:00:00', '12:00:00', 'Aula Magna'),
    hor('h3', 'bq', 2, '08:00:00', '10:00:00', 'Aula 7'), hor('h4', 'qa1', 3, '13:30:00', '17:30:00', 'Lab. Analítica'),
    hor('h5', 'fq1', 4, '07:30:00', '09:30:00', 'Aula 12'), hor('h6', 'bq', 4, '14:00:00', '18:00:00', 'Lab. Bioquímica'),
    hor('h7', 'qa1', 5, '07:30:00', '09:30:00', 'Aula 12'), hor('h8', 'bq', 5, '10:00:00', '12:00:00', 'Aula 7'),
  ] as HorarioDb[],
  eventos: [
    { id: 'ev1', usuario_id: UID_DEMO, materia_id: 'fq1', plan_id: null, tipo: 'examen', titulo: 'Segundo parcial', fecha: enDias(3), aviso_minutos: 1440, notificado: false, created_at: ahora.toISOString() },
    { id: 'ev2', usuario_id: UID_DEMO, materia_id: 'qa1', plan_id: null, tipo: 'examen', titulo: 'Segundo parcial', fecha: enDias(6), aviso_minutos: 1440, notificado: false, created_at: ahora.toISOString() },
    { id: 'ev3', usuario_id: UID_DEMO, materia_id: 'bq', plan_id: null, tipo: 'entrega', titulo: 'Informe de laboratorio', fecha: enDias(9, 23), aviso_minutos: 1440, notificado: false, created_at: ahora.toISOString() },
    { id: 'ev4', usuario_id: null, materia_id: null, plan_id: null, tipo: 'recordatorio', titulo: 'Asamblea general del CEQ', fecha: enDias(11, 18), aviso_minutos: 1440, notificado: false, created_at: ahora.toISOString() },
  ] as EventoDb[],
  socio: {
    id: 'soc-1', usuario_id: UID_DEMO, numero_socio: 'CEQ-0427', ci: '5123456', nombre: 'Ana Giménez',
    vigente_hasta: `${ahora.getFullYear()}-12-31`, foto_path: null, updated_at: ahora.toISOString(),
    codigo_qr: '3f9c2a7e41b84d0c9e15a6b2d8f07c11', activo: true, pagado_en: `${ahora.getFullYear()}-03-10`, observacion: null, created_at: ahora.toISOString(),
  } as SocioDb | null,
  otrosSocios: [
    { id: 'soc-2', usuario_id: null, numero_socio: 'CEQ-0428', ci: '4987001', nombre: 'Bruno Benítez', vigente_hasta: `${ahora.getFullYear()}-12-31`, foto_path: null, updated_at: ahora.toISOString(), codigo_qr: '9a1b', activo: true, pagado_en: null, observacion: 'Solo carnet físico', created_at: ahora.toISOString() },
    { id: 'soc-3', usuario_id: null, numero_socio: 'CEQ-0311', ci: '5300222', nombre: 'Carla Duarte', vigente_hasta: `${ahora.getFullYear() - 1}-12-31`, foto_path: null, updated_at: ahora.toISOString(), codigo_qr: '7c2d', activo: true, pagado_en: null, observacion: null, created_at: ahora.toISOString() },
  ] as SocioDb[],
  solicitudesCarnet: [
    { id: 'sol-1', usuario_id: 'u-demo-2', nombre: 'Diego Ramírez', ci: '5611234', numero_socio: 'CEQ-0390', vigente_hasta: `${ahora.getFullYear() + 2}-03-15`, foto_path: '', estado: 'pendiente', motivo: null, revisado_por: null, revisado_en: null, created_at: ahora.toISOString() },
  ] as SolicitudCarnetDb[],
  avisos: [
    { id: 'a1', titulo: 'Inscripciones a exámenes finales', cuerpo: 'Recordá que la inscripción a los finales del primer periodo cierra el viernes. Hacela desde el sistema de la facultad y guardá el comprobante.', imagen_url: null, notificar: true, publicado: true, autor_id: null, created_at: enDias(-1) },
    { id: 'a2', titulo: 'Venta de batas y antiparras', cuerpo: 'El CEQ tiene batas y antiparras a precio de socio. Pasá por la sede en el horario de atención.', imagen_url: null, notificar: false, publicado: true, autor_id: null, created_at: enDias(-4) },
    { id: 'a3', titulo: 'Tutorías de Fisicoquímica', cuerpo: 'Arrancan las tutorías entre pares de Fisicoquímica I. Martes y jueves a las 17:00 en el Aula 5.', imagen_url: null, notificar: false, publicado: true, autor_id: null, created_at: enDias(-8) },
  ] as AvisoDb[],
  tramites: GUIA_TRAMITES_FCQ.map((t, i): TramiteDb => ({ ...t, id: `t${i + 1}`, orden: i * 10, publicado: true, updated_at: ahora.toISOString() })),
  sugerencias: [
    { id: 'sg1', usuario_id: 'otro', categoria: 'Infraestructura', texto: 'Faltan enchufes en la biblioteca para cargar la notebook.', estado: 'recibida', respuesta: null, created_at: enDias(-1) },
    { id: 'sg2', usuario_id: 'otro', categoria: 'Académico', texto: '¿Se pueden subir los exámenes viejos de Fisicoquímica?', estado: 'respondida', respuesta: 'Sí, los estamos juntando con los docentes.', created_at: enDias(-6) },
  ] as SugerenciaDb[],
  notificaciones: [
    { id: 'n1', tipo: 'mensaje', titulo: 'Cierra la inscripción a finales', cuerpo: 'Hoy a las 23:59 cierra la inscripción del 1.er periodo.', ruta: null, aviso_id: null, evento_id: null, usuario_id: null, carrera_id: null, plan_id: null, programada_para: enDias(1, 8), estado: 'pendiente', enviada_en: null, destinatarios: null, creada_por: null, created_at: enDias(-1) },
    { id: 'n2', tipo: 'aviso', titulo: 'Inscripciones a exámenes finales', cuerpo: 'Recordá que la inscripción a los finales del primer periodo cierra el viernes.', ruta: '/aviso/a1', aviso_id: 'a1', evento_id: null, usuario_id: null, carrera_id: null, plan_id: null, programada_para: enDias(-1), estado: 'enviada', enviada_en: enDias(-1), destinatarios: 214, creada_por: null, created_at: enDias(-1) },
  ] as NotificacionDb[],
  encuestas: [
    { id: 'enc1', pregunta: '¿Qué horario preferís para las tutorías?', abierta: true, cierra_en: enDias(5), created_at: enDias(-2) },
  ] as EncuestaDb[],
  opciones: [
    { id: 'o1', encuesta_id: 'enc1', texto: 'Mañana (7:00 a 9:00)', orden: 0 },
    { id: 'o2', encuesta_id: 'enc1', texto: 'Mediodía (12:00 a 13:30)', orden: 1 },
    { id: 'o3', encuesta_id: 'enc1', texto: 'Tarde (17:00 a 19:00)', orden: 2 },
  ] as OpcionEncuestaDb[],
  votos: { o1: 12, o2: 31, o3: 24 } as Record<string, number>,
  yaVote: new Set<string>(),
};

let contador = 100;
export const idDemo = () => `demo-${contador++}`;

/** Pequeña espera para que el modo demo se sienta como una red real. */
export const esperar = (ms = 250) => new Promise((r) => setTimeout(r, ms));
