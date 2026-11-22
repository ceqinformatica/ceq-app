import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { colores, espacio, fuentes } from '../../tema';
import { s } from '../ui';
import { fechaLegible, leerTextoFecha, leerTextoHora, textoFecha, textoHora, type PropsControl } from './formato';

/**
 * Campo que abre el selector del celular: en Android el diálogo de
 * calendario o reloj, en iOS la rueda debajo del campo.
 */
export function ControlFechaHora({ modo, valor, onCambio, etiqueta, placeholder, minimo }: PropsControl) {
  const [abiertoIos, setAbiertoIos] = useState(false);
  const actual = (modo === 'date' ? leerTextoFecha(valor) : leerTextoHora(valor)) ?? (() => {
    const d = minimo && modo === 'date' && minimo > new Date() ? new Date(minimo) : new Date();
    if (modo === 'time') d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return d;
  })();
  const elegir = (d: Date) => onCambio(modo === 'date' ? textoFecha(d) : textoHora(d));

  const abrir = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: actual,
        mode: modo,
        is24Hour: true,
        minimumDate: modo === 'date' ? minimo : undefined,
        onValueChange: (_e, d) => elegir(d),
      });
    } else {
      // Al cerrar sin mover la rueda, queda lo que se veía (por ejemplo, hoy).
      if (abiertoIos && !valor) elegir(actual);
      setAbiertoIos((a) => !a);
    }
  };

  const leida = modo === 'date' && valor ? leerTextoFecha(valor) : null;
  const mostrado = valor ? (leida ? fechaLegible(leida) : valor) : '';
  return (
    <View>
      <Pressable
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: ${mostrado || 'sin elegir'}`}
        accessibilityHint={modo === 'date' ? 'Abre el calendario' : 'Abre el reloj'}
        style={({ pressed }) => [s.campo, { flexDirection: 'row', alignItems: 'center', gap: espacio.s }, (pressed || abiertoIos) && { borderColor: colores.marino, borderWidth: 1.5 }]}
      >
        <Ionicons name={modo === 'date' ? 'calendar-outline' : 'time-outline'} size={18} color={colores.marino} />
        <Text style={{ flex: 1, fontFamily: fuentes.regular, fontSize: 16, color: mostrado ? colores.texto : colores.textoTenue }} numberOfLines={1}>
          {mostrado || placeholder || (modo === 'date' ? 'Elegir fecha' : 'Elegir hora')}
        </Text>
      </Pressable>
      {Platform.OS === 'ios' && abiertoIos && (
        <View style={{ alignItems: 'center' }}>
          <DateTimePicker
            value={actual}
            mode={modo}
            display={modo === 'date' ? 'inline' : 'spinner'}
            locale="es-PY"
            minimumDate={modo === 'date' ? minimo : undefined}
            onValueChange={(_e, d) => elegir(d)}
          />
          <Pressable
            onPress={() => { if (!valor) elegir(actual); setAbiertoIos(false); }}
            accessibilityRole="button"
            accessibilityLabel="Listo, cerrar selector"
            hitSlop={8} style={{ paddingVertical: espacio.s }}>
            <Text style={s.enlace}>Listo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
