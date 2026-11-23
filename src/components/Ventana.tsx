/**
 * Ventanas flotantes que arma el CEQ desde el panel. `TarjetaVentana` es
 * solo el dibujo (lo usa también la vista previa del panel) y
 * `VentanasDelCeq` decide cuál mostrar y cuándo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecorrido } from '../context/RecorridoProvider';
import { useSesion } from '../context/SesionProvider';
import { cargarVentanasParaMi, guardarVistas, leerVistas } from '../datos/ventanas';
import type { VentanaDb } from '../lib/tipos-db';
import { coloresVentana, elegirVentana, marcarVista, type Vistas } from '../lib/ventanas';
import { espacio, fuentes, radio, sombras } from '../tema';
import type { NombreIcono } from './ui';

type Dibujo = Pick<VentanaDb, 'titulo' | 'cuerpo' | 'imagen_url' | 'icono' | 'boton_texto' | 'boton_destino' | 'color' | 'forma' | 'alineacion' | 'cerrable'>;

/** El cartel en sí. `onBoton`/`onCerrar` vacíos = vista previa. */
export function TarjetaVentana({ v, onBoton, onCerrar, anchoMaximo = 420 }: { v: Dibujo; onBoton?: () => void; onCerrar?: () => void; anchoMaximo?: number }) {
  const { fondo, texto } = coloresVentana(v.color);
  const centro = v.alineacion === 'centro';
  const pantalla = v.forma === 'pantalla';
  // Botón: el contrario del fondo para que resalte.
  const botonFondo = texto;
  const botonTexto = fondo;
  return (
    <View
      style={[
        { backgroundColor: fondo, borderRadius: pantalla ? 0 : radio.xl, padding: espacio.xl, width: '100%', maxWidth: pantalla ? undefined : anchoMaximo, ...sombras.media },
        v.forma === 'abajo' && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
        pantalla && { flex: 1, justifyContent: 'center' },
      ]}
      accessibilityViewIsModal
    >
      {v.cerrable && (
        <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={12} style={{ position: 'absolute', top: espacio.m, right: espacio.m, zIndex: 2, padding: 4 }}>
          <Ionicons name="close" size={22} color={texto} />
        </Pressable>
      )}
      {v.imagen_url ? (
        <Image source={{ uri: v.imagen_url }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radio.l, marginBottom: espacio.l }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : v.icono ? (
        <View style={{ alignSelf: centro ? 'center' : 'flex-start', width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m }}>
          <Ionicons name={v.icono as NombreIcono} size={30} color={texto} />
        </View>
      ) : null}
      <Text style={{ fontFamily: fuentes.bold, fontSize: pantalla ? 26 : 20, lineHeight: pantalla ? 32 : 26, color: texto, textAlign: centro ? 'center' : 'left', paddingRight: v.cerrable && !centro ? 28 : 0, paddingHorizontal: v.cerrable && centro ? 24 : 0 }}>
        {v.titulo || 'Título'}
      </Text>
      {v.cuerpo ? (
        <Text style={{ fontFamily: fuentes.regular, fontSize: 15, lineHeight: 22, color: texto, opacity: 0.92, marginTop: espacio.s, textAlign: centro ? 'center' : 'left' }}>{v.cuerpo}</Text>
      ) : null}
      {v.boton_texto ? (
        <Pressable
          onPress={onBoton}
          accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: espacio.l, backgroundColor: botonFondo, borderRadius: radio.pill, paddingVertical: 12, paddingHorizontal: espacio.xl, alignSelf: centro ? 'center' : 'flex-start', opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: botonTexto }}>{v.boton_texto}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Abre el destino del botón: una pantalla de la app o una página web. */
export function abrirDestino(destino: string | null) {
  if (!destino) return;
  if (destino.startsWith('https://')) WebBrowser.openBrowserAsync(destino).catch(() => {});
  else router.push(destino as never);
}

/** Muestra (sobre todas las pestañas) la ventana que toque, una a la vez. */
export function VentanasDelCeq() {
  const { sesion, perfil } = useSesion();
  // Mientras corre el recorrido de bienvenida no se tapa con otra ventana.
  const { activo: recorrido } = useRecorrido();
  const uid = sesion?.user.id ?? null;
  const ruta = usePathname();
  const enInicio = ruta === '/' || ruta === '/index';
  const [lista, setLista] = useState<VentanaDb[]>([]);
  const [vistas, setVistas] = useState<Vistas | null>(null);
  const [actual, setActual] = useState<VentanaDb | null>(null);
  const enEstaSesion = useRef(new Set<string>());
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!uid) return;
    let activo = true;
    Promise.all([cargarVentanasParaMi().catch(() => [] as VentanaDb[]), leerVistas(uid)]).then(([l, v]) => {
      if (!activo) return;
      setLista(l);
      setVistas(v);
    });
    return () => {
      activo = false;
    };
  }, [uid]);

  useEffect(() => {
    if (actual || recorrido || !vistas || !lista.length) return;
    // Un momento después de llegar a la pantalla (y después de que el
    // recorrido de bienvenida decida si se abre), para no tapar nada.
    const t = setTimeout(() => setActual(elegirVentana(lista, vistas, new Date(), enEstaSesion.current, enInicio, perfil?.carrera_id)), 1500);
    return () => clearTimeout(t);
  }, [lista, vistas, enInicio, actual, recorrido, perfil?.carrera_id]);

  const cerrar = (luego?: () => void) => {
    if (!actual || !uid || !vistas) return;
    enEstaSesion.current.add(actual.id);
    const nuevas = marcarVista(vistas, actual, new Date());
    setVistas(nuevas);
    guardarVistas(uid, nuevas);
    setActual(null);
    luego?.();
  };

  if (!actual || recorrido) return null;
  const v = actual;
  const pantalla = v.forma === 'pantalla';
  return (
    <Modal
      visible
      transparent
      animationType={v.forma === 'abajo' ? 'slide' : 'fade'}
      onRequestClose={() => (v.cerrable ? cerrar() : undefined)}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14, 58, 85, 0.55)' }]} />
      {v.cerrable && !pantalla && <Pressable style={StyleSheet.absoluteFill} onPress={() => cerrar()} accessibilityLabel="Cerrar" />}
      <View
        pointerEvents="box-none"
        style={{
          flex: 1,
          justifyContent: v.forma === 'abajo' ? 'flex-end' : 'center',
          alignItems: 'center',
          padding: pantalla || v.forma === 'abajo' ? 0 : espacio.xl,
          paddingTop: pantalla ? 0 : insets.top + espacio.l,
        }}
      >
        <ScrollView
          style={{ width: '100%', maxWidth: pantalla || v.forma === 'abajo' ? undefined : Math.min(440, width - espacio.xl * 2), flexGrow: pantalla ? 1 : 0 }}
          contentContainerStyle={{ flexGrow: pantalla ? 1 : 0, alignItems: 'center' }}
          bounces={false}
        >
          <View style={{ width: '100%', alignItems: 'center', flexGrow: pantalla ? 1 : 0, paddingTop: pantalla ? insets.top : 0, paddingBottom: v.forma === 'abajo' || pantalla ? insets.bottom : 0, backgroundColor: pantalla || v.forma === 'abajo' ? coloresVentana(v.color).fondo : 'transparent', borderTopLeftRadius: v.forma === 'abajo' ? radio.xl : 0, borderTopRightRadius: v.forma === 'abajo' ? radio.xl : 0 }}>
            <TarjetaVentana
              v={{ ...v, forma: pantalla ? 'pantalla' : v.forma }}
              anchoMaximo={v.forma === 'abajo' ? 640 : 440}
              onCerrar={() => cerrar()}
              onBoton={() => cerrar(() => abrirDestino(v.boton_destino))}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
