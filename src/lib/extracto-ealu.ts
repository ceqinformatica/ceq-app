/**
 * Lectura del extracto de "Notas finales" del sistema académico de la FCQ
 * (EALU). Recibe el texto del PDF (una fila por línea) y devuelve las
 * materias aprobadas con su fecha, acta y nota. Funciones puras.
 *
 * Formato de cada fila, por ejemplo:
 *   10) Quimica Inorganica   07/12/2024   59727   4   (CUATRO)
 *   22) Fisicoquimica        16/06/2026   62042   65   3   (TRES)
 *   2)  Seminario I          25/06/2024   58559   APR(APROBADO)
 */

export interface FilaExtracto {
  numero: number;
  nombre: string;
  /** AAAA-MM-DD, o null si la fila no trae fecha. */
  fecha: string | null;
  acta: string | null;
  /** Rendimiento 0-100 cuando el extracto lo trae. */
  puntaje: number | null;
  /** 1 a 5, o null si es una materia aprobada sin nota (APR) o "completo" (C). */
  nota: number | null;
  /** Encabezado de bloque, ej. "QUINTO NIVEL" o "ASIGNATURAS OPTATIVAS". */
  bloque: string | null;
  optativa: boolean;
}

export interface Extracto {
  carrera: string | null;
  plan: number | null;
  filas: FilaExtracto[];
  /** Promedio que informa el extracto. */
  promedio: number | null;
}

const FILA = /^\s*(\d+)\)\s+(.+?)\s{2,}(?:(\d{2})\/(\d{2})\/(\d{4}))?\s*(\d+)?\s*(.*)$/;

export function leerExtracto(texto: string): Extracto {
  const lineas = texto.split(/\r?\n/);
  let carrera: string | null = null;
  let plan: number | null = null;
  let promedio: number | null = null;
  let bloque: string | null = null;
  const filas: FilaExtracto[] = [];

  for (const cruda of lineas) {
    const linea = cruda.replace(/\s+$/, '');
    if (!linea.trim()) continue;

    const mc = linea.match(/CARRERA:\s*(.+?)\s*-\s*PLAN\s*(\d{4})/i);
    if (mc) {
      carrera = mc[1].trim();
      plan = Number(mc[2]);
      continue;
    }
    const mp = linea.match(/PROMEDIO:\s*([\d.,]+)/i);
    if (mp) {
      promedio = Number(mp[1].replace(',', '.'));
      continue;
    }
    const mb = linea.match(/^\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]+?)\s*\((COMPLETO|INCOMPLETO)\)\s*$/i);
    if (mb && !/^\s*\d+\)/.test(linea)) {
      bloque = mb[1].trim();
      continue;
    }

    const mf = linea.match(FILA);
    if (!mf) continue;
    const [, num, nombreCrudo, dd, mm, aaaa, acta, resto] = mf;
    const optativa = /\(OPTATIVA\)/i.test(nombreCrudo) || /OPTATIVA/i.test(bloque ?? '');
    const nombre = nombreCrudo.replace(/\(OPTATIVA\)/i, '').trim();

    let puntaje: number | null = null;
    let nota: number | null = null;
    const r = resto.trim();
    const conNota = r.match(/^(?:([\d.,]+)\s+)?([1-5])\s*\(/);
    if (conNota) {
      puntaje = conNota[1] != null ? Number(conNota[1].replace(',', '.')) : null;
      nota = Number(conNota[2]);
    } else if (!/^(APR|C\b)/i.test(r)) {
      continue; // fila que no se entiende: mejor no inventar
    }

    filas.push({
      numero: Number(num),
      nombre,
      fecha: aaaa ? `${aaaa}-${mm}-${dd}` : null,
      acta: acta ?? null,
      puntaje,
      nota,
      bloque,
      optativa,
    });
  }
  return { carrera, plan, filas, promedio };
}

/** Minúsculas, sin tildes, sin signos y sin espacios de más. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROMANOS: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8' };
function tokens(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter((t) => t && !['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'para', 'en', 'a'].includes(t))
    .map((t) => ROMANOS[t] ?? t);
}

/** Parecido entre dos nombres de materia, de 0 a 1 (coincidencia de palabras). */
export function parecido(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(' ') === tb.join(' ')) return 1;
  const sa = new Set(ta);
  const sb = new Set(tb);
  const comunes = [...sa].filter((t) => sb.has(t)).length;
  // Los números (I, II, III) tienen que coincidir: Física I no es Física II.
  const numA = ta.filter((t) => /^\d+$/.test(t)).join();
  const numB = tb.filter((t) => /^\d+$/.test(t)).join();
  if (numA !== numB) return 0;
  return comunes / new Set([...sa, ...sb]).size;
}

export interface Coincidencia<M> {
  fila: FilaExtracto;
  materia: M | null;
  /** 0 a 1. Por debajo de UMBRAL_SEGURO conviene que el estudiante confirme. */
  confianza: number;
}

export const UMBRAL_SEGURO = 0.75;

/**
 * Empareja cada fila del extracto con una materia del plan. Asigna primero
 * los pares más parecidos, así una coincidencia exacta ("Bioquímica") no se
 * la gana una parcial anterior ("Ingeniería Bioquímica").
 */
export function emparejar<M extends { id: string; nombre: string }>(
  filas: FilaExtracto[],
  materias: M[],
): Coincidencia<M>[] {
  const pares: { f: number; m: M; p: number }[] = [];
  filas.forEach((fila, f) => {
    for (const m of materias) {
      const p = parecido(fila.nombre, m.nombre);
      if (p >= 0.5) pares.push({ f, m, p });
    }
  });
  pares.sort((a, b) => b.p - a.p || a.f - b.f);
  const usadas = new Set<string>();
  const elegida = new Map<number, { m: M; p: number }>();
  for (const { f, m, p } of pares) {
    if (elegida.has(f) || usadas.has(m.id)) continue;
    elegida.set(f, { m, p });
    usadas.add(m.id);
  }
  return filas.map((fila, f) => {
    const e = elegida.get(f);
    return e
      ? { fila, materia: e.m, confianza: Math.round(e.p * 100) / 100 }
      : { fila, materia: null, confianza: 0 };
  });
}

export interface IntentoAImportar {
  materia_id: string;
  fecha: string | null;
  nota: number;
}

export interface PlanImportacion {
  /** Finales a cargar: el trigger de la base aprueba la materia con su nota. */
  intentos: IntentoAImportar[];
  /** Materias aprobadas sin nota (APR o "completo"): se marcan aprobadas. */
  aprobadasSinNota: string[];
  /** Filas que ya estaban cargadas y se saltan (reimportar no duplica). */
  repetidas: number;
}

/**
 * Qué cargar a partir de las coincidencias que el estudiante confirmó.
 * `existentes` son sus intentos de final ya guardados y `aprobadas` las
 * materias que ya figuran aprobadas.
 */
export function planDeImportacion(
  confirmadas: { fila: FilaExtracto; materia: { id: string } | null }[],
  existentes: { materia_id: string; fecha: string | null; nota: number }[],
  aprobadas: Set<string>,
): PlanImportacion {
  const clave = (m: string, f: string | null, n: number) => `${m}|${f ?? ''}|${n}`;
  const ya = new Set(existentes.map((e) => clave(e.materia_id, e.fecha, e.nota)));
  const plan: PlanImportacion = { intentos: [], aprobadasSinNota: [], repetidas: 0 };
  for (const { fila, materia } of confirmadas) {
    if (!materia) continue;
    if (fila.nota != null) {
      const k = clave(materia.id, fila.fecha, fila.nota);
      if (ya.has(k)) plan.repetidas++;
      else {
        ya.add(k);
        plan.intentos.push({ materia_id: materia.id, fecha: fila.fecha, nota: fila.nota });
      }
    } else if (aprobadas.has(materia.id) || plan.aprobadasSinNota.includes(materia.id)) {
      plan.repetidas++;
    } else {
      plan.aprobadasSinNota.push(materia.id);
    }
  }
  return plan;
}
