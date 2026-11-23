/**
 * Mensajes de error para mostrar: los fallos de red y los errores técnicos
 * de la base (en inglés) se pasan a un texto claro en castellano. Los
 * mensajes propios de la base (los "raise exception" en castellano) quedan
 * como están. Sin dependencias, para probarlo con node --test.
 */

export const SIN_CONEXION = 'Sin conexión a internet. Revisá tu conexión y probá de nuevo.';

const RED = /network request failed|failed to fetch|networkerror|network error|load failed|timed? ?out|timeout|aborted|econn|enotfound|internet connection appears to be offline|could not connect/i;

const TECNICOS: [RegExp, string][] = [
  [/row-level security|permission denied|not authorized/i, 'No tenés permiso para hacer esto. Si recién entraste, cerrá sesión y volvé a entrar.'],
  [/duplicate key|already exists/i, 'Eso ya estaba cargado.'],
  [/violates foreign key/i, 'Falta un dato relacionado. Actualizá la pantalla y probá de nuevo.'],
  [/violates check constraint|invalid input syntax|out of range/i, 'Algún dato no es válido. Revisalo y probá de nuevo.'],
];

/** true si el error es por falta de internet o el servidor no respondió. */
export function esErrorDeRed(e: unknown): boolean {
  const m = textoCrudo(e);
  return m !== '' && RED.test(m);
}

function textoCrudo(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message;
  return '';
}

/** Texto para mostrar a la persona. */
export function textoError(e: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  const m = textoCrudo(e).trim();
  if (!m) return porDefecto;
  if (RED.test(m)) return SIN_CONEXION;
  // "jwt expired" antes que el genérico de permisos.
  if (/jwt expired|invalid jwt|refresh token/i.test(m)) return 'Tu sesión venció. Cerrá sesión y volvé a entrar.';
  for (const [re, texto] of TECNICOS) if (re.test(m)) return texto;
  return m;
}

/** Para las consultas de Supabase: si hay error, lo lanza con un texto claro. */
export function lanzar(error: { message: string } | null | undefined) {
  if (error) throw new Error(textoError(error));
}
