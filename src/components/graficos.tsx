import { Animated, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { colores, degradadoMarca, fondos, fuentes, radio } from '../tema';
import { NumeroAnimado, useLlenado } from './movimiento';

const CirculoAnimado = Animated.createAnimatedComponent(Circle);

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

/**
 * Fondo de las cabeceras: degradado azul con dos ondas claras que bajan
 * desde la derecha. Va detrás del contenido, del tamaño de la cabecera.
 */
export function FondoOndas({ ancho, alto }: { ancho: number; alto: number }) {
  const w = ancho;
  const h = alto;
  return (
    <Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="ceqFondo" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={degradadoMarca.desde} />
          <Stop offset="1" stopColor={degradadoMarca.hasta} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#ceqFondo)" />
      <Path d={`M ${w * 0.35} ${h} C ${w * 0.6} ${h * 0.72}, ${w * 0.78} ${h * 0.95}, ${w} ${h * 0.5} L ${w} ${h} Z`} fill="#FFFFFF" fillOpacity={0.07} />
      <Path d={`M ${w * 0.55} 0 C ${w * 0.7} ${h * 0.35}, ${w * 0.9} ${h * 0.15}, ${w} ${h * 0.42} L ${w} 0 Z`} fill="#FFFFFF" fillOpacity={0.06} />
      <Path d={`M 0 ${h * 0.82} C ${w * 0.3} ${h * 0.62}, ${w * 0.55} ${h * 1.02}, ${w} ${h * 0.7}`} stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

/** Anillo de progreso con el porcentaje en el centro. */
export function AnilloProgreso({ porcentaje, tamano = 120, grosor = 11, color = colores.marino, fondo = fondos.cielo, colorTexto = colores.marino, etiqueta }: {
  porcentaje: number; tamano?: number; grosor?: number; color?: string; fondo?: string; colorTexto?: string; etiqueta?: string;
}) {
  const r = (tamano - grosor) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, porcentaje));
  const llenado = useLlenado(p, 1100, 150);
  return (
    <View style={{ width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p }}>
      <Svg width={tamano} height={tamano} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={tamano / 2} cy={tamano / 2} r={r} stroke={fondo} strokeWidth={grosor} fill="none" />
        <CirculoAnimado
          cx={tamano / 2} cy={tamano / 2} r={r} stroke={color} strokeWidth={grosor} fill="none"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={llenado.interpolate({ inputRange: [0, 100], outputRange: [circ, 0] })} strokeLinecap="round"
        />
      </Svg>
      <NumeroAnimado valor={p} decimales={Number.isInteger(p) ? 0 : 1} sufijo=" %" estilo={{ fontFamily: fuentes.bold, fontSize: tamano * 0.22, color: colorTexto, letterSpacing: -0.5 }}>
        <Text style={{ fontSize: tamano * 0.12 }}>%</Text>
      </NumeroAnimado>
      {etiqueta ? <Text style={{ fontFamily: fuentes.medium, fontSize: Math.max(10, tamano * 0.085), color: colorTexto, opacity: 0.75, marginTop: -2 }}>{etiqueta}</Text> : null}
    </View>
  );
}

/** Barra de progreso horizontal, con marca opcional (ej. el mínimo para firmar). */
export function BarraProgreso({ valor, marca, color = colores.marino, fondo = fondos.cielo, alto = 8 }: {
  valor: number | null; marca?: number | null; color?: string; fondo?: string; alto?: number;
}) {
  const v = Math.max(0, Math.min(100, valor ?? 0));
  const llenado = useLlenado(v, 800, 200);
  return (
    <View style={{ height: alto + 6, justifyContent: 'center' }}>
      <View style={{ height: alto, borderRadius: radio.pill, backgroundColor: fondo, overflow: 'hidden' }}>
        <Animated.View style={{ width: llenado.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), height: '100%', borderRadius: radio.pill, backgroundColor: color }} />
      </View>
      {marca != null && (
        <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, marca))}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colores.marinoProfundo, borderRadius: 1 }} />
      )}
    </View>
  );
}
