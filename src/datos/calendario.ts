/**
 * Calendario académico oficial de la FCQ: lo leen todos y lo edita el CEQ
 * desde el panel (RLS: solo admin escribe).
 */
import type { CategoriaCalendario, EventoCalendario } from '../lib/calendario';
import { lanzar } from '../lib/errores';
import { supabase } from '../lib/supabase';
import type { CalendarioDb } from '../lib/tipos-db';
import { CALENDARIO_FCQ_2026 } from './calendario-fcq';
import { db, esperar, idDemo, MODO_DEMO } from './demo';

const aEvento = (c: CalendarioDb): EventoCalendario => ({
  id: c.id, anio: c.anio, semestre: c.semestre, categoria: c.categoria, titulo: c.titulo, desde: c.desde, hasta: c.hasta, detalle: c.detalle,
});

/** El calendario 2026 que viene con la app (por si la base no lo tiene). */
function copiaLocal(): EventoCalendario[] {
  return CALENDARIO_FCQ_2026.map((f) => ({ id: f.clave, anio: f.anio, semestre: f.semestre, categoria: f.categoria, titulo: f.titulo, desde: f.desde, hasta: f.hasta, detalle: f.detalle ?? null }))
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));
}

const orden = (a: CalendarioDb, b: CalendarioDb) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta) || a.titulo.localeCompare(b.titulo, 'es');

/** Con `copiaSiFalta`, si la tabla todavía no existe se usa la copia incluida (el panel no la usa). */
export async function cargarCalendario(copiaSiFalta = true): Promise<EventoCalendario[]> {
  if (MODO_DEMO) {
    await esperar(150);
    return [...db.calendario].sort(orden).map(aEvento);
  }
  const { data, error } = await supabase.from('calendario_academico').select('*').order('desde').order('hasta').limit(1000);
  // Si la tabla todavía no existe en la base, se usa la copia que viene con la app.
  if (error && copiaSiFalta && (error.code === 'PGRST205' || error.code === '42P01')) return copiaLocal();
  lanzar(error);
  return (data ?? []).map(aEvento);
}

export async function cargarFechaCalendario(id: string): Promise<EventoCalendario | null> {
  if (MODO_DEMO) {
    const c = db.calendario.find((x) => x.id === id);
    return c ? aEvento(c) : null;
  }
  const { data, error } = await supabase.from('calendario_academico').select('*').eq('id', id).maybeSingle();
  lanzar(error);
  return data ? aEvento(data) : null;
}

export interface FormularioFecha {
  titulo: string;
  categoria: CategoriaCalendario;
  semestre: 1 | 2 | null;
  desde: string;
  hasta: string;
  detalle: string;
}

export async function guardarFechaCalendario(id: string | null, f: FormularioFecha): Promise<void> {
  const fila = {
    titulo: f.titulo.trim(),
    categoria: f.categoria,
    semestre: f.semestre,
    desde: f.desde,
    hasta: f.hasta,
    anio: Number(f.desde.slice(0, 4)),
    detalle: f.detalle.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (MODO_DEMO) {
    await esperar();
    if (id) db.calendario = db.calendario.map((c) => (c.id === id ? { ...c, ...fila } : c));
    else db.calendario.push({ ...fila, id: idDemo(), clave: null, created_at: fila.updated_at });
    return;
  }
  if (id) {
    const { data, error } = await supabase.from('calendario_academico').update(fila).eq('id', id).select('id');
    lanzar(error);
    if (!data?.length) throw new Error('Esta fecha ya no existe: puede que otra persona la haya borrado.');
    return;
  }
  const { error } = await supabase.from('calendario_academico').insert(fila);
  lanzar(error);
}

export async function borrarFechaCalendario(id: string): Promise<void> {
  if (MODO_DEMO) {
    db.calendario = db.calendario.filter((c) => c.id !== id);
    return;
  }
  const { error } = await supabase.from('calendario_academico').delete().eq('id', id);
  lanzar(error);
}
