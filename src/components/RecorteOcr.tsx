import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import type { Zona } from '../lib/ocr/documento';
import { colores, espacio, radio } from '../tema';

/** Página leída con OCR, con su copia chica para mostrar recortes. */
export interface PaginaVista {
  ancho: number;
  alto: number;
  imagen?: string;
}

/** Alto de letra en pantalla al mostrar el recorte (en píxeles). */
const LETRA = 15;

/**
 * Muestra el pedazo del PDF escaneado donde está `zona`, ampliado hasta que
 * se lea, con el renglón marcado. Si el renglón es más ancho que la
 * pantalla, se desliza de costado. Sin imagen (PDF con texto) no muestra nada.
 */
export function RecorteOcr({ paginas, zona, titulo = 'Así está en el PDF' }: { paginas: PaginaVista[] | null; zona: Zona | null | undefined; titulo?: string | null }) {
  const [ancho, setAncho] = useState(0);
  const pagina = zona ? paginas?.[zona.pagina] : undefined;
  if (!zona || !pagina?.imagen) return null;
  const k = Math.min(1, LETRA / Math.max(8, zona.alto));
  // Un poco de aire arriba y abajo, y la fila entera de costado.
  const aire = zona.alto * 1.2;
  const y0 = Math.max(0, zona.y0 - aire);
  const y1 = Math.min(pagina.alto, zona.y1 + aire);
  const x0 = Math.max(0, zona.x0 - aire * 2);
  const x1 = Math.min(pagina.ancho, zona.x1 + aire * 2);
  const visible = Math.max(ancho, 1);
  // Si entra en la pantalla achicándolo un poco (hasta 2/3), se ve entero sin deslizar.
  const escala = (x1 - x0) * k > visible && (x1 - x0) * k * (2 / 3) <= visible ? visible / (x1 - x0) : k;
  return (
    <View style={{ marginBottom: espacio.m }} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {titulo ? <Text style={{ fontSize: 12, color: colores.textoSuave, marginBottom: espacio.xs }}>{titulo}</Text> : null}
      {ancho > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={{ borderRadius: radio.s, borderWidth: 1, borderColor: colores.linea, backgroundColor: '#FFFFFF' }}
          accessibilityLabel="Recorte del PDF"
        >
          <View style={{ width: Math.max(visible - 2, (x1 - x0) * escala), height: (y1 - y0) * escala, overflow: 'hidden' }}>
            <Image
              source={{ uri: pagina.imagen }}
              resizeMode="stretch"
              style={{ position: 'absolute', left: -x0 * escala, top: -y0 * escala, width: pagina.ancho * escala, height: pagina.alto * escala }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: (zona.x0 - x0) * escala - 3,
                top: (zona.y0 - y0) * escala - 3,
                width: (zona.x1 - zona.x0) * escala + 6,
                height: (zona.y1 - zona.y0) * escala + 6,
                borderWidth: 2,
                borderColor: colores.rojo,
                borderRadius: 4,
              }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
