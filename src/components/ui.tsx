import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { isValidElement, useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, useWindowDimensions, View, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '../context/TemaProvider';
import { useDisposicion } from './disposicion';
import { Aparecer, NumeroAnimado, PressableAnimado, useAparecer, usePresion, vibrar } from './movimiento';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras, texto } from '../tema';

/**
 * Deja lugar al teclado para que no tape lo que se escribe.
 *
 * - iOS: KeyboardAvoidingView con padding (la ventana nunca se achica sola).
 * - Android: la app va de borde a borde y, según la versión y si es un Modal,
 *   la ventana puede achicarse sola o no. En vez de adivinar, se mide cuánto
 *   del contenedor queda realmente debajo del teclado y solo eso se rellena:
 *   si la ventana ya se achicó, el hueco da 0 y no se evita dos veces.
 * - Web: nada.
 */
export function EvitaTeclado({ children, estilo }: { children: ReactNode; estilo?: ViewStyle }) {
  if (Platform.OS === 'ios') return <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, estilo]}>{children}</KeyboardAvoidingView>;
  if (Platform.OS === 'android') return <HuecoTecladoAndroid estilo={estilo}>{children}</HuecoTecladoAndroid>;
  return <View style={[{ flex: 1 }, estilo]}>{children}</View>;
}

function HuecoTecladoAndroid({ children, estilo }: { children: ReactNode; estilo?: ViewStyle }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const arribaTeclado = useRef<number | null>(null);
  const [hueco, setHueco] = useState(0);
  const medir = useCallback(() => {
    const tope = arribaTeclado.current;
    if (tope == null) {
      setHueco(0);
      return;
    }
    ref.current?.measureInWindow((_x: number, y: number, _w: number, alto: number) => {
      if (alto > 0) setHueco(Math.max(0, Math.round(y + alto - tope)));
    });
  }, []);
  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) => {
      arribaTeclado.current = e.endCoordinates.screenY;
      medir();
      setTimeout(medir, 120); // por si la ventana se achica un instante después
    });
    const ocultar = Keyboard.addListener('keyboardDidHide', () => {
      arribaTeclado.current = null;
      setHueco(0);
    });
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, [medir]);
  return (
    <View ref={ref} onLayout={medir} style={[{ flex: 1 }, estilo, { paddingBottom: hueco }]}>
      {children}
    </View>
  );
}

export const logoCeq = require('../../assets/logo-ceq.png');
export type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ */
/* Estructura de pantalla                                              */
/* ------------------------------------------------------------------ */

/**
 * Contenedor de cada pantalla. Con una `CabeceraMarca`, la barra "Portal CEQ"
 * queda fija arriba y el título se desplaza con el contenido.
 */
export function Pantalla({ children, scroll = true, estilo, cabecera, refrescando, onRefrescar }: {
  children: ReactNode; scroll?: boolean; estilo?: ViewStyle; cabecera?: ReactNode;
  refrescando?: boolean; onRefrescar?: () => void;
}) {
  const { anchoMaximo } = useDisposicion();
  const ancho = anchoMaximo ? { width: '100%' as const, maxWidth: anchoMaximo, alignSelf: 'center' as const } : null;
  const contenido = <View style={[s.contenido, ancho, cabecera ? { paddingTop: 0 } : null, estilo]}>{children}</View>;
  // Con CabeceraMarca, la barra "Portal CEQ" queda fija arriba y el resto se desplaza.
  const marca = isValidElement<ComponentProps<typeof CabeceraMarca>>(cabecera) && cabecera.type === CabeceraMarca ? cabecera.props : null;
  const barra = marca ? <BarraPortal derecha={marca.derecha} sinPerfil={marca.sinPerfil} /> : null;
  const refresh = onRefrescar ? (
    <RefreshControl refreshing={Boolean(refrescando)} onRefresh={onRefrescar} tintColor={colores.marino} colors={[colores.marino]} />
  ) : undefined;
  // Entrada suave de cada pantalla (se salta con "Reducir movimiento").
  const { opacity, translateY } = useAparecer(0, 12);
  const cuerpo = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      refreshControl={refresh}
      showsVerticalScrollIndicator={false}
    >
      {cabecera}
      {contenido}
    </ScrollView>
  ) : (
    <>
      {cabecera}
      {contenido}
    </>
  );
  return (
    <EvitaTeclado estilo={s.pantalla}>
    <SafeAreaView style={[s.pantalla, marca && { backgroundColor: fondos.franja }]} edges={marca ? ['left', 'right'] : ['top', 'left', 'right']}>
      {barra}
      {/* Con barra fija, el contenido va en una hoja de esquinas redondeadas que recorta lo que se desplaza por debajo. */}
      <Animated.View style={[{ flex: 1, opacity, transform: [{ translateY }] }, marca && s.hojaContenido]}>
        {cuerpo}
      </Animated.View>
    </SafeAreaView>
    </EvitaTeclado>
  );
}

/**
 * Barra superior "Portal CEQ": logo, nombre y botones (perfil y los de cada pantalla).
 * Pantalla la deja fija arriba cuando la pantalla usa CabeceraMarca.
 */
export function BarraPortal({ derecha, sinPerfil }: { derecha?: ReactNode; sinPerfil?: boolean }) {
  const insets = useSafeAreaInsets();
  const { anchoMaximo } = useDisposicion();
  useBarraEstado('dark');
  const ancho = anchoMaximo ? { width: '100%' as const, maxWidth: anchoMaximo, alignSelf: 'center' as const } : null;
  return (
    <View style={s.cabecera}>
      <View style={[s.cabeceraBarra, { paddingTop: insets.top + espacio.s }, ancho]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, flexShrink: 1 }}>
          <View style={s.cabeceraLogo}>
            <Image source={logoCeq} style={{ width: 24, height: 24 }} accessibilityLabel="Logo del CEQ" />
          </View>
          <Text style={s.cabeceraMarca} numberOfLines={1}>Portal CEQ</Text>
          <Text style={s.cabeceraMarcaSub} numberOfLines={1}>FCQ · UNA</Text>
        </View>
        {derecha || !sinPerfil ? (
          <View style={s.cabeceraAcciones}>
            {derecha}
            {derecha && !sinPerfil ? <View style={s.cabeceraSeparador} /> : null}
            {!sinPerfil ? <BotonIcono icono="person-circle-outline" etiqueta="Abrir mi perfil" plano tamano={26} onPress={() => router.push('/perfil')} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Título grande de cada pantalla, sobre el fondo claro con la burbuja.
 * `derecha` y `sinPerfil` van a la barra "Portal CEQ" (que Pantalla deja fija arriba).
 */
export function CabeceraMarca({ titulo, sub, children, compacta, sinConexion }: {
  titulo?: string; sub?: string; derecha?: ReactNode; children?: ReactNode; compacta?: boolean;
  /** Texto del aviso "Sin conexión" (se muestra lo guardado). */
  sinConexion?: string | null;
  /** Oculta el botón de perfil (pantallas sin sesión, como el alta, o el propio perfil). */
  sinPerfil?: boolean;
}) {
  const { anchoMaximo } = useDisposicion();
  const ancho = anchoMaximo ? { width: '100%' as const, maxWidth: anchoMaximo, alignSelf: 'center' as const } : null;
  return (
    <View>
      <View style={[s.cabeceraCuerpo, { paddingBottom: compacta ? espacio.xl + espacio.s : espacio.xxl + espacio.m }]}>
        <View style={s.cabeceraBurbuja} pointerEvents="none" />
        <View style={ancho}>
          {titulo ? <Text style={s.cabeceraTitulo} accessibilityRole="header">{titulo}</Text> : null}
          <Aparecer distancia={10}>
            {sub ? <Text style={s.cabeceraSub}>{sub}</Text> : null}
            {children}
          </Aparecer>
          {sinConexion ? (
            <View style={s.pildoraSinConexion} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={15} color={colores.marino} />
              <Text style={s.pildoraSinConexionTexto}>{sinConexion}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Íconos de la barra de estado claros u oscuros según la pantalla enfocada.
 * 'dark' significa "sobre fondo claro": en el modo oscuro el fondo es oscuro
 * y los íconos van claros.
 */
export function useBarraEstado(estilo: 'light' | 'dark') {
  const { oscuro } = useTema();
  const efectivo = oscuro ? 'light' : estilo;
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(efectivo, true);
    }, [efectivo]),
  );
}

/** Barra superior clara: logo hexagonal + "Portal CEQ" en marino. */
export function Encabezado({ derecha }: { derecha?: ReactNode }) {
  return (
    <View style={s.encabezado}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
        <Image source={logoCeq} style={{ width: 36, height: 36 }} accessibilityLabel="Logo del CEQ" />
        <Text style={s.marca}>Portal CEQ</Text>
      </View>
      {derecha}
    </View>
  );
}

/** Barra de pantallas internas: volver + título. */
export function BarraSuperior({ titulo, onVolver, derecha }: { titulo: string; onVolver?: () => void; derecha?: ReactNode }) {
  useBarraEstado('dark');
  return (
    <View style={s.barraSuperior}>
      {onVolver ? <BotonIcono icono="chevron-back" etiqueta="Volver" onPress={onVolver} /> : <View style={{ width: 40 }} />}
      <Text style={s.barraTitulo} numberOfLines={1} accessibilityRole="header">{titulo}</Text>
      {derecha ?? <View style={{ width: 40 }} />}
    </View>
  );
}

/** Título en mayúsculas, como los de la web ("CENTRO DE ESTUDIANTES"). */
export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <View style={{ marginBottom: espacio.l }}>
      <Text style={s.titulo} accessibilityRole="header">{children}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

/** Título de bloque, con un ícono opcional y una acción ("Ver todo ›") a la derecha. */
export function Seccion({ children, accion, estilo, icono }: { children: ReactNode; accion?: { texto: string; onPress: () => void }; estilo?: ViewStyle; icono?: NombreIcono }) {
  return (
    <Aparecer estilo={[s.seccionFila, estilo]} distancia={8}>
      {icono ? <Ionicons name={icono} size={19} color={colores.marino} /> : null}
      <Text style={s.seccionTexto} accessibilityRole="header">{children}</Text>
      {accion && (
        <Pressable onPress={accion.onPress} hitSlop={10} accessibilityRole="link" style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={s.enlace}>{accion.texto}</Text>
          {!accion.texto.startsWith('+') && <Ionicons name="chevron-forward" size={14} color={colores.azul} />}
        </Pressable>
      )}
    </Aparecer>
  );
}

/* ------------------------------------------------------------------ */
/* Superficies                                                         */
/* ------------------------------------------------------------------ */

export function Tarjeta({ children, estilo, variante = 'blanca', onPress, etiqueta, retraso = 0 }: {
  children: ReactNode; estilo?: ViewStyle | ViewStyle[]; variante?: 'blanca' | 'celeste' | 'marino' | 'borde';
  onPress?: () => void; etiqueta?: string;
  /** ms antes de aparecer, para escalonar varias tarjetas. */
  retraso?: number;
}) {
  const { opacity, translateY } = useAparecer(retraso);
  const { escala, onPressIn, onPressOut } = usePresion(0.98);
  const base = [s.tarjeta, variantesTarjeta()[variante], estilo];
  if (!onPress) return <Animated.View style={[...base, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
  return (
    <PressableAnimado
      onPress={() => { vibrar(); onPress(); }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={[...base, { opacity, transform: [{ translateY }, { scale: escala }] }]}
    >
      {children}
    </PressableAnimado>
  );
}

const variantesTarjeta = (): Record<string, ViewStyle> => ({
  blanca: { backgroundColor: fondos.superficieBlanca, ...sombras.suave },
  celeste: { backgroundColor: fondos.tarjeta },
  marino: { backgroundColor: fondos.marino, ...sombras.media },
  borde: { backgroundColor: fondos.superficieBlanca, borderWidth: 1, borderColor: colores.lineaSuave },
});

/** Fila de lista: ícono en hexágono suave, textos y algo a la derecha. */
export function Fila({ icono, colorIcono = colores.marino, fondoIcono = fondos.tarjeta, titulo, detalle, derecha, onPress, ultima, simple }: {
  icono?: NombreIcono; colorIcono?: string; fondoIcono?: string; titulo: string; detalle?: string;
  derecha?: ReactNode; onPress?: () => void; ultima?: boolean;
  /** Ícono suelto, sin el cuadradito de fondo (estilo menú). */
  simple?: boolean;
}) {
  const cuerpo = (
    <>
      {icono && (simple ? (
        <View style={s.filaIconoSimple}>
          <Ionicons name={icono} size={21} color={colorIcono} />
        </View>
      ) : (
        <View style={[s.filaIcono, { backgroundColor: fondoIcono }]}>
          <Ionicons name={icono} size={19} color={colorIcono} />
        </View>
      ))}
      <View style={{ flex: 1 }}>
        <Text style={s.filaTitulo} numberOfLines={2}>{titulo}</Text>
        {detalle ? <Text style={s.filaDetalle} numberOfLines={2}>{detalle}</Text> : null}
      </View>
      {derecha ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} /> : null)}
    </>
  );
  const estilo = [s.fila, !ultima && s.filaLinea];
  if (!onPress) return <View style={estilo}>{cuerpo}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={titulo} style={({ pressed }) => [...estilo, pressed && { opacity: 0.6 }]}>
      {cuerpo}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

export function Boton({
  texto: etiqueta, onPress, variante = 'primario', cargando, deshabilitado, icono, compacto, estilo,
}: {
  texto: string; onPress: () => void; variante?: 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'claro';
  cargando?: boolean; deshabilitado?: boolean; icono?: NombreIcono; compacto?: boolean; estilo?: ViewStyle;
}) {
  const inactivo = deshabilitado || cargando;
  const v = variantesBoton()[variante];
  const { escala, onPressIn, onPressOut } = usePresion(0.97);
  const [presionado, setPresionado] = useState(false);
  return (
    <PressableAnimado
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      onPress={() => { vibrar(); onPress(); }}
      onPressIn={() => { setPresionado(true); onPressIn(); }}
      onPressOut={() => { setPresionado(false); onPressOut(); }}
      disabled={inactivo}
      style={[
        s.boton,
        compacto && s.botonCompacto,
        v.caja,
        presionado && v.presionado,
        { opacity: inactivo ? 0.5 : 1, transform: [{ scale: escala }] },
        estilo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={v.color} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
          {icono && <Ionicons name={icono} size={compacto ? 17 : 19} color={v.color} />}
          <Text style={[s.botonTexto, compacto && { fontSize: 13.5 }, { color: v.color }]}>{etiqueta.toUpperCase()}</Text>
        </View>
      )}
    </PressableAnimado>
  );
}

const variantesBoton = (): Record<string, { caja: ViewStyle; presionado: ViewStyle; color: string }> => ({
  primario: { caja: { backgroundColor: fondos.marino, ...sombras.suave }, presionado: { backgroundColor: fondos.marinoProfundo }, color: colores.blanco },
  secundario: { caja: { backgroundColor: fondos.superficieBlanca, borderWidth: 1.5, borderColor: colores.marino }, presionado: { backgroundColor: fondos.tarjeta }, color: colores.marino },
  peligro: { caja: { backgroundColor: fondos.rojoFondo }, presionado: { opacity: 0.8 }, color: colores.rojo },
  fantasma: { caja: { backgroundColor: 'transparent' }, presionado: { backgroundColor: fondos.tarjeta }, color: colores.marino },
  claro: { caja: { backgroundColor: fondos.blanco }, presionado: { backgroundColor: colores.cielo }, color: colores.marinoFijo },
});

export function BotonIcono({ icono, etiqueta, onPress, claro, plano, tamano = 22 }: {
  icono: NombreIcono; etiqueta: string; onPress: () => void; claro?: boolean;
  /** Sin fondo, ícono marino (para la pastilla de la cabecera). */
  plano?: boolean; tamano?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      hitSlop={6}
      style={({ pressed }) => [s.botonIcono, plano ? null : claro ? { backgroundColor: 'rgba(255,255,255,0.14)' } : { backgroundColor: fondos.superficieBlanca, ...sombras.suave }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icono} size={tamano} color={claro && !plano ? colores.blanco : colores.marino} />
    </Pressable>
  );
}

/** Botón flotante para agregar. */
export function BotonFlotante({ icono = 'add', etiqueta, onPress }: { icono?: NombreIcono; etiqueta: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} style={({ pressed }) => [s.flotante, pressed && { backgroundColor: fondos.marinoProfundo }]}>
      <Ionicons name={icono} size={22} color={colores.blanco} />
      <Text style={s.flotanteTexto}>{etiqueta}</Text>
    </Pressable>
  );
}

export function Campo({ etiqueta, ayuda, estilo, ...props }: TextInputProps & { etiqueta: string; ayuda?: string; estilo?: ViewStyle }) {
  const [foco, setFoco] = useState(false);
  return (
    <View style={[{ marginBottom: espacio.m }, estilo]}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        accessibilityHint={ayuda}
        placeholderTextColor={colores.textoTenue}
        style={[s.campo, foco && { borderColor: colores.marino, borderWidth: 1.5 }, props.multiline && { minHeight: 110, paddingTop: espacio.m, textAlignVertical: 'top' }]}
        {...props}
        onFocus={(e) => { setFoco(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFoco(false); props.onBlur?.(e); }}
      />
      {ayuda ? <Text style={[s.filaDetalle, { marginTop: espacio.xs }]}>{ayuda}</Text> : null}
    </View>
  );
}

export function Opcion({ texto: t, detalle, elegida, onPress, icono }: { texto: string; detalle?: string; elegida: boolean; onPress: () => void; icono?: NombreIcono }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detalle ? `${t}, ${detalle}` : t}
      accessibilityState={{ selected: elegida, checked: elegida }}
      onPress={onPress}
      style={({ pressed }) => [s.opcion, elegida && s.opcionElegida, pressed && { opacity: 0.85 }]}
    >
      {icono && <Ionicons name={icono} size={22} color={colores.marino} />}
      <View style={{ flex: 1 }}>
        <Text style={s.opcionTexto}>{t}</Text>
        {detalle ? <Text style={s.filaDetalle}>{detalle}</Text> : null}
      </View>
      <View style={[s.radio, elegida && { borderColor: colores.marino }]}>{elegida && <View style={s.radioPunto} />}</View>
    </Pressable>
  );
}

/** Pastilla seleccionable (filtros, días de la semana). */
export function Chip({ texto: t, elegido, onPress, icono }: { texto: string; elegido?: boolean; onPress?: () => void; icono?: NombreIcono }) {
  const { escala, onPressIn, onPressOut } = usePresion(0.94);
  return (
    <PressableAnimado
      onPress={onPress ? () => { vibrar(); onPress(); } : undefined}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: elegido }}
      style={[s.chip, elegido && { backgroundColor: fondos.marino, borderColor: colores.marino }, { transform: [{ scale: escala }] }]}
    >
      {icono && <Ionicons name={icono} size={14} color={elegido ? colores.blanco : colores.marino} />}
      <Text style={[s.chipTexto, elegido && { color: colores.blanco }]}>{t}</Text>
    </PressableAnimado>
  );
}

/** Etiqueta de estado, no interactiva. */
export function Insignia({ texto: t, color = colores.marino, fondo = fondos.tarjeta, icono }: { texto: string; color?: string; fondo?: string; icono?: NombreIcono }) {
  return (
    <View style={[s.insignia, { backgroundColor: fondo }]}>
      {icono && <Ionicons name={icono} size={12} color={color} />}
      <Text style={[s.insigniaTexto, { color }]}>{t}</Text>
    </View>
  );
}

/** Control segmentado (pestañas internas). */
export function Segmentado<T extends string>({ opciones, valor, onCambio }: { opciones: { valor: T; texto: string }[]; valor: T; onCambio: (v: T) => void }) {
  return (
    <View style={s.segmentado} accessibilityRole="tablist">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <Pressable key={o.valor} onPress={() => onCambio(o.valor)} accessibilityRole="tab" accessibilityState={{ selected: activo }} style={[s.segmento, activo && s.segmentoActivo]}>
            <Text style={[s.segmentoTexto, activo && { color: colores.marino, fontFamily: fuentes.semibold }]}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Contador − n + (asistencia, cantidades). */
export function Contador({ valor, onCambio, min = 0, max = 999, etiqueta }: { valor: number; onCambio: (n: number) => void; min?: number; max?: number; etiqueta: string }) {
  return (
    <View style={s.contador}>
      <Pressable accessibilityLabel={`Restar ${etiqueta}`} onPress={() => onCambio(Math.max(min, valor - 1))} style={s.contadorBoton} hitSlop={6}>
        <Ionicons name="remove" size={18} color={colores.marino} />
      </Pressable>
      <Text style={s.contadorValor} accessibilityLabel={`${etiqueta}: ${valor}`}>{valor}</Text>
      <Pressable accessibilityLabel={`Sumar ${etiqueta}`} onPress={() => onCambio(Math.min(max, valor + 1))} style={s.contadorBoton} hitSlop={6}>
        <Ionicons name="add" size={18} color={colores.marino} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Mensajes y estados                                                  */
/* ------------------------------------------------------------------ */

export function Mensaje({ texto: t, tipo = 'error' }: { texto: string | null; tipo?: 'error' | 'info' | 'exito' }) {
  if (!t) return null;
  const estilos = {
    error: { color: colores.rojo, fondo: fondos.rojoFondo, icono: 'alert-circle' as NombreIcono },
    info: { color: colores.marino, fondo: fondos.tarjeta, icono: 'information-circle' as NombreIcono },
    exito: { color: colores.verde, fondo: fondos.verdeFondo, icono: 'checkmark-circle' as NombreIcono },
  }[tipo];
  return (
    <View style={[s.mensaje, { backgroundColor: estilos.fondo }]} accessibilityRole={tipo === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite">
      <Aparecer key={t} distancia={6} estilo={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s }}>
        <Ionicons name={estilos.icono} size={18} color={estilos.color} />
        <Text style={[s.mensajeTexto, { color: estilos.color }]}>{t}</Text>
      </Aparecer>
    </View>
  );
}

/** Aviso de que no hay internet y se ve lo último guardado. */
export function AvisoSinConexion({ texto: t }: { texto: string | null | undefined }) {
  if (!t) return null;
  return (
    <View style={[s.mensaje, { backgroundColor: fondos.tarjeta, marginTop: 0, marginBottom: espacio.m }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={18} color={colores.marino} />
      <Text style={[s.mensajeTexto, { color: colores.marino }]}>{t}</Text>
    </View>
  );
}

export function EstadoVacio({ icono, titulo, texto: t, accion }: { icono: NombreIcono; titulo: string; texto?: string; accion?: { texto: string; onPress: () => void } }) {
  return (
    <View style={s.vacio}>
      <View style={s.vacioIcono}>
        <Ionicons name={icono} size={28} color={colores.marino} />
      </View>
      <Text style={s.vacioTitulo}>{titulo}</Text>
      {t ? <Text style={s.vacioTexto}>{t}</Text> : null}
      {accion && <Boton texto={accion.texto} onPress={accion.onPress} variante="secundario" compacto estilo={{ marginTop: espacio.m, alignSelf: 'center' }} />}
    </View>
  );
}

export function Cargando({ texto: t }: { texto?: string }) {
  return (
    <View style={{ paddingVertical: espacio.xxl, alignItems: 'center', gap: espacio.m }}>
      <ActivityIndicator color={colores.marino} size="large" />
      {t ? <Text style={s.filaDetalle}>{t}</Text> : null}
    </View>
  );
}

/** Bloque gris animable mientras cargan los datos. */
export function Esqueleto({ alto = 16, ancho = '100%', estilo }: { alto?: number; ancho?: number | `${number}%`; estilo?: ViewStyle }) {
  return <View style={[{ height: alto, width: ancho, borderRadius: radio.s, backgroundColor: fondos.lineaSuave }, estilo]} />;
}

export function Proximamente({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <Pantalla cabecera={<CabeceraMarca titulo={titulo} sub="Llega en la próxima versión" compacta />}>
      <Tarjeta estilo={{ marginTop: -espacio.l }}>
        {items.map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s }}>
            <View style={s.punto} />
            <Text style={s.item}>{i}</Text>
          </View>
        ))}
      </Tarjeta>
    </Pantalla>
  );
}

/** Hoja inferior modal, para formularios cortos. */
export function Hoja({ visible, titulo, onCerrar, children }: { visible: boolean; titulo: string; onCerrar: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  // En tablet (sobre todo en horizontal) la hoja es una ventana centrada:
  // pegada abajo y de 600 de ancho dejaba los costados sin oscurecer y,
  // con poca altura, el botón de enviar quedaba fuera de la pantalla.
  const { tablet } = useDisposicion();
  const { height } = useWindowDimensions();
  const centrada = tablet;
  const estiloHoja: ViewStyle = centrada
    ? { width: '92%', maxWidth: 640, alignSelf: 'center', borderRadius: radio.xl, flexShrink: 1, maxHeight: Math.max(320, height - insets.top - insets.bottom - espacio.xl * 2), paddingBottom: espacio.l }
    : { paddingBottom: insets.bottom + espacio.l };
  return (
    <Modal
      visible={visible}
      transparent
      animationType={centrada ? 'fade' : 'slide'}
      onRequestClose={onCerrar}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <EvitaTeclado estilo={centrada ? { justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom } : { justifyContent: 'flex-end' }}>
        {/* El velo cubre toda la pantalla, también los costados de la hoja. */}
        <Pressable style={[StyleSheet.absoluteFill, s.veloFondo]} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[s.hoja, estiloHoja]}>
          {!centrada && <View style={s.hojaAsa} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espacio.l, paddingTop: centrada ? espacio.m : 0 }}>
            <Text style={[s.barraTitulo, { textAlign: 'left' }]}>{titulo}</Text>
            <BotonIcono icono="close" etiqueta="Cerrar" onPress={onCerrar} tamano={20} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {children}
          </ScrollView>
        </View>
      </EvitaTeclado>
    </Modal>
  );
}

/** Dato grande con su etiqueta (estadísticas). */
export function Dato({ valor, etiqueta, color = colores.marino, estilo }: { valor: string; etiqueta: string; color?: string; estilo?: TextStyle }) {
  return (
    <View style={{ flex: 1 }}>
      {/^(0|[1-9]\d*)$/.test(valor) ? (
        <NumeroAnimado valor={Number(valor)} estilo={[texto.numero, { color, fontSize: 24, lineHeight: 28 }, estilo]} />
      ) : (
        <Text style={[texto.numero, { color, fontSize: 24, lineHeight: 28 }, estilo]}>{valor}</Text>
      )}
      <Text style={[s.filaDetalle, { marginTop: 2 }]}>{etiqueta}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Estilos compartidos                                                 */
/* ------------------------------------------------------------------ */

export const s = crearEstilos(() => ({
  pantalla: { flex: 1, backgroundColor: fondos.fondo },
  contenido: { padding: espacio.l, paddingBottom: espacio.xxxl + espacio.xl },

  cabecera: { backgroundColor: fondos.franja },
  cabeceraBarra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.m, paddingHorizontal: espacio.l, paddingBottom: espacio.s + 2 },
  cabeceraLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: fondos.blanco, alignItems: 'center', justifyContent: 'center' },
  cabeceraMarca: { fontFamily: fuentes.bold, fontSize: 17, color: colores.marinoOscuro },
  cabeceraMarcaSub: { fontFamily: fuentes.medium, fontSize: 12.5, color: colores.marinoOscuro, flexShrink: 1 },
  cabeceraAcciones: { flexDirection: 'row', alignItems: 'center', backgroundColor: fondos.superficieBlanca, borderRadius: 999, paddingHorizontal: 4, paddingVertical: 2, ...sombras.suave },
  cabeceraSeparador: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 8, backgroundColor: colores.linea },
  cabeceraCuerpo: { paddingHorizontal: espacio.l, paddingTop: espacio.m, overflow: 'hidden' },
  hojaContenido: { backgroundColor: fondos.fondo, borderTopLeftRadius: radio.xl + 6, borderTopRightRadius: radio.xl + 6, overflow: 'hidden' },
  cabeceraBurbuja: { position: 'absolute', left: -70, top: -40, width: 150, height: 170, borderRadius: 85, backgroundColor: fondos.burbuja },
  cabeceraTitulo: { fontFamily: fuentes.bold, fontSize: 32, lineHeight: 38, color: colores.marinoOscuro, letterSpacing: -0.5 },
  cabeceraSub: { ...texto.cuerpo, color: colores.marinoOscuro, marginTop: 2 },

  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.xl },
  marca: { fontFamily: fuentes.bold, fontSize: 22, color: colores.marino, letterSpacing: 1 },
  barraSuperior: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.l },
  barraTitulo: { flex: 1, textAlign: 'center', fontFamily: fuentes.semibold, fontSize: 17, color: colores.marino },

  titulo: { fontFamily: fuentes.semibold, fontSize: 24, lineHeight: 30, color: colores.marino, textTransform: 'uppercase', letterSpacing: 0.4 },
  sub: { fontFamily: fuentes.regular, fontSize: 15, lineHeight: 21, color: colores.textoSuave, marginTop: 4 },
  cuerpo: { ...texto.cuerpo, color: colores.texto },
  fuerte: { fontFamily: fuentes.bold, fontSize: 17, color: colores.marino },
  enlace: { fontFamily: fuentes.semibold, fontSize: 13.5, color: colores.azul },

  tarjeta: { borderRadius: radio.l, padding: espacio.l, marginBottom: espacio.m },

  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.m },
  filaLinea: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.linea },
  filaIcono: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filaIconoSimple: { width: 26, alignItems: 'center', justifyContent: 'center' },
  filaTitulo: { fontFamily: fuentes.semibold, fontSize: 15, lineHeight: 20, color: colores.texto },
  filaDetalle: { fontFamily: fuentes.regular, fontSize: 13, lineHeight: 18, color: colores.textoSuave },

  boton: { minHeight: 52, borderRadius: radio.m, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.l, marginTop: espacio.s },
  botonCompacto: { minHeight: 40, paddingHorizontal: espacio.m, marginTop: 0 },
  botonTexto: { fontFamily: fuentes.semibold, fontSize: 14.5, letterSpacing: 0.6 },
  botonIcono: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flotante: {
    position: 'absolute', right: espacio.l, bottom: espacio.l, flexDirection: 'row', alignItems: 'center', gap: espacio.s,
    backgroundColor: fondos.marino, paddingHorizontal: espacio.l, height: 52, borderRadius: radio.pill, ...sombras.fuerte,
  },
  pildoraSinConexion: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: espacio.s, paddingHorizontal: espacio.m, paddingVertical: 6, borderRadius: 999, backgroundColor: fondos.superficieBlanca },
  pildoraSinConexionTexto: { fontFamily: fuentes.medium, fontSize: 12.5, color: colores.marino, flexShrink: 1 },
  flotanteTexto: { fontFamily: fuentes.semibold, fontSize: 15, color: colores.blanco },

  etiqueta: { fontFamily: fuentes.medium, fontSize: 13.5, color: colores.marinoOscuro, marginBottom: espacio.xs + 2 },
  campo: {
    backgroundColor: fondos.superficieBlanca, borderWidth: 1, borderColor: colores.linea, borderRadius: radio.m,
    paddingHorizontal: espacio.m + 2, minHeight: 50, fontSize: 16, fontFamily: fuentes.regular, color: colores.texto,
  },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.m, borderWidth: 1, borderColor: colores.lineaSuave, borderRadius: radio.l,
    padding: espacio.m + 2, marginBottom: espacio.s, backgroundColor: fondos.superficieBlanca,
  },
  opcionElegida: { borderColor: colores.marino, borderWidth: 1.5, backgroundColor: fondos.tarjeta },
  opcionTexto: { fontFamily: fuentes.semibold, fontSize: 15.5, color: colores.marino },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colores.linea, alignItems: 'center', justifyContent: 'center' },
  radioPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colores.marino },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: espacio.m, height: 34, borderRadius: radio.pill,
    borderWidth: 1, borderColor: colores.linea, backgroundColor: fondos.superficieBlanca,
  },
  chipTexto: { fontFamily: fuentes.medium, fontSize: 13.5, color: colores.marino },
  insignia: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radio.pill, alignSelf: 'flex-start' },
  insigniaTexto: { fontFamily: fuentes.semibold, fontSize: 11.5, letterSpacing: 0.2 },

  segmentado: { flexDirection: 'row', backgroundColor: fondos.lineaSuave, borderRadius: radio.m, padding: 3, marginBottom: espacio.l },
  segmento: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radio.m - 3 },
  segmentoActivo: { backgroundColor: fondos.superficieBlanca, ...sombras.suave },
  segmentoTexto: { fontFamily: fuentes.medium, fontSize: 14, color: colores.textoSuave },

  contador: { flexDirection: 'row', alignItems: 'center', backgroundColor: fondos.tarjeta, borderRadius: radio.m, padding: 3 },
  contadorBoton: { width: 34, height: 34, borderRadius: 9, backgroundColor: fondos.superficieBlanca, alignItems: 'center', justifyContent: 'center' },
  contadorValor: { minWidth: 40, textAlign: 'center', fontFamily: fuentes.bold, fontSize: 16, color: colores.marino },

  mensaje: { flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s, padding: espacio.m, borderRadius: radio.m, marginVertical: espacio.s },
  mensajeTexto: { flex: 1, fontFamily: fuentes.regular, fontSize: 14, lineHeight: 20 },

  vacio: { alignItems: 'center', paddingVertical: espacio.l, paddingHorizontal: espacio.m },
  vacioIcono: { width: 58, height: 58, borderRadius: 18, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m },
  vacioTitulo: { fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino, textAlign: 'center' },
  vacioTexto: { ...texto.chico, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.xs, maxWidth: 300 },

  item: { flex: 1, fontFamily: fuentes.regular, fontSize: 15, lineHeight: 21, color: colores.texto },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colores.marino, marginTop: 8 },
  seccion: { ...texto.etiqueta, color: colores.marino, marginBottom: espacio.s, marginTop: espacio.m },
  seccionFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.m, marginTop: espacio.m },
  seccionTexto: { fontFamily: fuentes.bold, fontSize: 17, color: colores.texto },

  veloFondo: { backgroundColor: 'rgba(14, 58, 85, 0.45)' },
  hoja: {
    backgroundColor: fondos.fondo, borderTopLeftRadius: radio.xl, borderTopRightRadius: radio.xl, paddingHorizontal: espacio.l,
    paddingTop: espacio.s, maxHeight: '88%',
  },
  hojaAsa: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: fondos.linea, marginBottom: espacio.m },
}));
