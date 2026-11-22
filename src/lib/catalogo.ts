import { supabase } from './supabase';
import type { Carrera, Plan } from './tipos-db';

export async function listarCarreras(): Promise<Carrera[]> {
  const { data, error } = await supabase.from('carreras').select('*').eq('activa', true).order('nombre');
  if (error) throw error;
  return data ?? [];
}

export async function listarPlanes(carreraId: string): Promise<Plan[]> {
  const { data, error } = await supabase.from('planes').select('*').eq('carrera_id', carreraId).order('anio', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
