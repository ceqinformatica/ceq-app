import { Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';
import { colores, fondos, fuentes, radio } from '../tema';

/** Puntos de un hexágono "de punta" (como el logo del CEQ) centrado en (cx, cy). */
function puntosHex(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** Hexágono suelto: para íconos, insignias y fondos. */
export function Hexagono({ tamano = 40, relleno = fondos.marino, borde, grosor = 0, children, estilo }: {
  tamano?: number; relleno?: string; borde?: string; grosor?: number; children?: React.ReactNode; estilo?: ViewStyle;
}) {
  const r = tamano / 2 - grosor;
  return (
    <View style={[{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }, estilo]}>
      <Svg width={tamano} height={tamano} style={{ position: 'absolute' }}>
        <Polygon points={puntosHex(tamano / 2, tamano / 2, r)} fill={relleno} stroke={borde} strokeWidth={grosor} strokeLinejoin="round" />
      </Svg>
      {children}
    </View>
  );
}

/** Anillo de progreso con el porcentaje en el centro. */
export function AnilloProgreso({ porcentaje, tamano = 120, grosor = 11, color = colores.marino, fondo = fondos.cielo, colorTexto = colores.marino, etiqueta }: {
  porcentaje: number; tamano?: number; grosor?: number; color?: string; fondo?: string; colorTexto?: string; etiqueta?: string;
}) {
  const r = (tamano - grosor) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, porcentaje));
  const entero = Number.isInteger(p) ? String(p) : p.toFixed(1).replace('.', ',');
  return (
    <View style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }}>
      <Svg width={tamano} height={tamano} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={tamano / 2} cy={tamano / 2} r={r} stroke={fondo} strokeWidth={grosor} fill="none" />
        <Circle
          cx={tamano / 2} cy={tamano / 2} r={r} stroke={color} strokeWidth={grosor} fill="none"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - p / 100)} strokeLinecap="round"
        />
      </Svg>
      <Text style={{ fontFamily: fuentes.bold, fontSize: tamano * 0.22, color: colorTexto, letterSpacing: -0.5 }}>
        {entero}
        <Text style={{ fontSize: tamano * 0.12 }}>%</Text>
      </Text>
      {etiqueta ? <Text style={{ fontFamily: fuentes.medium, fontSize: Math.max(10, tamano * 0.085), color: colorTexto, opacity: 0.75, marginTop: -2 }}>{etiqueta}</Text> : null}
    </View>
  );
}

/** Barra de progreso horizontal, con marca opcional (ej. el mínimo para firmar). */
export function BarraProgreso({ valor, marca, color = colores.marino, fondo = fondos.cielo, alto = 8 }: {
  valor: number | null; marca?: number | null; color?: string; fondo?: string; alto?: number;
}) {
  const v = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <View style={{ height: alto + 6, justifyContent: 'center' }}>
      <View style={{ height: alto, borderRadius: radio.pill, backgroundColor: fondo, overflow: 'hidden' }}>
        <View style={{ width: `${v}%`, height: '100%', borderRadius: radio.pill, backgroundColor: color }} />
      </View>
      {marca != null && (
        <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, marca))}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colores.marinoProfundo, borderRadius: 1 }} />
      )}
    </View>
  );
}
