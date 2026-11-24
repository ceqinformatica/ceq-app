/**
 * Del horario de clases oficial a la agenda del estudiante: qué clases son
 * de sus materias, con qué secciones, y cuáles ya tiene cargadas. Sin
 * dependencias, para probarlo con node --test.
 */
import { mismaMateria } from './horario-finales.ts';
import type { TipoClase } from './tipo-clase.ts';

export interface ClaseOficial {
  materia: string;
  nivel: number | null;
  seccion: string | null;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  aula: string | null;
  tipo_clase: TipoClase | null;
}

export interface ClaseMia {
  materia_id: string | null;
  dia_semana: number;
  hora_inicio: string;
}

export interface OpcionSeccion<C extends ClaseOficial = ClaseOficial> {
  /** null = sin sección (o sección única). */
  seccion: string | null;
  clases: (C & { yaEsta: boolean })[];
}

export interface MateriaConClases<C extends ClaseOficial = ClaseOficial> {
  materiaId: string;
  nombre: string;
  secciones: OpcionSeccion<C>[];
}

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Agrupa las clases oficiales por cada materia tuya (las que cursás), y en
 * cada una por sección. Las materias que no figuran en el horario van en
 * `faltan`.
 */
export function clasesDeMisMaterias<C extends ClaseOficial>(
  oficiales: C[],
  mias: { id: string; nombre: string }[],
  agenda: ClaseMia[],
): { materias: MateriaConClases<C>[]; faltan: string[] } {
  const materias: MateriaConClases<C>[] = [];
  const faltan: string[] = [];
  for (const m of mias) {
    const suyas = oficiales.filter((c) => mismaMateria(c.materia, m.nombre));
    if (!suyas.length) {
      faltan.push(m.nombre);
      continue;
    }
    const porSeccion = new Map<string, (C & { yaEsta: boolean })[]>();
    for (const c of suyas) {
      const yaEsta = agenda.some((a) => a.materia_id === m.id && a.dia_semana === c.dia_semana && hhmm(a.hora_inicio) === hhmm(c.hora_inicio));
      const k = c.seccion ?? '';
      porSeccion.set(k, [...(porSeccion.get(k) ?? []), { ...c, yaEsta }]);
    }
    const secciones = [...porSeccion.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([k, clases]) => ({ seccion: k || null, clases: clases.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)) }));
    materias.push({ materiaId: m.id, nombre: m.nombre, secciones });
  }
  return { materias, faltan };
}

/**
 * Sección que conviene ofrecer primero: la que ya tenés cargada en la agenda
 * (aunque sea en parte) o, si no, la primera.
 */
export function seccionSugerida(m: MateriaConClases): string | null {
  const cargada = m.secciones.find((s) => s.clases.some((c) => c.yaEsta));
  return (cargada ?? m.secciones[0])?.seccion ?? null;
}
