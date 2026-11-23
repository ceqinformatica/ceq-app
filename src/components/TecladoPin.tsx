import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PIN_MAX, PIN_MIN } from '../lib/pin';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';

/**
 * Teclado numérico para el PIN de la app.
 *
 * - Con `largo` (PIN ya creado, o confirmación): al completar los números se
 *   envía solo.
 * - Sin `largo` (PIN nuevo): se escriben de PIN_MIN a PIN_MAX números y se
 *   confirma con la tecla ✓.
 * `sobreMarca` lo pinta en blanco para la pantalla de bloqueo (fondo celeste).
 */
export function TecladoPin({ largo, onCompleto, sobreMarca, deshabilitado, teclaExtra, reinicio }: {
  largo?: number | null;
  onCompleto: (pin: string) => void;
  sobreMarca?: boolean;
  deshabilitado?: boolean;
  /** Tecla de abajo a la izquierda (por ejemplo, usar la huella). */
  teclaExtra?: { icono: 'finger-print' | 'scan-outline'; etiqueta: string; onPress: () => void };
  /** Cambiarlo borra lo escrito (después de un intento). */
  reinicio?: unknown;
}) {
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [reinicio]);

  const tinta = sobreMarca ? '#FFFFFF' : colores.marino;
  const maximo = largo ?? PIN_MAX;
  const puntos = largo ?? Math.max(PIN_MIN, pin.length);

  const tocar = (d: string) => {
    if (deshabilitado || pin.length >= maximo) return;
    const nuevo = pin + d;
    setPin(nuevo);
    if (largo && nuevo.length === largo) onCompleto(nuevo);
  };
  const borrar = () => setPin((p) => p.slice(0, -1));
  const confirmar = () => {
    if (!deshabilitado && pin.length >= PIN_MIN) onCompleto(pin);
  };

  const tecla = (contenido: ReactNode, etiqueta: string, onPress: () => void, inactiva = false) => (
    <Pressable
      key={etiqueta}
      onPress={onPress}
      disabled={deshabilitado || inactiva}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [
        s.tecla,
        sobreMarca ? s.teclaMarca : s.teclaNormal,
        pressed && (sobreMarca ? s.teclaMarcaPresionada : s.teclaNormalPresionada),
        (deshabilitado || inactiva) && { opacity: 0.4 },
      ]}
    >
      {contenido}
    </Pressable>
  );
  const numero = (d: string) => tecla(<Text style={[s.numero, { color: tinta }]}>{d}</Text>, d, () => tocar(d));
  const hueco = (k: string) => <View key={k} style={s.tecla} />;

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={s.puntos}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${pin.length} de ${largo ?? `${PIN_MIN} a ${PIN_MAX}`} números escritos`}
      >
        {Array.from({ length: puntos }, (_, i) => (
          <View key={i} style={[s.punto, { borderColor: tinta }, i < pin.length && { backgroundColor: tinta }]} />
        ))}
      </View>
      {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((fila) => (
        <View key={fila[0]} style={s.fila}>{fila.map(numero)}</View>
      ))}
      <View style={s.fila}>
        {largo
          ? teclaExtra
            ? tecla(<Ionicons name={teclaExtra.icono} size={30} color={tinta} />, teclaExtra.etiqueta, teclaExtra.onPress)
            : hueco('extra')
          : tecla(<Ionicons name="checkmark" size={30} color={tinta} />, 'Listo', confirmar, pin.length < PIN_MIN)}
        {numero('0')}
        {tecla(<Ionicons name="backspace-outline" size={26} color={tinta} />, 'Borrar', borrar, pin.length === 0)}
      </View>
    </View>
  );
}

const s = crearEstilos(() => ({
  puntos: { flexDirection: 'row', gap: espacio.m, height: 20, alignItems: 'center', marginBottom: espacio.xl },
  punto: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  fila: { flexDirection: 'row', gap: espacio.xl, marginBottom: espacio.m },
  tecla: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  teclaMarca: { backgroundColor: 'rgba(255,255,255,0.12)' },
  teclaMarcaPresionada: { backgroundColor: 'rgba(255,255,255,0.28)' },
  teclaNormal: { backgroundColor: fondos.tarjeta },
  teclaNormalPresionada: { backgroundColor: fondos.cielo },
  numero: { fontFamily: fuentes.semibold, fontSize: 28 },
}));
