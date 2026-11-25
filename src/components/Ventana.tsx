/**
 * Ventanas flotantes que arma el CEQ desde el panel. `TarjetaVentana` es
 * solo el dibujo (lo usa también la vista previa del panel) y
 * `VentanasDelCeq` decide cuál mostrar y cuándo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecorrido } from '../context/RecorridoProvider';
import { useSesion } from '../context/SesionProvider';
import { cargarVentanasParaMi, guardarVistas, leerVistas } from '../datos/ventanas';
import type { VentanaDb } from '../lib/tipos-db';
import { cierraTocandoAfuera, coloresVentana, elegirVentana, esColorTema, marcarVista, type Vistas } from '../lib/ventanas';
import { useTema } from '../context/TemaProvider';
import { useEntradaFlotante } from './movimiento';
import { espacio, fuentes, radio, sombras } from '../tema';
import type { NombreIcono } from './ui';

type Dibujo = Pick<VentanaDb, 'titulo' | 'cuerpo' | 'imagen_url' | 'icono' | 'boton_texto' | 'boton_destino' | 'color' | 'forma' | 'alineacion' | 'cerrable'>;

/**
 * El cartel en sí. Siempre lleva la cruz para cerrar; `cerrable` solo dice
 * si además se cierra tocando afuera. `onBoton`/`onCerrar` vacíos = vista previa. `oscuro`
 * fuerza un modo (para mostrar las dos versiones en el panel); si no, usa
 * el tema de quien lo ve.
 */
export function TarjetaVentana({ v, onBoton, onCerrar, anchoMaximo = 420, oscuro }: { v: Dibujo; onBoton?: () => void; onCerrar?: () => void; anchoMaximo?: number; oscuro?: boolean }) {
  const tema = useTema();
  const c = coloresVentana(v.color, oscuro ?? tema.oscuro);
  const centro = v.alineacion === 'centro';
  const pantalla = v.forma === 'pantalla';
  const abajo = v.forma === 'abajo';
  // En modo oscuro, una ventana "según el tema" lleva un borde finito para despegarse del velo.
  const borde = esColorTema(v.color) && (oscuro ?? tema.oscuro) && !pantalla;
  return (
    <View
      style={[
        { backgroundColor: c.fondo, borderRadius: pantalla ? 0 : radio.xl + 4, paddingHorizontal: espacio.xl, paddingTop: espacio.xl + espacio.s, paddingBottom: espacio.xl, width: '100%', maxWidth: pantalla ? undefined : anchoMaximo },
        !pantalla && sombras.media,
        borde && { borderWidth: 1, borderColor: 'rgba(157, 191, 242, 0.18)' },
        abajo && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
        pantalla && { flex: 1, justifyContent: 'center' },
      ]}
      accessibilityViewIsModal
    >
      {abajo && <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.burbuja, marginTop: -espacio.m, marginBottom: espacio.m }} />}
      <Pressable
        onPress={onCerrar}
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        hitSlop={10}
        style={({ pressed }) => ({ position: 'absolute', top: espacio.m, right: espacio.m, zIndex: 2, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.burbuja, opacity: pressed ? 0.7 : 1 })}
      >
        <Ionicons name="close" size={20} color={c.texto} />
      </Pressable>
      {v.imagen_url ? (
        <Image source={{ uri: v.imagen_url }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radio.l, marginBottom: espacio.l, marginTop: espacio.l }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : v.icono ? (
        <View style={{ alignSelf: centro ? 'center' : 'flex-start', width: 64, height: 64, borderRadius: 32, backgroundColor: c.burbuja, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.l }}>
          <Ionicons name={v.icono as NombreIcono} size={32} color={c.icono} />
        </View>
      ) : null}
      <Text style={{ fontFamily: fuentes.bold, fontSize: pantalla ? 26 : 21, lineHeight: pantalla ? 32 : 27, letterSpacing: -0.2, color: c.texto, textAlign: centro ? 'center' : 'left', paddingLeft: centro ? 36 : 0, paddingRight: 36 }}>
        {v.titulo || 'Título'}
      </Text>
      {v.cuerpo ? (
        <Text style={{ fontFamily: fuentes.regular, fontSize: 15, lineHeight: 22, color: c.suave, opacity: c.suave === c.texto ? 0.9 : 1, marginTop: espacio.s, textAlign: centro ? 'center' : 'left' }}>{v.cuerpo}</Text>
      ) : null}
      {v.boton_texto ? (
        <Pressable
          onPress={onBoton}
          accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: espacio.xl, backgroundColor: c.boton, borderRadius: radio.pill, paddingVertical: 14, paddingHorizontal: espacio.xl, alignItems: 'center', alignSelf: 'stretch', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: c.textoBoton }}>{v.boton_texto}</Text>
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
  const { oscuro } = useTema();
  // Mientras corre el recorrido de bienvenida no se tapa con otra ventana.
  const { activo: recorrido } = useRecorrido();
  const uid = sesion?.user.id ?? null;
  const ruta = usePathname();
  const enInicio = ruta === '/' || ruta === '/index';
  const [lista, setLista] = useState<VentanaDb[]>([]);
  const [vistas, setVistas] = useState<Vistas | null>(null);
  const [actual, setActual] = useState<VentanaDb | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const luego = useRef<(() => void) | null>(null);
  // Cuándo apareció la ventana actual: los toques afuera del primer momento no la cierran.
  const aparecio = useRef(0);
  const enEstaSesion = useRef(new Set<string>());
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { montado, progreso } = useEntradaFlotante(Boolean(actual) && !recorrido && !cerrando);

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

  useLayoutEffect(() => {
    if (actual && montado) aparecio.current = Date.now();
  }, [actual, montado]);

  // Terminó la animación de salida: se suelta la ventana y se abre el destino del botón.
  useEffect(() => {
    if (montado || !cerrando) return;
    setActual(null);
    setCerrando(false);
    const f = luego.current;
    luego.current = null;
    f?.();
  }, [montado, cerrando]);

  const cerrar = (despues?: () => void) => {
    if (!actual || !uid || !vistas || cerrando) return;
    enEstaSesion.current.add(actual.id);
    const nuevas = marcarVista(vistas, actual, new Date());
    setVistas(nuevas);
    guardarVistas(uid, nuevas);
    luego.current = despues ?? null;
    aparecio.current = Number.MAX_SAFE_INTEGER;
    setCerrando(true);
  };

  if (!actual || !montado) return null;
  const v = actual;
  const cerrarDeAfuera = () => {
    if (cierraTocandoAfuera(v, Date.now() - aparecio.current)) cerrar();
  };
  const pantalla = v.forma === 'pantalla';
  const abajo = v.forma === 'abajo';
  const c = coloresVentana(v.color, oscuro);
  const opacidad = progreso.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  // Al centro: crece un poco y sube. Desde abajo: sube desde el borde. Pantalla completa: se funde.
  const movimiento = abajo
    ? [{ translateY: progreso.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }]
    : pantalla
      ? [{ scale: progreso.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }]
      : [{ translateY: progreso.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: progreso.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }];
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={cerrarDeAfuera}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.velo, opacity: opacidad }]} />
      {v.cerrable && !pantalla && <Pressable style={StyleSheet.absoluteFill} onPress={cerrarDeAfuera} accessible={false} />}
      <View
        pointerEvents="box-none"
        style={{
          flex: 1,
          justifyContent: abajo ? 'flex-end' : 'center',
          alignItems: 'center',
          padding: pantalla || abajo ? 0 : espacio.xl,
          paddingTop: pantalla || abajo ? 0 : insets.top + espacio.l,
        }}
      >
        <Animated.View
          pointerEvents={cerrando ? 'none' : 'box-none'}
          style={{ width: '100%', alignItems: 'center', flex: pantalla ? 1 : undefined, maxHeight: abajo ? height - insets.top - espacio.xl : undefined, opacity: abajo ? 1 : opacidad, transform: movimiento }}
        >
          <ScrollView
            style={{ width: '100%', maxWidth: pantalla || abajo ? undefined : Math.min(440, width - espacio.xl * 2), flexGrow: pantalla ? 1 : 0 }}
            contentContainerStyle={{ flexGrow: pantalla ? 1 : 0, alignItems: 'center' }}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ width: '100%', alignItems: 'center', flexGrow: pantalla ? 1 : 0, paddingTop: pantalla ? insets.top : 0, paddingBottom: abajo || pantalla ? insets.bottom : 0, backgroundColor: pantalla || abajo ? c.fondo : 'transparent', borderTopLeftRadius: abajo ? radio.xl + 4 : 0, borderTopRightRadius: abajo ? radio.xl + 4 : 0 }}>
              <TarjetaVentana
                v={{ ...v, forma: pantalla ? 'pantalla' : v.forma }}
                anchoMaximo={abajo ? 640 : 440}
                onCerrar={() => cerrar()}
                onBoton={() => cerrar(() => abrirDestino(v.boton_destino))}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
