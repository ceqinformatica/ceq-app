import { supabase } from '../lib/supabase';
import type { AvisoDb, EncuestaDb, SocioDb, TramiteDb } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';

function lanzar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function cargarAvisos(limite = 30): Promise<AvisoDb[]> {
  if (MODO_DEMO) {
    await esperar();
    const ahora = new Date().toISOString();
    return db.avisos.filter((a) => a.publicado && (a.publicar_en ?? a.created_at) <= ahora).slice(0, limite);
  }
  // Los programados todavía no se muestran (el admin los ve en su panel).
  const { data, error } = await supabase
    .from('avisos')
    .select('*')
    .eq('publicado', true)
    .lte('publicar_en', new Date().toISOString())
    .order('publicar_en', { ascending: false })
    .limit(limite);
  lanzar(error);
  return data ?? [];
}

export async function cargarAviso(id: string): Promise<AvisoDb | null> {
  if (MODO_DEMO) return db.avisos.find((a) => a.id === id) ?? null;
  const { data, error } = await supabase.from('avisos').select('*').eq('id', id).maybeSingle();
  lanzar(error);
  return data;
}

export async function cargarSocio(uid: string): Promise<SocioDb | null> {
  if (MODO_DEMO) {
    await esperar(150);
    return db.socio;
  }
  const { data, error } = await supabase.from('socios').select('*').eq('usuario_id', uid).maybeSingle();
  lanzar(error);
  return data;
}

export async function cargarTramites(): Promise<TramiteDb[]> {
  if (MODO_DEMO) {
    await esperar(150);
    return db.tramites;
  }
  const { data, error } = await supabase.from('tramites').select('*').order('orden');
  lanzar(error);
  return data ?? [];
}

export async function enviarSugerencia(categoria: string, texto: string) {
  if (MODO_DEMO) {
    await esperar(300);
    db.sugerencias.push({ id: idDemo(), usuario_id: UID_DEMO, categoria, texto, estado: 'recibida', respuesta: null, created_at: new Date().toISOString() });
    return;
  }
  const { error } = await supabase.from('sugerencias').insert({ categoria, texto });
  lanzar(error);
}

export interface EncuestaConResultados extends EncuestaDb {
  opciones: { id: string; texto: string; votos: number }[];
  total: number;
  yaVote: boolean;
}

export async function cargarEncuestas(uid: string): Promise<EncuestaConResultados[]> {
  if (MODO_DEMO) {
    await esperar(150);
    return db.encuestas.map((e) => {
      const opciones = db.opciones.filter((o) => o.encuesta_id === e.id).map((o) => ({ id: o.id, texto: o.texto, votos: db.votos[o.id] ?? 0 }));
      return { ...e, opciones, total: opciones.reduce((s, o) => s + o.votos, 0), yaVote: db.yaVote.has(e.id) };
    });
  }
  const { data: encuestas, error } = await supabase.from('encuestas').select('*').eq('abierta', true).order('created_at', { ascending: false });
  lanzar(error);
  if (!encuestas?.length) return [];
  const ids = encuestas.map((e) => e.id);
  const [rO, rR, rV] = await Promise.all([
    supabase.from('opciones_encuesta').select('*').in('encuesta_id', ids).order('orden'),
    supabase.from('resultados_encuesta').select('*').in('encuesta_id', ids),
    supabase.from('ya_votaron').select('encuesta_id').eq('usuario_id', uid),
  ]);
  lanzar(rO.error);
  const votos = new Map((rR.data ?? []).map((r) => [r.opcion_id, r.votos]));
  const yaVote = new Set((rV.data ?? []).map((v) => v.encuesta_id));
  return encuestas.map((e) => {
    const opciones = (rO.data ?? []).filter((o) => o.encuesta_id === e.id).map((o) => ({ id: o.id, texto: o.texto, votos: votos.get(o.id) ?? 0 }));
    return { ...e, opciones, total: opciones.reduce((s, o) => s + o.votos, 0), yaVote: yaVote.has(e.id) };
  });
}

export async function votar(encuestaId: string, opcionId: string) {
  if (MODO_DEMO) {
    await esperar(250);
    if (db.yaVote.has(encuestaId)) throw new Error('Ya votaste en esta encuesta');
    db.yaVote.add(encuestaId);
    db.votos[opcionId] = (db.votos[opcionId] ?? 0) + 1;
    return;
  }
  const { error } = await supabase.rpc('votar', { p_encuesta: encuestaId, p_opcion: opcionId });
  lanzar(error);
}

/** Contenido del QR del carnet: verificable por el CEQ, sin datos sensibles de más. */
export function contenidoQr(socio: SocioDb) {
  return `CEQ:SOCIO:${socio.numero_socio ?? socio.id}`;
}

export function carnetVigente(socio: SocioDb) {
  if (!socio.vigente_hasta) return true;
  return new Date(`${socio.vigente_hasta}T23:59:59`) >= new Date();
}

/** "Hoy", "Ayer", "Hace 3 días" o la fecha. */
export const haceCuanto = (iso: string) => {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  const f = new Date(iso);
  return `${f.getDate()}/${f.getMonth() + 1}/${f.getFullYear()}`;
};

