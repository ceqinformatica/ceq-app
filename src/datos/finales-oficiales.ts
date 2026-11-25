/**
 * Horarios de exámenes finales que publica el CEQ a partir del PDF de la
 * Dirección Académica (uno por carrera).
 */
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { mismaMateria, textoLlamado, type FichaMateria, type FilaFinal } from '../lib/horario-finales';
import type { EstadoMateriaDb, FechaFinalDb, HorarioFinalesDb } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';
import { lanzar } from '../lib/errores';

const BUCKET = 'horarios-finales';

export interface FechaEditable {
  materia: string;
  llamado: number;
  fecha: string;
  hora: string | null;
  aula: string | null;
}

/* ---------------- Panel ---------------- */

export async function cargarHorariosAdmin(): Promise<HorarioFinalesDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.horariosFinales].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase.from('horarios_finales').select('*').order('created_at', { ascending: false }).limit(100);
  lanzar(error);
  return data ?? [];
}

export async function cargarHorario(id: string): Promise<{ horario: HorarioFinalesDb; fechas: FechaFinalDb[] } | null> {
  if (MODO_DEMO) {
    await esperar();
    const horario = db.horariosFinales.find((h) => h.id === id);
    return horario ? { horario, fechas: db.fechasFinales.filter((f) => f.horario_id === id) } : null;
  }
  const [rH, rF] = await Promise.all([
    supabase.from('horarios_finales').select('*').eq('id', id).maybeSingle(),
    supabase.from('fechas_finales').select('*').eq('horario_id', id).order('fecha').order('hora'),
  ]);
  lanzar(rH.error);
  lanzar(rF.error);
  return rH.data ? { horario: rH.data, fechas: rF.data ?? [] } : null;
}

/** Nombres de las materias de una carrera (todos sus planes), sin repetir. */
export async function materiasDeCarrera(carreraId: string, anioPlan?: number | null): Promise<string[]> {
  if (MODO_DEMO) return [...new Set(db.materias.map((m) => m.nombre))];
  const { data: planes, error } = await supabase.from('planes').select('id, anio').eq('carrera_id', carreraId);
  lanzar(error);
  // Con el plan que nombra el PDF se comparan solo sus materias; si la carrera no lo tiene, todas.
  const delPlan = anioPlan ? (planes ?? []).filter((p) => p.anio === anioPlan) : [];
  const ids = (delPlan.length ? delPlan : planes ?? []).map((p) => p.id);
  if (!ids.length) return [];
  const { data, error: e2 } = await supabase.from('materias').select('nombre').in('plan_id', ids).limit(2000);
  lanzar(e2);
  return [...new Set((data ?? []).map((m) => m.nombre))].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Materias de una carrera con su plan, su número de orden (el que usa el
 * código de la planilla: IQ010 / IQ-07) y su nivel. Sirve para reconocer la
 * materia por el código cuando el OCR lee mal el nombre ("Cálculo Il"), y
 * para deducir el nivel de una hoja que no lo dice.
 */
export async function fichasDeMaterias(carreraId: string): Promise<FichaMateria[]> {
  if (MODO_DEMO) {
    return db.materias.map((m) => ({ nombre: m.nombre, plan: db.planes.find((p) => p.id === m.plan_id)?.anio ?? null, orden: m.orden ?? null, nivel: m.semestre ?? null }));
  }
  const { data: planes, error } = await supabase.from('planes').select('id, anio').eq('carrera_id', carreraId);
  lanzar(error);
  const ids = (planes ?? []).map((p) => p.id);
  if (!ids.length) return [];
  const { data, error: e2 } = await supabase.from('materias').select('nombre, plan_id, orden, semestre').in('plan_id', ids).limit(3000);
  lanzar(e2);
  const anio = new Map((planes ?? []).map((p) => [p.id, p.anio]));
  return (data ?? []).map((m) => ({ nombre: m.nombre, plan: anio.get(m.plan_id) ?? null, orden: m.orden ?? null, nivel: m.semestre ?? null }));
}

/** Años de los planes de una carrera (para elegir a qué plan corresponde un horario). */
export async function aniosDePlanes(carreraId: string): Promise<number[]> {
  if (MODO_DEMO) return [...new Set(db.planes.map((p) => p.anio).filter((a): a is number => a != null))];
  const { data, error } = await supabase.from('planes').select('anio').eq('carrera_id', carreraId);
  lanzar(error);
  return [...new Set((data ?? []).map((p) => p.anio).filter((a): a is number => a != null))].sort();
}

/** Bytes del PDF elegido con el selector de archivos. */
export async function bytesDeArchivo(asset: { uri: string; file?: File }): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const buf = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
    return new Uint8Array(buf);
  }
  const { File } = await import('expo-file-system');
  return new File(asset.uri).bytes();
}

/** Crea el horario (borrador) con su PDF y sus fechas. */
export async function crearHorario(carreraId: string, titulo: string, pdf: Uint8Array | null, fechas: FechaEditable[]): Promise<string> {
  if (MODO_DEMO) {
    await esperar(400);
    const id = idDemo();
    const ahora = new Date().toISOString();
    db.horariosFinales.unshift({ id, carrera_id: carreraId, titulo, pdf_path: null, publicado: false, publicado_en: null, avisado_en: null, creado_por: UID_DEMO, created_at: ahora, updated_at: ahora });
    db.fechasFinales.push(...fechas.map((f) => ({ ...f, id: idDemo(), horario_id: id, created_at: ahora })));
    return id;
  }
  let path: string | null = null;
  if (pdf) {
    path = `${carreraId}/${Date.now()}.pdf`;
    const cuerpo = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const { error } = await supabase.storage.from(BUCKET).upload(path, cuerpo, { contentType: 'application/pdf', upsert: false });
    lanzar(error);
  }
  const { data, error } = await supabase.from('horarios_finales').insert({ carrera_id: carreraId, titulo: titulo.trim(), pdf_path: path }).select('id').single();
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    lanzar(error);
  }
  try {
    await guardarFechas(data!.id, fechas);
  } catch (e) {
    // Que un reintento no deje un horario vacío de más.
    await supabase.from('horarios_finales').delete().eq('id', data!.id);
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw e;
  }
  return data!.id;
}

export async function guardarFechas(horarioId: string, fechas: FechaEditable[]) {
  if (MODO_DEMO) {
    await esperar(300);
    const ahora = new Date().toISOString();
    db.fechasFinales = db.fechasFinales.filter((f) => f.horario_id !== horarioId);
    db.fechasFinales.push(...fechas.map((f) => ({ ...f, id: idDemo(), horario_id: horarioId, created_at: ahora })));
    return;
  }
  const { error } = await supabase.rpc('guardar_fechas_finales', {
    p_horario: horarioId,
    p_fechas: fechas.map((f) => ({ materia: f.materia.trim(), llamado: f.llamado, fecha: f.fecha, hora: f.hora, aula: f.aula })),
  });
  lanzar(error);
}

export async function renombrarHorario(id: string, titulo: string) {
  if (MODO_DEMO) {
    db.horariosFinales = db.horariosFinales.map((h) => (h.id === id ? { ...h, titulo } : h));
    return;
  }
  const { error } = await supabase.from('horarios_finales').update({ titulo: titulo.trim() }).eq('id', id);
  lanzar(error);
}

export async function publicarHorario(id: string, notificar: boolean): Promise<number> {
  if (MODO_DEMO) {
    await esperar(300);
    db.horariosFinales = db.horariosFinales.map((h) => (h.id === id ? { ...h, publicado: true, publicado_en: h.publicado_en ?? new Date().toISOString(), avisado_en: h.avisado_en ?? (notificar ? new Date().toISOString() : null) } : h));
    return db.fechasFinales.filter((f) => f.horario_id === id).length;
  }
  const { data, error } = await supabase.rpc('publicar_horario_finales', { p_id: id, p_notificar: notificar });
  lanzar(error);
  return data as number;
}

export async function ocultarHorario(id: string) {
  if (MODO_DEMO) {
    db.horariosFinales = db.horariosFinales.map((h) => (h.id === id ? { ...h, publicado: false } : h));
    return;
  }
  const { error } = await supabase.from('horarios_finales').update({ publicado: false }).eq('id', id);
  lanzar(error);
}

export async function borrarHorario(h: HorarioFinalesDb) {
  if (MODO_DEMO) {
    db.horariosFinales = db.horariosFinales.filter((x) => x.id !== h.id);
    db.fechasFinales = db.fechasFinales.filter((x) => x.horario_id !== h.id);
    return;
  }
  const { error } = await supabase.from('horarios_finales').delete().eq('id', h.id);
  lanzar(error);
  if (h.pdf_path) await supabase.storage.from(BUCKET).remove([h.pdf_path]).catch(() => undefined);
}

/** Enlace temporal (1 hora) al PDF original. */
export async function urlPdfHorario(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (MODO_DEMO) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** De las filas leídas del PDF a filas para guardar (las sin materia se descartan). */
export function filasParaGuardar(filas: (FilaFinal & { materia: string | null })[]): FechaEditable[] {
  return filas
    .filter((f): f is FilaFinal & { materia: string } => Boolean(f.materia))
    .map((f) => ({ materia: f.materia, llamado: f.llamado, fecha: f.fecha, hora: f.hora, aula: f.aula }));
}

/* ---------------- Estudiante ---------------- */

export interface FinalOficial extends FechaFinalDb {
  /** id de la materia en tu plan (si la tenés), para agregarla a la agenda. */
  materiaId: string | null;
  /** La cursás o la firmaste y todavía no la aprobaste. */
  tuya: boolean;
  estado: EstadoMateriaDb | null;
}

export interface MisFinales {
  horarios: HorarioFinalesDb[];
  fechas: FinalOficial[];
  /** Fechas que ya están en tu agenda (titulo|fecha). */
  enAgenda: Set<string>;
}

const PENDIENTES: EstadoMateriaDb[] = ['cursando', 'firmada'];

export async function cargarMisFinales(carreraId: string | null | undefined, planId: string | null | undefined): Promise<MisFinales> {
  if (!carreraId) return { horarios: [], fechas: [], enAgenda: new Set() };
  const desde = new Date();
  desde.setDate(desde.getDate() - 1);
  const hoy = desde.toISOString().slice(0, 10);
  let horarios: HorarioFinalesDb[];
  let fechas: FechaFinalDb[];
  let materias: { id: string; nombre: string }[];
  let estados: { materia_id: string; estado: EstadoMateriaDb }[];
  let eventos: { titulo: string; fecha: string }[];
  if (MODO_DEMO) {
    await esperar();
    horarios = db.horariosFinales.filter((h) => h.publicado && h.carrera_id === carreraId);
    fechas = db.fechasFinales.filter((f) => horarios.some((h) => h.id === f.horario_id) && f.fecha >= hoy);
    materias = db.materias;
    estados = db.estados;
    eventos = db.eventos.filter((e) => e.usuario_id === UID_DEMO);
  } else {
    const rH = await supabase.from('horarios_finales').select('*').eq('carrera_id', carreraId).eq('publicado', true).order('publicado_en', { ascending: false }).limit(10);
    lanzar(rH.error);
    horarios = rH.data ?? [];
    const ids = horarios.map((h) => h.id);
    const [rF, rM, rS, rE] = await Promise.all([
      ids.length
        ? supabase.from('fechas_finales').select('*').in('horario_id', ids).gte('fecha', hoy).order('fecha').order('hora').limit(2000)
        : Promise.resolve({ data: [], error: null }),
      planId ? supabase.from('materias').select('id, nombre').eq('plan_id', planId) : Promise.resolve({ data: [], error: null }),
      supabase.from('materias_estudiante').select('materia_id, estado'),
      supabase.from('eventos').select('titulo, fecha').not('usuario_id', 'is', null).gte('fecha', desde.toISOString()).limit(300),
    ]);
    lanzar(rF.error); lanzar(rM.error); lanzar(rS.error); lanzar(rE.error);
    fechas = (rF.data ?? []) as FechaFinalDb[];
    materias = (rM.data ?? []) as { id: string; nombre: string }[];
    estados = (rS.data ?? []) as typeof estados;
    eventos = (rE.data ?? []) as typeof eventos;
  }
  const estadoDe = new Map(estados.map((e) => [e.materia_id, e.estado]));
  const lista: FinalOficial[] = fechas.map((f) => {
    const m = materias.find((x) => mismaMateria(x.nombre, f.materia));
    const estado = m ? estadoDe.get(m.id) ?? null : null;
    return { ...f, materiaId: m?.id ?? null, estado, tuya: Boolean(estado && PENDIENTES.includes(estado)) };
  });
  lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.materia.localeCompare(b.materia, 'es'));
  return { horarios, fechas: lista, enAgenda: new Set(eventos.map((e) => claveAgenda(e.titulo, e.fecha))) };
}

export const tituloEnAgenda = (f: Pick<FechaFinalDb, 'materia' | 'llamado'>) => `Final de ${f.materia} (${textoLlamado(f.llamado)})`;

/** Fecha y hora del final (hora de Asunción; si no tiene hora, 07:00). */
export function fechaHoraFinal(f: Pick<FechaFinalDb, 'fecha' | 'hora'>): Date {
  const [a, m, d] = f.fecha.split('-').map(Number);
  const [h, min] = (f.hora ?? '07:00').split(':').map(Number);
  return new Date(a, m - 1, d, h, min);
}

const claveAgenda = (titulo: string, fecha: string) => `${titulo}|${new Date(fecha).toISOString().slice(0, 16)}`;
export const estaEnAgenda = (f: FinalOficial, enAgenda: Set<string>) => enAgenda.has(claveAgenda(tituloEnAgenda(f), fechaHoraFinal(f).toISOString()));

/** Copia los finales elegidos a la agenda (con recordatorio un día antes). Devuelve cuántos agregó. */
export async function agregarFinalesAAgenda(lista: FinalOficial[], enAgenda: Set<string>): Promise<number> {
  const nuevos = lista
    .filter((f) => !estaEnAgenda(f, enAgenda))
    .map((f) => ({ materia_id: f.materiaId, tipo: 'examen' as const, titulo: tituloEnAgenda(f), fecha: fechaHoraFinal(f).toISOString(), aviso_minutos: 1440 }));
  if (!nuevos.length) return 0;
  if (MODO_DEMO) {
    await esperar(300);
    db.eventos.push(...nuevos.map((e) => ({ ...e, id: idDemo(), usuario_id: UID_DEMO, plan_id: null, notificado: false, created_at: new Date().toISOString() })));
    return nuevos.length;
  }
  const { error } = await supabase.from('eventos').insert(nuevos);
  lanzar(error);
  return nuevos.length;
}
