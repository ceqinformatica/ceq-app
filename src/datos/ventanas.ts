/**
 * Ventanas flotantes del CEQ: el panel las arma y la app las muestra.
 * Lo que cada estudiante ya vio se guarda solo en su celular.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import type { VentanaDb } from '../lib/tipos-db';
import type { Vistas } from '../lib/ventanas';
import { db, esperar, idDemo, MODO_DEMO } from './demo';
import { lanzar } from '../lib/errores';

export type VentanaNueva = Omit<VentanaDb, 'id' | 'creada_por' | 'created_at' | 'updated_at'>;

export async function cargarVentanasAdmin(): Promise<VentanaDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return [...db.ventanas];
  }
  const { data, error } = await supabase.from('ventanas').select('*').order('desde', { ascending: false }).limit(200);
  lanzar(error);
  return data ?? [];
}

export async function guardarVentana(id: string | null, v: VentanaNueva): Promise<string> {
  if (MODO_DEMO) {
    await esperar(300);
    const ahora = new Date().toISOString();
    if (id) {
      db.ventanas = db.ventanas.map((x) => (x.id === id ? { ...x, ...v, updated_at: ahora } : x));
      return id;
    }
    const nueva: VentanaDb = { ...v, id: idDemo(), creada_por: null, created_at: ahora, updated_at: ahora };
    db.ventanas.unshift(nueva);
    return nueva.id;
  }
  if (id) {
    const { error } = await supabase.from('ventanas').update(v).eq('id', id);
    lanzar(error);
    return id;
  }
  const { data, error } = await supabase.from('ventanas').insert(v).select('id').single();
  lanzar(error);
  return data!.id;
}

export async function borrarVentana(id: string) {
  if (MODO_DEMO) {
    db.ventanas = db.ventanas.filter((x) => x.id !== id);
    return;
  }
  const { error } = await supabase.from('ventanas').delete().eq('id', id);
  lanzar(error);
}

/** Sube una imagen elegida del teléfono y devuelve su enlace público. */
export async function subirImagenVentana(uri: string, tipo: string | undefined): Promise<string> {
  if (MODO_DEMO) {
    await esperar(300);
    return 'https://ceqinformatica.github.io/logo-ceq.png';
  }
  const ext = tipo?.includes('png') ? 'png' : tipo?.includes('webp') ? 'webp' : 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  let cuerpo: Blob | ArrayBuffer;
  if (Platform.OS === 'web') cuerpo = await (await fetch(uri)).blob();
  else {
    const { File } = await import('expo-file-system');
    const b = await new File(uri).bytes();
    cuerpo = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const { error } = await supabase.storage.from('ventanas').upload(path, cuerpo, { contentType: tipo ?? 'image/jpeg', upsert: false });
  lanzar(error);
  return supabase.storage.from('ventanas').getPublicUrl(path).data.publicUrl;
}

/** Las ventanas que el estudiante puede ver ahora (RLS filtra fechas y carrera). */
export async function cargarVentanasParaMi(): Promise<VentanaDb[]> {
  if (MODO_DEMO) return db.ventanas.filter((v) => v.activa);
  const { data, error } = await supabase.from('ventanas').select('*').eq('activa', true).limit(50);
  lanzar(error);
  return data ?? [];
}

const claveVistas = (uid: string) => `ceq.ventanas.v1:${uid}`;

export async function leerVistas(uid: string): Promise<Vistas> {
  try {
    const t = await AsyncStorage.getItem(claveVistas(uid));
    return t ? (JSON.parse(t) as Vistas) : {};
  } catch {
    return {};
  }
}

export async function guardarVistas(uid: string, vistas: Vistas) {
  try {
    await AsyncStorage.setItem(claveVistas(uid), JSON.stringify(vistas));
  } catch {
    // si no se puede guardar, a lo sumo se vuelve a mostrar
  }
}
