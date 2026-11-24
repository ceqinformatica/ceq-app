/**
 * Datos del panel de administración del CEQ. Todo pasa por RLS: si la
 * cuenta no es admin, Supabase rechaza las escrituras aunque alguien
 * llegue a estas pantallas.
 */
import { supabase } from '../lib/supabase';
import type { AvisoDb, Carrera, EncuestaDb, NotificacionDb, PendientesPanel, ResumenAdmin, SugerenciaDb } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO } from './demo';
import { lanzar } from '../lib/errores';

export async function cargarResumen(): Promise<ResumenAdmin> {
  if (MODO_DEMO) {
    await esperar(150);
    return { usuarios: 312, celulares: 248, sugerencias_nuevas: db.sugerencias.filter((s) => s.estado === 'recibida').length, programadas: db.notificaciones.filter((n) => n.estado === 'pendiente').length };
  }
  const { data, error } = await supabase.rpc('resumen_admin');
  lanzar(error);
  return data as ResumenAdmin;
}

/** Lo que espera al CEQ: carnets por validar, ventanas visibles, horarios en borrador. Si falla (migración sin aplicar), ceros. */
export async function cargarPendientes(): Promise<PendientesPanel | null> {
  if (MODO_DEMO) {
    return {
      carnets_pendientes: db.solicitudesCarnet.filter((x) => x.estado === 'pendiente').length,
      ventanas_activas: db.ventanas.filter((v) => v.activa).length,
      horarios_borrador: db.horariosFinales.filter((h) => !h.publicado).length,
      clases_borrador: db.horariosClases.filter((h) => !h.publicado).length,
    };
  }
  const { data, error } = await supabase.rpc('pendientes_panel');
  return error ? null : (data as PendientesPanel);
}

export async function cargarCarreras(): Promise<Carrera[]> {
  if (MODO_DEMO) return db.carreras;
  const { data, error } = await supabase.from('carreras').select('*').eq('activa', true).order('nombre');
  lanzar(error);
  return data ?? [];
}

/** A cuántos celulares llegaría un aviso (para mostrar antes de enviar). */
export async function alcance(carreraId: string | null): Promise<number | null> {
  if (MODO_DEMO) return carreraId ? 61 : 248;
  const { data, error } = await supabase.rpc('alcance_notificacion', { p_carrera: carreraId });
  if (error) return null;
  return data as number;
}

/* ---------------- Avisos ---------------- */

export async function cargarAvisosAdmin(): Promise<AvisoDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.avisos];
  }
  const { data, error } = await supabase.from('avisos').select('*').order('publicar_en', { ascending: false }).limit(100);
  lanzar(error);
  return data ?? [];
}

export interface AvisoNuevo {
  titulo: string;
  cuerpo: string;
  imagen_url: string | null;
  notificar: boolean;
  publicado: boolean;
  publicar_en: string;
  carrera_id: string | null;
}

export async function guardarAviso(id: string | null, aviso: AvisoNuevo): Promise<string> {
  if (MODO_DEMO) {
    await esperar(300);
    if (id) {
      db.avisos = db.avisos.map((a) => (a.id === id ? { ...a, ...aviso } : a));
      return id;
    }
    const nuevo: AvisoDb = { id: idDemo(), autor_id: null, created_at: new Date().toISOString(), ...aviso };
    db.avisos.unshift(nuevo);
    return nuevo.id;
  }
  if (id) {
    const { error } = await supabase.from('avisos').update(aviso).eq('id', id);
    lanzar(error);
    return id;
  }
  const { data, error } = await supabase.from('avisos').insert(aviso).select('id').single();
  lanzar(error);
  return data!.id;
}

export async function borrarAviso(id: string) {
  if (MODO_DEMO) {
    db.avisos = db.avisos.filter((a) => a.id !== id);
    return;
  }
  const { error } = await supabase.from('avisos').delete().eq('id', id);
  lanzar(error);
}

/** Estado de la notificación de un aviso (enviada, programada…). */
export async function notificacionDeAviso(avisoId: string): Promise<NotificacionDb | null> {
  if (MODO_DEMO) return db.notificaciones.find((n) => n.aviso_id === avisoId) ?? null;
  const { data } = await supabase.from('notificaciones').select('*').eq('aviso_id', avisoId).maybeSingle();
  return data ?? null;
}

/* ---------------- Notificaciones ---------------- */

export async function cargarNotificaciones(): Promise<NotificacionDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.notificaciones].sort((a, b) => b.programada_para.localeCompare(a.programada_para));
  }
  const { data, error } = await supabase.from('notificaciones').select('*').order('programada_para', { ascending: false }).limit(100);
  lanzar(error);
  return data ?? [];
}

export async function programarNotificacion(n: { titulo: string; cuerpo: string; programada_para: string; carrera_id: string | null; ruta: string | null }) {
  if (MODO_DEMO) {
    await esperar(300);
    db.notificaciones.unshift({
      id: idDemo(), tipo: 'mensaje', aviso_id: null, evento_id: null, usuario_id: null, plan_id: null, estado: 'pendiente',
      enviada_en: null, destinatarios: null, creada_por: null, created_at: new Date().toISOString(), ...n,
    });
    return;
  }
  const { error } = await supabase.from('notificaciones').insert({ tipo: 'mensaje', ...n });
  lanzar(error);
}

export async function cancelarNotificacion(id: string) {
  if (MODO_DEMO) {
    db.notificaciones = db.notificaciones.map((n) => (n.id === id ? { ...n, estado: 'cancelada' } : n));
    return;
  }
  const { error } = await supabase.from('notificaciones').update({ estado: 'cancelada' }).eq('id', id).eq('estado', 'pendiente');
  lanzar(error);
}

/* ---------------- Encuestas ---------------- */

export interface EncuestaAdmin extends EncuestaDb {
  opciones: { id: string; texto: string; votos: number }[];
  total: number;
}

export async function cargarEncuestasAdmin(): Promise<EncuestaAdmin[]> {
  if (MODO_DEMO) {
    await esperar();
    return db.encuestas.map((e) => {
      const opciones = db.opciones.filter((o) => o.encuesta_id === e.id).map((o) => ({ id: o.id, texto: o.texto, votos: db.votos[o.id] ?? 0 }));
      return { ...e, opciones, total: opciones.reduce((s, o) => s + o.votos, 0) };
    });
  }
  const { data: encuestas, error } = await supabase.from('encuestas').select('*').order('created_at', { ascending: false }).limit(50);
  lanzar(error);
  if (!encuestas?.length) return [];
  const ids = encuestas.map((e) => e.id);
  const [rO, rR] = await Promise.all([
    supabase.from('opciones_encuesta').select('*').in('encuesta_id', ids).order('orden'),
    supabase.from('resultados_encuesta').select('*').in('encuesta_id', ids),
  ]);
  lanzar(rO.error);
  lanzar(rR.error);
  const votos = new Map((rR.data ?? []).map((r) => [r.opcion_id, r.votos]));
  return encuestas.map((e) => {
    const opciones = (rO.data ?? []).filter((o) => o.encuesta_id === e.id).map((o) => ({ id: o.id, texto: o.texto, votos: votos.get(o.id) ?? 0 }));
    return { ...e, opciones, total: opciones.reduce((s, o) => s + o.votos, 0) };
  });
}

export async function crearEncuesta(pregunta: string, opciones: string[], cierraEn: string | null) {
  if (MODO_DEMO) {
    await esperar(300);
    const id = idDemo();
    db.encuestas.unshift({ id, pregunta, abierta: true, cierra_en: cierraEn, created_at: new Date().toISOString() });
    opciones.forEach((texto, orden) => db.opciones.push({ id: idDemo(), encuesta_id: id, texto, orden }));
    return;
  }
  const { data, error } = await supabase.from('encuestas').insert({ pregunta, cierra_en: cierraEn }).select('id').single();
  lanzar(error);
  const { error: e2 } = await supabase.from('opciones_encuesta').insert(opciones.map((texto, orden) => ({ encuesta_id: data!.id, texto, orden })));
  if (e2) {
    // Sin opciones la encuesta no sirve: se deshace.
    await supabase.from('encuestas').delete().eq('id', data!.id);
    lanzar(e2);
  }
}

export async function cambiarEncuesta(id: string, abierta: boolean) {
  if (MODO_DEMO) {
    db.encuestas = db.encuestas.map((e) => (e.id === id ? { ...e, abierta } : e));
    return;
  }
  const { error } = await supabase.from('encuestas').update({ abierta }).eq('id', id);
  lanzar(error);
}

export async function borrarEncuesta(id: string) {
  if (MODO_DEMO) {
    db.encuestas = db.encuestas.filter((e) => e.id !== id);
    return;
  }
  const { error } = await supabase.from('encuestas').delete().eq('id', id);
  lanzar(error);
}

/* ---------------- Sugerencias ---------------- */

export async function cargarSugerenciasAdmin(): Promise<SugerenciaDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.sugerencias];
  }
  const { data, error } = await supabase.from('sugerencias').select('*').order('created_at', { ascending: false }).limit(200);
  lanzar(error);
  return data ?? [];
}

export async function responderSugerencia(id: string, estado: SugerenciaDb['estado'], respuesta: string | null) {
  if (MODO_DEMO) {
    db.sugerencias = db.sugerencias.map((s) => (s.id === id ? { ...s, estado, respuesta } : s));
    return;
  }
  const { error } = await supabase.from('sugerencias').update({ estado, respuesta }).eq('id', id);
  lanzar(error);
}
