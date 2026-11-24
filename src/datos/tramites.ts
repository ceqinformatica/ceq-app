/**
 * Guía de trámites: lectura para estudiantes y edición desde el panel.
 * Las escrituras pasan por RLS: solo una cuenta admin puede guardar.
 */
import { supabase } from '../lib/supabase';
import type { TramiteDb } from '../lib/tipos-db';
import type { TramiteNuevo } from '../lib/tramites';
import { db, esperar, idDemo, MODO_DEMO } from './demo';
import { lanzar } from '../lib/errores';

const porOrden = (a: TramiteDb, b: TramiteDb) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');

/** Lo que ven los estudiantes: solo los publicados. */
export async function cargarTramites(): Promise<TramiteDb[]> {
  if (MODO_DEMO) {
    await esperar(150);
    return db.tramites.filter((t) => t.publicado).sort(porOrden);
  }
  const { data, error } = await supabase.from('tramites').select('*').eq('publicado', true).order('orden').order('nombre');
  lanzar(error);
  return data ?? [];
}

/** Para el estudiante: un oculto no se muestra (RLS hace lo mismo en Supabase, salvo al admin). */
/** Id de un trámite, o su clave con el prefijo "clave:" (ej. "clave:semestre-opuesto"). */
export async function cargarTramite(id: string, incluirOcultos = false): Promise<TramiteDb | null> {
  if (id.startsWith('clave:')) {
    const clave = id.slice(6);
    if (MODO_DEMO) {
      await esperar(100);
      return db.tramites.find((t) => t.clave === clave && (incluirOcultos || t.publicado)) ?? null;
    }
    let q = supabase.from('tramites').select('*').eq('clave', clave);
    if (!incluirOcultos) q = q.eq('publicado', true);
    const { data, error } = await q.maybeSingle();
    lanzar(error);
    return data;
  }
  if (MODO_DEMO) {
    await esperar(100);
    return db.tramites.find((t) => t.id === id && (incluirOcultos || t.publicado)) ?? null;
  }
  if (!incluirOcultos) {
    const { data, error } = await supabase.from('tramites').select('*').eq('id', id).eq('publicado', true).maybeSingle();
    lanzar(error);
    return data;
  }
  const { data, error } = await supabase.from('tramites').select('*').eq('id', id).maybeSingle();
  lanzar(error);
  return data;
}

/** Panel: todos, también los ocultos. */
export async function cargarTramitesAdmin(): Promise<TramiteDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.tramites].sort(porOrden);
  }
  const { data, error } = await supabase.from('tramites').select('*').order('orden').order('nombre');
  lanzar(error);
  return data ?? [];
}

/** Crea (id null) o actualiza. Un trámite nuevo va al final de la lista. */
export async function guardarTramite(id: string | null, tramite: TramiteNuevo, publicado: boolean): Promise<string> {
  const fila = { ...tramite, publicado };
  if (MODO_DEMO) {
    await esperar();
    if (id) {
      db.tramites = db.tramites.map((t) => (t.id === id ? { ...t, ...fila, clave: t.clave, updated_at: new Date().toISOString() } : t));
      return id;
    }
    const nuevo: TramiteDb = { ...fila, id: idDemo(), orden: Math.max(0, ...db.tramites.map((t) => t.orden)) + 10, updated_at: new Date().toISOString() };
    db.tramites.push(nuevo);
    return nuevo.id;
  }
  if (id) {
    // La clave de la guía inicial no se toca: es la que evita duplicados.
    const { clave: _clave, ...cambios } = fila;
    const { error } = await supabase.from('tramites').update(cambios).eq('id', id);
    lanzar(error);
    return id;
  }
  const { data: ultimo } = await supabase.from('tramites').select('orden').order('orden', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from('tramites')
    .insert({ ...fila, clave: null, orden: (ultimo?.orden ?? 0) + 10 })
    .select('id')
    .single();
  lanzar(error);
  return data!.id;
}

export async function borrarTramite(id: string) {
  if (MODO_DEMO) {
    db.tramites = db.tramites.filter((t) => t.id !== id);
    return;
  }
  const { error } = await supabase.from('tramites').delete().eq('id', id);
  lanzar(error);
}
