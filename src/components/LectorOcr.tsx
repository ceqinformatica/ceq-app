import { useCallback, useRef, useState, type ComponentType, type ReactElement, type Ref } from 'react';
import type { ViewStyle } from 'react-native';
import { WebView as WebViewOriginal, type WebViewMessageEvent } from 'react-native-webview';
import type { PaginaOcr } from '../lib/ocr/documento';
import { HTML_OCR } from '../lib/ocr/pagina-ocr';
import { aBase64, atender, ESPERA_MAXIMA_MS, type MensajeOcr, type Pedido, type ProgresoOcr } from './lector-ocr/comun';

export { textoProgreso, type ProgresoOcr } from './lector-ocr/comun';

/** Lo que usamos de la WebView (sus tipos chocan con los de esta versión de React Native). */
type WebView = { injectJavaScript: (js: string) => void };
const WebView = WebViewOriginal as unknown as ComponentType<{
  ref?: Ref<WebView>;
  source: { html: string; baseUrl?: string };
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  onMessage?: (e: WebViewMessageEvent) => void;
  onError?: () => void;
  onShouldStartLoadWithRequest?: (r: { url: string }) => boolean;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
}>;

/** Tamaño de cada trozo del PDF que se le pasa a la WebView. */
const TROZO = 512 * 1024;

/**
 * Lector de PDF escaneados. Devuelve `vista`, que la pantalla tiene que
 * dibujar (es una WebView invisible que solo existe mientras lee), y
 * `leer`, que devuelve las palabras de cada página.
 */
export function useLectorOcr(): { leer: (bytes: Uint8Array, progreso?: (p: ProgresoOcr) => void) => Promise<PaginaOcr[]>; vista: ReactElement | null } {
  const [activo, setActivo] = useState(0);
  const ref = useRef<WebView>(null);
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
      // Solo se corta si sigue siendo el pedido en curso.
      if (pedido.current === p) terminar();
    }, ESPERA_MAXIMA_MS);
  }, [terminar]);

  const leer = useCallback(
    (bytes: Uint8Array, progreso?: (p: ProgresoOcr) => void) =>
      new Promise<PaginaOcr[]>((ok, mal) => {
        const anterior = pedido.current;
        if (anterior) {
          if (anterior.reloj) clearTimeout(anterior.reloj);
          anterior.mal(new Error('Se empezó a leer otro PDF.'));
        }
        pedido.current = { bytes, ok, mal, progreso };
        rearmar();
        setActivo((n) => n + 1);
      }),
    [rearmar],
  );

  const enviarPdf = () => {
    const p = pedido.current;
    if (!p || !ref.current) return;
    const b64 = aBase64(p.bytes);
    for (let i = 0; i < b64.length; i += TROZO) {
      const m = { tipo: i === 0 ? 'pdf' : 'trozo', base64: b64.slice(i, i + TROZO) };
      ref.current.injectJavaScript(`window.recibirOcr(${JSON.stringify(m)});true;`);
    }
    ref.current.injectJavaScript(`window.recibirOcr({tipo:'leer'});true;`);
  };

  const alMensaje = (e: WebViewMessageEvent) => {
    let m: MensajeOcr;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    const p = pedido.current;
    if (!p) return;
    if (m.tipo === 'lista') return enviarPdf();
    if (atender(m, p, rearmar)) terminar();
  };

  const vista = activo ? (
    <WebView
      key={activo}
      ref={ref}
      source={{ html: HTML_OCR, baseUrl: 'https://ceq-app.local/' }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      onMessage={alMensaje}
      // No navega a ningún lado: solo la página del lector.
      onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('https://ceq-app.local/')}
      onError={() => {
        pedido.current?.mal(new Error('No se pudo abrir el lector de texto.'));
        terminar();
      }}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      containerStyle={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
    />
  ) : null;

  return { leer, vista };
}
