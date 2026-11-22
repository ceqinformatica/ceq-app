import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores, espacio, radio } from '../tema';

export function Pantalla({ children, scroll = true, estilo }: { children: ReactNode; scroll?: boolean; estilo?: ViewStyle }) {
  const contenido = <View style={[s.contenido, estilo]}>{children}</View>;
  return (
    <SafeAreaView style={s.pantalla} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled">{contenido}</ScrollView> : contenido}
    </SafeAreaView>
  );
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <View style={{ marginBottom: espacio.l }}>
      <Text style={s.titulo}>{children}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
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
  const fondo = variante === 'primario' ? colores.primario : variante === 'peligro' ? colores.rojo : colores.superficie;
  const color = variante === 'secundario' ? colores.primario : colores.blanco;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [s.boton, { backgroundColor: fondo, opacity: inactivo ? 0.5 : pressed ? 0.85 : 1 }, variante === 'secundario' && s.botonBorde]}
    >
      {cargando ? <ActivityIndicator color={color} /> : <Text style={[s.botonTexto, { color }]}>{texto}</Text>}
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
      style={[s.opcion, elegida && { borderColor: colores.primario, backgroundColor: colores.primarioSuave }]}
    >
      <Text style={[s.opcionTexto, elegida && { color: colores.primario }]}>{texto}</Text>
      {detalle ? <Text style={s.sub}>{detalle}</Text> : null}
    </Pressable>
  );
}

export function Mensaje({ texto, tipo = 'error' }: { texto: string | null; tipo?: 'error' | 'info' }) {
  if (!texto) return null;
  return <Text style={[s.mensaje, { color: tipo === 'error' ? colores.rojo : colores.textoSuave }]}>{texto}</Text>;
}

export function Proximamente({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <Pantalla>
      <Titulo sub="Llega en la próxima versión">{titulo}</Titulo>
      <Tarjeta>
        {items.map((i) => (
          <Text key={i} style={s.item}>• {i}</Text>
        ))}
      </Tarjeta>
    </Pantalla>
  );
}

export const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.l, paddingBottom: espacio.xxl },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.texto },
  sub: { fontSize: 14, color: colores.textoSuave, marginTop: 2 },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radio.m, padding: espacio.l, marginBottom: espacio.m, borderWidth: 1, borderColor: colores.borde },
  boton: { minHeight: 48, borderRadius: radio.m, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.l, marginTop: espacio.s },
  botonBorde: { borderWidth: 1, borderColor: colores.primario },
  botonTexto: { fontSize: 16, fontWeight: '600' },
  etiqueta: { fontSize: 14, color: colores.textoSuave, marginBottom: espacio.xs },
  campo: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde, borderRadius: radio.s, paddingHorizontal: espacio.m, minHeight: 48, fontSize: 16, color: colores.texto },
  opcion: { borderWidth: 1, borderColor: colores.borde, borderRadius: radio.m, padding: espacio.m, marginBottom: espacio.s, backgroundColor: colores.superficie },
  opcionTexto: { fontSize: 16, fontWeight: '600', color: colores.texto },
  mensaje: { fontSize: 14, marginVertical: espacio.s },
  item: { fontSize: 15, color: colores.texto, marginBottom: espacio.xs },
  seccion: { fontSize: 13, fontWeight: '700', color: colores.textoSuave, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: espacio.s, marginTop: espacio.m },
});
