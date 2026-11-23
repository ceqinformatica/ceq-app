/**
 * Serialización de lo que se guarda para usar la app sin internet.
 * JSON no sabe guardar Map ni Set (la malla y la agenda los usan), así que
 * se marcan y se reconstruyen al leer. Sin dependencias, para node --test.
 */

const MAPA = '__ceqMap';
const CONJUNTO = '__ceqSet';

export function serializar(valor: unknown): string {
  return JSON.stringify(valor, function (this: unknown, _k, v) {
    if (v instanceof Map) return { [MAPA]: [...v.entries()] };
    if (v instanceof Set) return { [CONJUNTO]: [...v.values()] };
    return v;
  });
}

export function deserializar<T>(texto: string): T {
  return JSON.parse(texto, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (MAPA in v && Object.keys(v).length === 1) return new Map(v[MAPA]);
      if (CONJUNTO in v && Object.keys(v).length === 1) return new Set(v[CONJUNTO]);
    }
    return v;
  }) as T;
}

/** Prefijo de todas las claves guardadas (para borrarlas al cerrar sesión). */
export const PREFIJO_CACHE = 'ceq.cache.v1:';

export function claveCache(uid: string, clave: string) {
  return `${PREFIJO_CACHE}${uid}:${clave}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "hoy 14:05", "ayer 09:30" o "12 nov 18:00". */
export function cuandoSeGuardo(ms: number, ahora = new Date()): string {
  const f = new Date(ms);
  const hora = `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(f)) / 86400000);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  return `${f.getDate()} ${MESES[f.getMonth()]} ${hora}`;
}

/** Texto para cuando no hay internet y se muestra lo guardado. */
export function avisoSinConexion(ms: number, ahora = new Date()) {
  return `Sin conexión. Te mostramos lo guardado ${cuandoSeGuardo(ms, ahora)}.`;
}
