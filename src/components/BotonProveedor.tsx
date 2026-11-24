import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text } from 'react-native';
import { ETIQUETA_PROVEEDOR, NOMBRE_PROVEEDOR, type Proveedor } from '../lib/acceso';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../tema';

const ICONO = { google: 'logo-google', microsoft: 'logo-microsoft' } as const;

/** Botón blanco "Continuar con Google / Microsoft" (o "Confirmar con …"). */
export function BotonProveedor({
  proveedor, accion = 'Continuar', cargando, deshabilitado, onPress,
}: {
  proveedor: Proveedor;
  accion?: 'Continuar' | 'Confirmar';
  cargando?: boolean;
  deshabilitado?: boolean;
  onPress: () => void;
}) {
  const nombre = NOMBRE_PROVEEDOR[proveedor];
  const texto = `${accion} con ${accion === 'Continuar' ? ETIQUETA_PROVEEDOR[proveedor] : nombre}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: deshabilitado, busy: cargando }}
      style={({ pressed }) => [est.boton, pressed && { backgroundColor: fondos.tarjeta }, deshabilitado && !cargando && { opacity: 0.6 }]}
    >
      <Ionicons name={ICONO[proveedor]} size={20} color={colores.marino} />
      <Text style={est.texto}>{cargando ? `Abriendo ${nombre}…` : texto}</Text>
    </Pressable>
  );
}

const est = crearEstilos(() => ({
  boton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espacio.m, minHeight: 50, borderRadius: radio.m, marginTop: espacio.s,
    backgroundColor: fondos.superficieBlanca, borderWidth: 1, borderColor: colores.linea, ...sombras.suave,
  },
  texto: { fontFamily: fuentes.semibold, fontSize: 15.5, color: colores.marino },
}));
