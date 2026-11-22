import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, espacio, fuentes, radio, sombras, texto } from '../tema';
import { TramaHex } from './graficos';

export const logoCeq = require('../../assets/logo-ceq.png');
export type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ */
/* Estructura de pantalla                                              */
/* ------------------------------------------------------------------ */

/**
 * Contenedor de cada pantalla. Con `cabecera` la banda marina ocupa el borde
 * superior (debajo de la barra de estado) y el contenido sube sobre ella.
 */
export function Pantalla({ children, scroll = true, estilo, cabecera, refrescando, onRefrescar }: {
  children: ReactNode; scroll?: boolean; estilo?: ViewStyle; cabecera?: ReactNode;
  refrescando?: boolean; onRefrescar?: () => void;
}) {
  const contenido = <View style={[s.contenido, cabecera ? { paddingTop: 0 } : null, estilo]}>{children}</View>;
  const refresh = onRefrescar ? (
    <RefreshControl refreshing={Boolean(refrescando)} onRefresh={onRefrescar} tintColor={cabecera ? colores.blanco : colores.marino} colors={[colores.marino]} />
  ) : undefined;
  return (
    <SafeAreaView style={s.pantalla} edges={cabecera ? ['left', 'right'] : ['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refresh} showsVerticalScrollIndicator={false}>
          {cabecera}
          {contenido}
        </ScrollView>
      ) : (
        <>
          {cabecera}
          {contenido}
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * Banda marina con la trama de hexágonos: la firma visual de la app.
 * Va arriba de las pestañas principales.
 */
export function CabeceraMarca({ titulo, sub, derecha, children, compacta }: {
  titulo?: string; sub?: string; derecha?: ReactNode; children?: ReactNode; compacta?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useBarraEstado('light');
  return (
    <View
      style={[s.cabecera, { paddingTop: insets.top + espacio.m, paddingBottom: compacta ? espacio.xl : espacio.xxl + espacio.l }]}
      onLayout={(e) => setTam({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {tam.w > 0 && <TramaHex ancho={tam.w} alto={tam.h} />}
      <View style={s.cabeceraFila}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
          <View style={s.logoPastilla}>
            <Image source={logoCeq} style={{ width: 26, height: 26 }} accessibilityLabel="Logo del CEQ" />
          </View>
          <Text style={s.cabeceraMarca}>CEQ</Text>
        </View>
        {derecha}
      </View>
      {titulo ? <Text style={s.cabeceraTitulo} accessibilityRole="header">{titulo}</Text> : null}
      {sub ? <Text style={s.cabeceraSub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

/** Íconos de la barra de estado claros u oscuros según la pantalla enfocada. */
export function useBarraEstado(estilo: 'light' | 'dark') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(estilo, true);
    }, [estilo]),
  );
}

/** Barra superior clara: logo hexagonal + "CEQ" en marino. */
export function Encabezado({ derecha }: { derecha?: ReactNode }) {
  return (
    <View style={s.encabezado}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
        <Image source={logoCeq} style={{ width: 36, height: 36 }} accessibilityLabel="Logo del CEQ" />
        <Text style={s.marca}>CEQ</Text>
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

/** Título de bloque con la barrita marina a la izquierda (como en la web). */
export function Seccion({ children, accion, estilo }: { children: ReactNode; accion?: { texto: string; onPress: () => void }; estilo?: ViewStyle }) {
  return (
    <View style={[s.seccionFila, estilo]}>
      <View style={s.seccionBarra} />
      <Text style={s.seccionTexto} accessibilityRole="header">{children}</Text>
      {accion && (
        <Pressable onPress={accion.onPress} hitSlop={10} accessibilityRole="link" style={{ marginLeft: 'auto' }}>
          <Text style={s.enlace}>{accion.texto}</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Superficies                                                         */
/* ------------------------------------------------------------------ */

export function Tarjeta({ children, estilo, variante = 'blanca', onPress, etiqueta }: {
  children: ReactNode; estilo?: ViewStyle | ViewStyle[]; variante?: 'blanca' | 'celeste' | 'marino' | 'borde';
  onPress?: () => void; etiqueta?: string;
}) {
  const base = [s.tarjeta, variantesTarjeta[variante], estilo];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} style={({ pressed }) => [...base, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

const variantesTarjeta: Record<string, ViewStyle> = {
  blanca: { backgroundColor: colores.superficieBlanca, ...sombras.suave },
  celeste: { backgroundColor: colores.tarjeta },
  marino: { backgroundColor: colores.marino, ...sombras.media },
  borde: { backgroundColor: colores.superficieBlanca, borderWidth: 1, borderColor: colores.lineaSuave },
};

/** Fila de lista: ícono en hexágono suave, textos y algo a la derecha. */
export function Fila({ icono, colorIcono = colores.marino, fondoIcono = colores.tarjeta, titulo, detalle, derecha, onPress, ultima }: {
  icono?: NombreIcono; colorIcono?: string; fondoIcono?: string; titulo: string; detalle?: string;
  derecha?: ReactNode; onPress?: () => void; ultima?: boolean;
}) {
  const cuerpo = (
    <>
      {icono && (
        <View style={[s.filaIcono, { backgroundColor: fondoIcono }]}>
          <Ionicons name={icono} size={19} color={colorIcono} />
        </View>
      )}
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
  const v = variantesBoton[variante];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        s.boton,
        compacto && s.botonCompacto,
        v.caja,
        pressed && v.presionado,
        { opacity: inactivo ? 0.5 : 1 },
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
    </Pressable>
  );
}

const variantesBoton: Record<string, { caja: ViewStyle; presionado: ViewStyle; color: string }> = {
  primario: { caja: { backgroundColor: colores.marino, ...sombras.suave }, presionado: { backgroundColor: colores.marinoProfundo }, color: colores.blanco },
  secundario: { caja: { backgroundColor: colores.superficieBlanca, borderWidth: 1.5, borderColor: colores.marino }, presionado: { backgroundColor: colores.tarjeta }, color: colores.marino },
  peligro: { caja: { backgroundColor: colores.rojoFondo }, presionado: { opacity: 0.8 }, color: colores.rojo },
  fantasma: { caja: { backgroundColor: 'transparent' }, presionado: { backgroundColor: colores.tarjeta }, color: colores.marino },
  claro: { caja: { backgroundColor: colores.blanco }, presionado: { backgroundColor: colores.cielo }, color: colores.marino },
};

export function BotonIcono({ icono, etiqueta, onPress, claro, tamano = 22 }: { icono: NombreIcono; etiqueta: string; onPress: () => void; claro?: boolean; tamano?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      hitSlop={6}
      style={({ pressed }) => [s.botonIcono, claro ? { backgroundColor: 'rgba(255,255,255,0.14)' } : { backgroundColor: colores.superficieBlanca, ...sombras.suave }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icono} size={tamano} color={claro ? colores.blanco : colores.marino} />
    </Pressable>
  );
}

/** Botón flotante para agregar. */
export function BotonFlotante({ icono = 'add', etiqueta, onPress }: { icono?: NombreIcono; etiqueta: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} style={({ pressed }) => [s.flotante, pressed && { backgroundColor: colores.marinoProfundo }]}>
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
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: elegido }}
      style={[s.chip, elegido && { backgroundColor: colores.marino, borderColor: colores.marino }]}
    >
      {icono && <Ionicons name={icono} size={14} color={elegido ? colores.blanco : colores.marino} />}
      <Text style={[s.chipTexto, elegido && { color: colores.blanco }]}>{t}</Text>
    </Pressable>
  );
}

/** Etiqueta de estado, no interactiva. */
export function Insignia({ texto: t, color = colores.marino, fondo = colores.tarjeta, icono }: { texto: string; color?: string; fondo?: string; icono?: NombreIcono }) {
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
    error: { color: colores.rojo, fondo: colores.rojoFondo, icono: 'alert-circle' as NombreIcono },
    info: { color: colores.marino, fondo: colores.tarjeta, icono: 'information-circle' as NombreIcono },
    exito: { color: colores.verde, fondo: colores.verdeFondo, icono: 'checkmark-circle' as NombreIcono },
  }[tipo];
  return (
    <View style={[s.mensaje, { backgroundColor: estilos.fondo }]} accessibilityRole={tipo === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite">
      <Ionicons name={estilos.icono} size={18} color={estilos.color} />
      <Text style={[s.mensajeTexto, { color: estilos.color }]}>{t}</Text>
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
  return <View style={[{ height: alto, width: ancho, borderRadius: radio.s, backgroundColor: colores.lineaSuave }, estilo]} />;
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={s.velo} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[s.hoja, { paddingBottom: insets.bottom + espacio.l }]}>
          <View style={s.hojaAsa} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espacio.l }}>
            <Text style={[s.barraTitulo, { textAlign: 'left' }]}>{titulo}</Text>
            <BotonIcono icono="close" etiqueta="Cerrar" onPress={onCerrar} tamano={20} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Dato grande con su etiqueta (estadísticas). */
export function Dato({ valor, etiqueta, color = colores.marino, estilo }: { valor: string; etiqueta: string; color?: string; estilo?: TextStyle }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[texto.numero, { color, fontSize: 24, lineHeight: 28 }, estilo]}>{valor}</Text>
      <Text style={[s.filaDetalle, { marginTop: 2 }]}>{etiqueta}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Estilos compartidos                                                 */
/* ------------------------------------------------------------------ */

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.l, paddingBottom: espacio.xxxl + espacio.xl },

  cabecera: {
    backgroundColor: colores.marino, paddingHorizontal: espacio.l, borderBottomLeftRadius: radio.xl + 6, borderBottomRightRadius: radio.xl + 6,
    overflow: 'hidden', marginBottom: espacio.xs,
  },
  cabeceraFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.l },
  logoPastilla: { width: 36, height: 36, borderRadius: 10, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  cabeceraMarca: { fontFamily: fuentes.bold, fontSize: 19, color: colores.blanco, letterSpacing: 1.5 },
  cabeceraTitulo: { ...texto.titulo, color: colores.blanco, textTransform: 'uppercase', letterSpacing: 0.6 },
  cabeceraSub: { ...texto.cuerpo, color: colores.celeste, marginTop: 2 },

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
  filaTitulo: { fontFamily: fuentes.semibold, fontSize: 15, lineHeight: 20, color: colores.texto },
  filaDetalle: { fontFamily: fuentes.regular, fontSize: 13, lineHeight: 18, color: colores.textoSuave },

  boton: { minHeight: 52, borderRadius: radio.m, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.l, marginTop: espacio.s },
  botonCompacto: { minHeight: 40, paddingHorizontal: espacio.m, marginTop: 0 },
  botonTexto: { fontFamily: fuentes.semibold, fontSize: 14.5, letterSpacing: 0.6 },
  botonIcono: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flotante: {
    position: 'absolute', right: espacio.l, bottom: espacio.l, flexDirection: 'row', alignItems: 'center', gap: espacio.s,
    backgroundColor: colores.marino, paddingHorizontal: espacio.l, height: 52, borderRadius: radio.pill, ...sombras.fuerte,
  },
  flotanteTexto: { fontFamily: fuentes.semibold, fontSize: 15, color: colores.blanco },

  etiqueta: { fontFamily: fuentes.medium, fontSize: 13.5, color: colores.marinoOscuro, marginBottom: espacio.xs + 2 },
  campo: {
    backgroundColor: colores.superficieBlanca, borderWidth: 1, borderColor: colores.linea, borderRadius: radio.m,
    paddingHorizontal: espacio.m + 2, minHeight: 50, fontSize: 16, fontFamily: fuentes.regular, color: colores.texto,
  },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.m, borderWidth: 1, borderColor: colores.lineaSuave, borderRadius: radio.l,
    padding: espacio.m + 2, marginBottom: espacio.s, backgroundColor: colores.superficieBlanca,
  },
  opcionElegida: { borderColor: colores.marino, borderWidth: 1.5, backgroundColor: colores.tarjeta },
  opcionTexto: { fontFamily: fuentes.semibold, fontSize: 15.5, color: colores.marino },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colores.linea, alignItems: 'center', justifyContent: 'center' },
  radioPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colores.marino },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: espacio.m, height: 34, borderRadius: radio.pill,
    borderWidth: 1, borderColor: colores.linea, backgroundColor: colores.superficieBlanca,
  },
  chipTexto: { fontFamily: fuentes.medium, fontSize: 13.5, color: colores.marino },
  insignia: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radio.pill, alignSelf: 'flex-start' },
  insigniaTexto: { fontFamily: fuentes.semibold, fontSize: 11.5, letterSpacing: 0.2 },

  segmentado: { flexDirection: 'row', backgroundColor: colores.lineaSuave, borderRadius: radio.m, padding: 3, marginBottom: espacio.l },
  segmento: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radio.m - 3 },
  segmentoActivo: { backgroundColor: colores.superficieBlanca, ...sombras.suave },
  segmentoTexto: { fontFamily: fuentes.medium, fontSize: 14, color: colores.textoSuave },

  contador: { flexDirection: 'row', alignItems: 'center', backgroundColor: colores.tarjeta, borderRadius: radio.m, padding: 3 },
  contadorBoton: { width: 34, height: 34, borderRadius: 9, backgroundColor: colores.superficieBlanca, alignItems: 'center', justifyContent: 'center' },
  contadorValor: { minWidth: 40, textAlign: 'center', fontFamily: fuentes.bold, fontSize: 16, color: colores.marino },

  mensaje: { flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s, padding: espacio.m, borderRadius: radio.m, marginVertical: espacio.s },
  mensajeTexto: { flex: 1, fontFamily: fuentes.regular, fontSize: 14, lineHeight: 20 },

  vacio: { alignItems: 'center', paddingVertical: espacio.l, paddingHorizontal: espacio.m },
  vacioIcono: { width: 58, height: 58, borderRadius: 18, backgroundColor: colores.tarjeta, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m },
  vacioTitulo: { fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino, textAlign: 'center' },
  vacioTexto: { ...texto.chico, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.xs, maxWidth: 300 },

  item: { flex: 1, fontFamily: fuentes.regular, fontSize: 15, lineHeight: 21, color: colores.texto },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colores.marino, marginTop: 8 },
  seccion: { ...texto.etiqueta, color: colores.marino, marginBottom: espacio.s, marginTop: espacio.m },
  seccionFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.m, marginTop: espacio.m },
  seccionBarra: { width: 3.5, height: 18, backgroundColor: colores.marino, borderRadius: 2 },
  seccionTexto: { fontFamily: fuentes.bold, fontSize: 16.5, color: colores.marino },

  velo: { flex: 1, backgroundColor: 'rgba(14, 37, 82, 0.45)' },
  hoja: {
    backgroundColor: colores.fondo, borderTopLeftRadius: radio.xl, borderTopRightRadius: radio.xl, paddingHorizontal: espacio.l,
    paddingTop: espacio.s, maxHeight: '88%',
  },
  hojaAsa: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colores.linea, marginBottom: espacio.m },
});
