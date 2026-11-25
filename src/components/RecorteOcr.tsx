import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import type { Zona } from '../lib/ocr/documento';
import { colores, espacio, fondos, radio } from '../tema';

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
  const [entera, setEntera] = useState(false);
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
      {ancho > 0 && (
        <Pressable onPress={() => setEntera((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: entera }} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.xs, marginTop: espacio.xs, alignSelf: 'flex-start', paddingVertical: espacio.xs }}>
          <Ionicons name={entera ? 'contract-outline' : 'expand-outline'} size={14} color={colores.marino} />
          <Text style={{ fontSize: 13, color: colores.marino, fontWeight: '600' }}>{entera ? 'Ocultar la página' : `Ver la página ${zona.pagina + 1} entera`}</Text>
        </Pressable>
      )}
      {entera && ancho > 0 && <PaginaEntera pagina={pagina} zona={zona} escala={k} alto={Math.min(460, pagina.alto * k)} />}
    </View>
  );
}

/** La página entera, a tamaño de lectura, para recorrerla en las dos direcciones; el renglón queda marcado. */
function PaginaEntera({ pagina, zona, escala, alto }: { pagina: PaginaVista; zona: Zona; escala: number; alto: number }) {
  const w = pagina.ancho * escala;
  const h = pagina.alto * escala;
  const vertical = useRef<ScrollViewInstance>(null);
  const horizontal = useRef<ScrollViewInstance>(null);
  // Se abre mostrando el renglón marcado (contentOffset no anda en la web).
  const ubicado = useRef(false);
  const ir = () => {
    if (ubicado.current) return;
    ubicado.current = true;
    vertical.current?.scrollTo({ y: Math.max(0, zona.y0 * escala - alto / 3), animated: false });
    horizontal.current?.scrollTo({ x: Math.max(0, zona.x0 * escala - 40), animated: false });
  };
  return (
    <ScrollView
      ref={vertical}
      nestedScrollEnabled
      onContentSizeChange={ir}
      style={{ height: alto, marginTop: espacio.xs, borderRadius: radio.s, borderWidth: 1, borderColor: colores.linea, backgroundColor: '#FFFFFF' }}
    >
      <ScrollView ref={horizontal} horizontal nestedScrollEnabled onContentSizeChange={ir}>
        <View style={{ width: w, height: h }}>
          <Image source={{ uri: pagina.imagen }} resizeMode="stretch" style={{ width: w, height: h }} accessibilityLabel={`Página ${zona.pagina + 1} del PDF`} />
          <View pointerEvents="none" style={{ position: 'absolute', left: zona.x0 * escala - 3, top: zona.y0 * escala - 3, width: (zona.x1 - zona.x0) * escala + 6, height: (zona.y1 - zona.y0) * escala + 6, borderWidth: 2, borderColor: colores.rojo, borderRadius: 4 }} />
        </View>
      </ScrollView>
    </ScrollView>
  );
}

/** Una cosa para revisar: el motivo, la página del PDF donde está y lo que haga falta para corregirla. */
export function ItemRevision({ motivo, pagina, ultima, children }: { motivo: string; pagina?: number | null; ultima: boolean; children: ReactNode }) {
  return (
    <View style={{ paddingVertical: espacio.s, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: colores.linea }}>
      <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'flex-start' }}>
        <Ionicons name="alert-circle" size={16} color={colores.rojo} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colores.texto }}>{motivo}</Text>
        {pagina != null ? (
          <View style={{ paddingHorizontal: espacio.s, paddingVertical: 2, borderRadius: radio.pill, backgroundColor: fondos.grisFondo }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colores.marino }}>Página {pagina + 1}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}
