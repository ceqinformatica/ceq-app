import { createElement, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { PaginaOcr } from '../lib/ocr/documento';
import { HTML_OCR } from '../lib/ocr/pagina-ocr';
import { atender, ESPERA_MAXIMA_MS, type MensajeOcr, type Pedido, type ProgresoOcr } from './lector-ocr/comun';

export { textoProgreso, type ProgresoOcr } from './lector-ocr/comun';

/** Igual que en el celular, pero con un iframe invisible en vez de una WebView. */
export function useLectorOcr(): { leer: (bytes: Uint8Array, progreso?: (p: ProgresoOcr) => void) => Promise<PaginaOcr[]>; vista: ReactElement | null } {
  const [activo, setActivo] = useState(0);
  const marco = useRef<HTMLIFrameElement | null>(null);
  const pedido = useRef<Pedido | null>(null);

  const terminar = useCallback(() => {
    if (pedido.current?.reloj) clearTimeout(pedido.current.reloj);
    pedido.current = null;
    setActivo(0);
  }, []);

  const rearmar = useCallback(() => {
    const p = pedido.current;
    if (!p) return;
    if (p.reloj) clearTimeout(p.reloj);
    p.reloj = setTimeout(() => {
      p.mal(new Error('El lector de texto tardó demasiado. Revisá la conexión y probá de nuevo.'));
      terminar();
    }, ESPERA_MAXIMA_MS);
  }, [terminar]);

  useEffect(() => {
    const oir = (e: MessageEvent) => {
      if (!marco.current || e.source !== marco.current.contentWindow) return;
      const m = (e.data as { ocrCeq?: MensajeOcr } | null)?.ocrCeq;
      const p = pedido.current;
      if (!m || !p) return;
      if (m.tipo === 'lista') {
        marco.current.contentWindow?.postMessage({ ocrCeqApp: { tipo: 'bytes', bytes: p.bytes } }, '*');
        return;
      }
      if (atender(m, p, rearmar)) terminar();
    };
    window.addEventListener('message', oir);
    return () => window.removeEventListener('message', oir);
  }, [rearmar, terminar]);

  const leer = useCallback(
    (bytes: Uint8Array, progreso?: (p: ProgresoOcr) => void) =>
      new Promise<PaginaOcr[]>((ok, mal) => {
        pedido.current?.mal(new Error('Se empezó a leer otro PDF.'));
        pedido.current = { bytes, ok, mal, progreso };
        rearmar();
        setActivo((n) => n + 1);
      }),
    [rearmar],
  );

  const vista = activo
    ? createElement('iframe', {
        key: activo,
        ref: marco,
        srcDoc: HTML_OCR,
        title: 'Lector de texto',
        'aria-hidden': true,
        style: { position: 'absolute', width: 1, height: 1, opacity: 0, border: 0, pointerEvents: 'none' },
      })
    : null;

  return { leer, vista };
}
