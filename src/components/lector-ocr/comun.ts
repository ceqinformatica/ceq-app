import type { PaginaOcr } from '../../lib/ocr/documento';

export interface ProgresoOcr {
  fase: 'preparando' | 'leyendo';
  pagina: number;
  paginas: number;
}

/** Texto para mostrar mientras lee ("Leyendo la página 2 de 5…"). */
export function textoProgreso(p: ProgresoOcr | null): string {
  if (!p || p.fase === 'preparando' || !p.paginas) return 'Preparando el lector de texto…';
  return p.paginas > 1 ? `Leyendo la página ${p.pagina} de ${p.paginas}…` : 'Leyendo la página…';
}

export type MensajeOcr =
  | { tipo: 'lista' }
  | ({ tipo: 'progreso' } & ProgresoOcr)
  | { tipo: 'resultado'; paginas: PaginaOcr[]; total: number }
  | { tipo: 'error'; mensaje: string };

export interface Pedido {
  bytes: Uint8Array;
  ok: (p: PaginaOcr[]) => void;
  mal: (e: Error) => void;
  progreso?: (p: ProgresoOcr) => void;
  reloj?: ReturnType<typeof setTimeout>;
}

/** Sin noticias del lector en este tiempo, se da por colgado. */
export const ESPERA_MAXIMA_MS = 120_000;

/**
 * Atiende un mensaje del lector para el pedido en curso. Devuelve true si el
 * pedido terminó (bien o mal).
 */
export function atender(m: MensajeOcr, pedido: Pedido, rearmar: () => void): boolean {
  switch (m.tipo) {
    case 'progreso':
      rearmar();
      pedido.progreso?.({ fase: m.fase, pagina: m.pagina, paginas: m.paginas });
      return false;
    case 'resultado':
      pedido.ok(m.paginas);
      return true;
    case 'error':
      pedido.mal(new Error(traducirError(m.mensaje)));
      return true;
    default:
      return false;
  }
}

function traducirError(m: string): string {
  if (/fetch|network|load|import|descargar/i.test(m)) return 'No se pudo descargar el lector de texto. Revisá la conexión a internet y probá de nuevo.';
  if (/password|encrypt/i.test(m)) return 'El PDF tiene contraseña: no se puede leer.';
  if (/Invalid PDF|InvalidPDF|structure/i.test(m)) return 'El archivo no parece un PDF válido.';
  if (/memory|memoria/i.test(m)) return 'El PDF es muy pesado para este dispositivo. Probá desde una computadora.';
  return `No se pudo leer el PDF escaneado (${m.slice(0, 120)}).`;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes → base64 sin depender de btoa ni de Buffer (Hermes). */
export function aBase64(b: Uint8Array): string {
  const partes: string[] = [];
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    if (s.length >= 0x4000) {
      partes.push(s);
      s = '';
    }
  }
  partes.push(s);
  return partes.join('');
}
