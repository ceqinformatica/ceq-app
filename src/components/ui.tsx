import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores, espacio, fuentes, radio } from '../tema';

export const logoCeq = require('../../assets/logo-ceq.png');

export function Pantalla({ children, scroll = true, estilo }: { children: ReactNode; scroll?: boolean; estilo?: ViewStyle }) {
  const contenido = <View style={[s.contenido, estilo]}>{children}</View>;
  return (
    <SafeAreaView style={s.pantalla} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{contenido}</ScrollView> : contenido}
    </SafeAreaView>
  );
}

/** Barra superior como la de la web: logo hexagonal + "CEQ" en marino. */
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

/** Título en mayúsculas, como los de la web ("CENTRO DE ESTUDIANTES"). */
export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <View style={{ marginBottom: espacio.l }}>
      <Text style={s.titulo}>{children}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

/** Título de bloque con la barrita marina a la izquierda (como "Sobre el Centro de Estudiantes"). */
export function Seccion({ children }: { children: ReactNode }) {
  return (
    <View style={s.seccionFila}>
      <View style={s.seccionBarra} />
      <Text style={s.seccionTexto}>{children}</Text>
    </View>
  );
}

export function Tarjeta({ children, estilo }: { children: ReactNode; estilo?: ViewStyle }) {
  return <View style={[s.tarjeta, estilo]}>{children}</View>;
}

export function Boton({
  texto, onPress, variante = 'primario', cargando, deshabilitado,
}: { texto: string; onPress: () => void; variante?: 'primario' | 'secundario' | 'peligro'; cargando?: boolean; deshabilitado?: boolean }) {
  const inactivo = deshabilitado || cargando;
  const fondo = variante === 'primario' ? colores.marino : variante === 'peligro' ? colores.rojo : colores.blanco;
  const color = variante === 'secundario' ? colores.marino : colores.blanco;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        s.boton,
        { backgroundColor: pressed && variante === 'primario' ? colores.marinoOscuro : fondo, opacity: inactivo ? 0.5 : pressed ? 0.9 : 1 },
        variante === 'secundario' && s.botonBorde,
      ]}
    >
      {cargando ? <ActivityIndicator color={color} /> : <Text style={[s.botonTexto, { color }]}>{texto.toUpperCase()}</Text>}
    </Pressable>
  );
}

export function Campo({ etiqueta, ...props }: TextInputProps & { etiqueta: string }) {
  return (
    <View style={{ marginBottom: espacio.m }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput placeholderTextColor={colores.textoSuave} style={s.campo} {...props} />
    </View>
  );
}

export function Opcion({ texto, detalle, elegida, onPress }: { texto: string; detalle?: string; elegida: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: elegida }}
      onPress={onPress}
      style={[s.opcion, elegida && { borderColor: colores.marino, borderWidth: 2, backgroundColor: colores.cielo }]}
    >
      <Text style={s.opcionTexto}>{texto}</Text>
      {detalle ? <Text style={s.sub}>{detalle}</Text> : null}
    </Pressable>
  );
}

export function Mensaje({ texto, tipo = 'error' }: { texto: string | null; tipo?: 'error' | 'info' }) {
  if (!texto) return null;
  const error = tipo === 'error';
  return (
    <Text style={[s.mensaje, { color: error ? colores.rojo : colores.marino, backgroundColor: error ? colores.rojoFondo : colores.tarjeta }]}>{texto}</Text>
  );
}

export function Proximamente({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <Pantalla>
      <Encabezado />
      <Titulo sub="Llega en la próxima versión">{titulo}</Titulo>
      <Tarjeta>
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

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.l, paddingBottom: espacio.xxl },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.xl },
  marca: { fontFamily: fuentes.bold, fontSize: 22, color: colores.marino },
  titulo: { fontFamily: fuentes.medium, fontSize: 26, lineHeight: 31, color: colores.marino, textTransform: 'uppercase' },
  sub: { fontFamily: fuentes.regular, fontSize: 15, lineHeight: 21, color: colores.marinoOscuro, marginTop: 4 },
  cuerpo: { fontFamily: fuentes.regular, fontSize: 15, lineHeight: 22, color: colores.texto },
  fuerte: { fontFamily: fuentes.bold, fontSize: 17, color: colores.marino },
  tarjeta: { backgroundColor: colores.tarjeta, borderRadius: radio.l, padding: espacio.l, marginBottom: espacio.m },
  boton: { minHeight: 50, borderRadius: radio.m, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.l, marginTop: espacio.s },
  botonBorde: { borderWidth: 2, borderColor: colores.marino },
  botonTexto: { fontFamily: fuentes.semibold, fontSize: 15, letterSpacing: 0.3 },
  etiqueta: { fontFamily: fuentes.medium, fontSize: 14, color: colores.marinoOscuro, marginBottom: espacio.xs },
  campo: {
    backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.linea, borderRadius: radio.m,
    paddingHorizontal: espacio.m, minHeight: 50, fontSize: 16, fontFamily: fuentes.regular, color: colores.texto,
  },
  opcion: { borderWidth: 1, borderColor: colores.linea, borderRadius: radio.l, padding: espacio.m, marginBottom: espacio.s, backgroundColor: colores.blanco },
  opcionTexto: { fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino },
  mensaje: { fontFamily: fuentes.regular, fontSize: 14, padding: espacio.m, borderRadius: radio.m, marginVertical: espacio.s, overflow: 'hidden' },
  item: { flex: 1, fontFamily: fuentes.regular, fontSize: 15, lineHeight: 21, color: colores.texto },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colores.marino, marginTop: 8 },
  seccion: { fontFamily: fuentes.semibold, fontSize: 13, color: colores.marino, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: espacio.s, marginTop: espacio.m },
  seccionFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.s },
  seccionBarra: { width: 3, height: 20, backgroundColor: colores.marino, borderRadius: 2 },
  seccionTexto: { fontFamily: fuentes.bold, fontSize: 17, color: colores.marino },
});
