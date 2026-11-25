/**
 * Horarios de clases oficiales: el CEQ sube el PDF de cada carrera, revisa
 * las clases que leyó la app y lo publica; los estudiantes cargan las de
 * sus materias a la agenda.
 */
import { supabase } from '../lib/supabase';
import { lanzar } from '../lib/errores';
import type { TipoClase } from '../lib/tipo-clase';
import type { ClaseOficialDb, HorarioClasesDb } from '../lib/tipos-db';
import { elegirHorarioPublicado } from '../lib/clases-oficiales';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';

const BUCKET = 'horarios-clases';

export interface ClaseEditable {
  materia: string;
  nivel: number | null;
  seccion: string | null;
  dia_semana: number;
  /** HH:MM */
  hora_inicio: string;
  hora_fin: string;
  aula: string | null;
  tipo_clase: TipoClase | null;
}

/** ¿Falta la migración de los horarios de clases? (para avisar en vez de mostrar un error raro) */
export const faltaMigracion = (e: unknown) => /horarios_clases|clases_oficiales|schema cache|does not exist/i.test(String((e as { message?: string })?.message ?? e));

/* ---------------- Panel ---------------- */

export async function cargarHorariosClasesAdmin(): Promise<HorarioClasesDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.horariosClases].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase.from('horarios_clases').select('*').order('created_at', { ascending: false }).limit(100);
  lanzar(error);
  return data ?? [];
}

export async function cargarHorarioClases(id: string): Promise<{ horario: HorarioClasesDb; clases: ClaseOficialDb[] } | null> {
  if (MODO_DEMO) {
    await esperar();
    const horario = db.horariosClases.find((h) => h.id === id);
    return horario ? { horario, clases: db.clasesOficiales.filter((c) => c.horario_id === id) } : null;
  }
  const [rH, rC] = await Promise.all([
    supabase.from('horarios_clases').select('*').eq('id', id).maybeSingle(),
    supabase.from('clases_oficiales').select('*').eq('horario_id', id).order('nivel').order('dia_semana').order('hora_inicio'),
  ]);
  lanzar(rH.error);
  lanzar(rC.error);
  return rH.data ? { horario: rH.data, clases: rC.data ?? [] } : null;
}

const paraGuardar = (c: ClaseEditable) => ({
  materia: c.materia.trim(),
  nivel: c.nivel,
  seccion: c.seccion?.trim() || null,
  dia_semana: c.dia_semana,
  hora_inicio: c.hora_inicio.slice(0, 5),
  hora_fin: c.hora_fin.slice(0, 5),
  aula: c.aula?.trim() || null,
  tipo_clase: c.tipo_clase,
});

/** Crea el horario (borrador) con su PDF y sus clases. */
export async function crearHorarioClases(carreraId: string, planAnio: number | null, titulo: string, pdf: Uint8Array | null, clases: ClaseEditable[]): Promise<string> {
  if (MODO_DEMO) {
    await esperar(400);
    const id = idDemo();
    const ahora = new Date().toISOString();
    db.horariosClases.unshift({ id, carrera_id: carreraId, plan_anio: planAnio, titulo, pdf_path: null, publicado: false, publicado_en: null, creado_por: UID_DEMO, created_at: ahora, updated_at: ahora });
    db.clasesOficiales.push(...clases.map((c) => ({ ...paraGuardar(c), hora_inicio: c.hora_inicio.slice(0, 5) + ':00', hora_fin: c.hora_fin.slice(0, 5) + ':00', id: idDemo(), horario_id: id, created_at: ahora })));
    return id;
  }
  let path: string | null = null;
  if (pdf) {
    path = `${carreraId}/${Date.now()}.pdf`;
    const cuerpo = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const { error } = await supabase.storage.from(BUCKET).upload(path, cuerpo, { contentType: 'application/pdf', upsert: false });
    lanzar(error);
  }
  const { data, error } = await supabase.from('horarios_clases').insert({ carrera_id: carreraId, plan_anio: planAnio, titulo: titulo.trim(), pdf_path: path }).select('id').single();
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    lanzar(error);
  }
  try {
    await guardarClasesOficiales(data!.id, clases);
  } catch (e) {
    await supabase.from('horarios_clases').delete().eq('id', data!.id);
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw e;
  }
  return data!.id;
}

export async function guardarClasesOficiales(horarioId: string, clases: ClaseEditable[]) {
  if (MODO_DEMO) {
    await esperar(300);
    const ahora = new Date().toISOString();
    db.clasesOficiales = db.clasesOficiales.filter((c) => c.horario_id !== horarioId);
    db.clasesOficiales.push(...clases.map((c) => ({ ...paraGuardar(c), hora_inicio: c.hora_inicio.slice(0, 5) + ':00', hora_fin: c.hora_fin.slice(0, 5) + ':00', id: idDemo(), horario_id: horarioId, created_at: ahora })));
    return;
  }
  const { error } = await supabase.rpc('guardar_clases_oficiales', { p_horario: horarioId, p_clases: clases.map(paraGuardar) });
  lanzar(error);
}

export async function actualizarHorarioClases(id: string, cambios: { titulo: string; plan_anio: number | null }) {
  if (MODO_DEMO) {
    db.horariosClases = db.horariosClases.map((h) => (h.id === id ? { ...h, ...cambios } : h));
    return;
  }
  const { error } = await supabase.from('horarios_clases').update({ titulo: cambios.titulo.trim(), plan_anio: cambios.plan_anio }).eq('id', id);
  lanzar(error);
}

export async function publicarHorarioClases(id: string, notificar: boolean): Promise<number> {
  if (MODO_DEMO) {
    await esperar(300);
    db.horariosClases = db.horariosClases.map((h) => (h.id === id ? { ...h, publicado: true, publicado_en: h.publicado_en ?? new Date().toISOString() } : h));
    return db.clasesOficiales.filter((c) => c.horario_id === id).length;
  }
  const { data, error } = await supabase.rpc('publicar_horario_clases', { p_id: id, p_notificar: notificar });
  lanzar(error);
  return data as number;
}

export async function ocultarHorarioClases(id: string) {
  if (MODO_DEMO) {
    db.horariosClases = db.horariosClases.map((h) => (h.id === id ? { ...h, publicado: false } : h));
    return;
  }
  const { error } = await supabase.from('horarios_clases').update({ publicado: false }).eq('id', id);
  lanzar(error);
}

export async function borrarHorarioClases(h: HorarioClasesDb) {
  if (MODO_DEMO) {
    db.horariosClases = db.horariosClases.filter((x) => x.id !== h.id);
    db.clasesOficiales = db.clasesOficiales.filter((x) => x.horario_id !== h.id);
    return;
  }
  const { error } = await supabase.from('horarios_clases').delete().eq('id', h.id);
  lanzar(error);
  if (h.pdf_path) await supabase.storage.from(BUCKET).remove([h.pdf_path]).catch(() => undefined);
}

/** Enlace temporal (1 hora) al PDF original. */
export async function urlPdfHorarioClases(path: string | null): Promise<string | null> {
  if (!path || MODO_DEMO) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/* ---------------- Estudiante ---------------- */

/**
 * El horario de clases publicado que le corresponde a tu plan (o uno general
 * de la carrera, marcado `general`), con sus clases. null si no hay (o si la
 * migración todavía no está aplicada).
 */
export async function cargarHorarioClasesPublicado(
  carreraId: string | null | undefined,
  planId: string | null | undefined,
): Promise<{ horario: HorarioClasesDb; clases: ClaseOficialDb[]; general: boolean } | null> {
  if (!carreraId) return null;
  if (MODO_DEMO) {
    await esperar();
    const planAnio = db.planes.find((p) => p.id === planId)?.anio ?? null;
    const elegido = elegirHorarioPublicado(db.horariosClases.filter((h) => h.publicado && h.carrera_id === carreraId), planAnio);
    return elegido ? { ...elegido, clases: db.clasesOficiales.filter((c) => c.horario_id === elegido.horario.id) } : null;
  }
  const [rPlan, rH] = await Promise.all([
    planId ? supabase.from('planes').select('anio').eq('id', planId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase
      .from('horarios_clases')
      .select('*')
      .eq('carrera_id', carreraId)
      .eq('publicado', true)
      .order('publicado_en', { ascending: false })
      .limit(20),
  ]);
  if (rH.error) {
    if (faltaMigracion(rH.error)) return null;
    lanzar(rH.error);
  }
  lanzar(rPlan.error);
  const elegido = elegirHorarioPublicado(rH.data ?? [], rPlan.data?.anio ?? null);
  if (!elegido) return null;
  const { data: clases, error: e2 } = await supabase.from('clases_oficiales').select('*').eq('horario_id', elegido.horario.id).order('dia_semana').order('hora_inicio');
  lanzar(e2);
  return { ...elegido, clases: clases ?? [] };
}
