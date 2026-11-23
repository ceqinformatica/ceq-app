import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { cuando, momento, rango, type CategoriaCalendario, type EventoCalendario } from '../lib/calendario';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';
import { s, type NombreIcono } from './ui';

export const ICONO_CATEGORIA: Record<CategoriaCalendario, NombreIcono> = {
  clases: 'school-outline',
  inscripcion: 'create-outline',
  examenes: 'document-text-outline',
  aranceles: 'cash-outline',
  solicitudes: 'mail-outline',
  horarios: 'time-outline',
  feriado: 'flag-outline',
  asueto: 'sunny-outline',
  ingresantes: 'person-add-outline',
};

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const SEMESTRE = ['', '1.er semestre', '2.º semestre'];

/** Una fila del calendario: fecha, qué es, cuándo. */
export function FilaCalendario({ e, hoy, ultima, onPress }: { e: EventoCalendario; hoy: string; ultima?: boolean; onPress?: () => void }) {
  const m = momento(e, hoy);
  const ahora = m === 'ahora';
  const libre = e.categoria === 'feriado' || e.categoria === 'asueto';
  const [, mes, dia] = e.desde.split('-').map(Number);
  const detalle = [rango(e.desde, e.hasta), e.semestre ? SEMESTRE[e.semestre] : null].filter(Boolean).join(' · ');
  const contenido = (
    <View style={[est.fila, !ultima && s.filaLinea, m === 'pasado' && { opacity: 0.55 }]}>
      <View style={[est.fecha, ahora && { backgroundColor: fondos.marino }, libre && !ahora && { backgroundColor: fondos.rojoFondo }]}>
        <Text style={[est.dia, ahora && { color: colores.blanco }, libre && !ahora && { color: colores.rojo }]}>{dia}</Text>
        <Text style={[est.mes, ahora && { color: colores.celeste }, libre && !ahora && { color: colores.rojo }]}>{MESES[mes - 1]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={ICONO_CATEGORIA[e.categoria]} size={14} color={libre ? colores.rojo : colores.azul} />
          <Text style={[s.filaTitulo, { flex: 1 }]} numberOfLines={3}>{e.titulo}</Text>
        </View>
        <Text style={[s.filaDetalle, { marginTop: 2 }]}>{detalle}</Text>
        {e.detalle ? <Text style={[s.filaDetalle, { marginTop: 2, color: colores.amarillo }]}>{e.detalle}</Text> : null}
      </View>
      <Text style={[est.cuando, ahora && { color: colores.verde }]}>{cuando(e, hoy)}</Text>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colores.textoTenue} />}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${e.titulo}, ${detalle}`}>{contenido}</Pressable>
  ) : (
    <View accessible accessibilityLabel={`${e.titulo}, ${detalle}, ${cuando(e, hoy)}`}>{contenido}</View>
  );
}

const est = crearEstilos(() => ({
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s + 2 },
  fecha: { width: 44, height: 46, borderRadius: 10, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  dia: { fontFamily: fuentes.bold, fontSize: 17, lineHeight: 20, color: colores.marino },
  mes: { fontFamily: fuentes.semibold, fontSize: 9.5, letterSpacing: 0.6, color: colores.textoSuave },
  cuando: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.textoSuave, maxWidth: 92, textAlign: 'right' },
}));
