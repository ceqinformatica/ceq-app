import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { colores, espacio } from '../../tema';
import { s } from '../ui';
import { ControlFechaHora } from './control';
import type { ModoFecha } from './formato';

export * from './formato';

/**
 * Campo de fecha u hora con el selector del sistema, en lugar de escribir.
 * Devuelve el texto "DD/MM/AAAA" o "HH:MM" (vacío si se borra).
 */
export function CampoFechaHora({ etiqueta, modo, valor, onCambio, placeholder, opcional, minimo, ayuda, estilo }: {
  etiqueta: string; modo: ModoFecha; valor: string; onCambio: (v: string) => void; placeholder?: string;
  /** Muestra una cruz para borrar. */
  opcional?: boolean; minimo?: Date; ayuda?: string; estilo?: ViewStyle;
}) {
  return (
    <View style={[{ marginBottom: espacio.m }, estilo]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[s.etiqueta, { flex: 1 }]}>{etiqueta}</Text>
        {opcional && valor ? (
          <Pressable onPress={() => onCambio('')} accessibilityRole="button" accessibilityLabel={`Borrar ${etiqueta}`} hitSlop={14} style={{ marginBottom: espacio.xs + 2 }}>
            <Ionicons name="close-circle" size={16} color={colores.textoTenue} />
          </Pressable>
        ) : null}
      </View>
      <ControlFechaHora modo={modo} valor={valor} onCambio={onCambio} etiqueta={etiqueta} placeholder={placeholder} minimo={minimo} />
      {ayuda ? <Text style={[s.filaDetalle, { marginTop: espacio.xs }]}>{ayuda}</Text> : null}
    </View>
  );
}
