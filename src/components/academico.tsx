import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ResultadoFirma, Semaforo } from '../lib/firma';
import type { EstadoMateria } from '../lib/progreso';
import { colores, coloresEstado, coloresSemaforo, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../tema';
import { Insignia, type NombreIcono } from './ui';
import { PressableAnimado, useAparecer, usePresion, vibrar } from './movimiento';

export type EstadoVisual = EstadoMateria | 'bloqueada';

export const nombreSemestre = (n: number) => `${n}º semestre`;

/** Formatea un porcentaje con coma decimal: 72,5 %. */
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} %`);
export const nota = (n: number | null | undefined) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));

/** Ficha de una materia en la malla. */
export function FichaMateria({ nombre, codigo, estado, notaFinal, faltan, onPress, seleccionada, retraso = 0 }: {
  nombre: string; codigo?: string | null; estado: EstadoVisual; notaFinal?: number | null; faltan?: number; onPress: () => void;
  /** En modo "Marcar varias": undefined = modo normal; true/false = casilla marcada o no. */
  seleccionada?: boolean;
  /** ms antes de aparecer (las fichas entran escalonadas). */
  retraso?: number;
}) {
  const c = coloresEstado[estado];
  const modoSeleccion = seleccionada !== undefined;
  const { opacity, translateY } = useAparecer(retraso, 10);
  const { escala, onPressIn, onPressOut } = usePresion(0.95);
  return (
    <PressableAnimado
      onPress={() => { vibrar(); onPress(); }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole={modoSeleccion ? 'checkbox' : 'button'}
      accessibilityState={modoSeleccion ? { checked: seleccionada } : undefined}
      accessibilityLabel={`${nombre}, ${c.nombre}${notaFinal != null ? `, nota ${notaFinal}` : ''}`}
      style={[
        est.ficha,
        estado === 'bloqueada' && { backgroundColor: fondos.grisFondo },
        seleccionada && { borderColor: colores.marino, borderWidth: 2, backgroundColor: fondos.cielo },
        { opacity, transform: [{ translateY }, { scale: escala }] },
      ]}
    >
      <View style={est.fichaArriba}>
        <Text style={est.codigo} numberOfLines={1}>{codigo ?? ''}</Text>
        {modoSeleccion ? (
          <View style={[est.casilla, seleccionada && { backgroundColor: fondos.marino, borderColor: colores.marino }]}>
            {seleccionada && <Ionicons name="checkmark" size={15} color={colores.blanco} />}
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={17} color={colores.textoTenue} />
        )}
      </View>
      <Text style={[est.fichaNombre, estado === 'bloqueada' && { color: colores.gris }]} numberOfLines={3}>{nombre}</Text>
      <View style={est.fichaPie}>
        <Ionicons name={c.icono as NombreIcono} size={16} color={c.texto} />
        <Text style={[est.fichaEstado, { color: c.texto }]} numberOfLines={1}>
          {estado === 'bloqueada' && faltan ? `Faltan ${faltan}` : c.nombre}
        </Text>
        {notaFinal != null ? <Text style={est.notaTexto}>Nota {nota(notaFinal)}</Text> : null}
      </View>
    </PressableAnimado>
  );
}

export function InsigniaSemaforo({ semaforo, firma }: { semaforo: Semaforo; firma?: boolean }) {
  if (firma) return <Insignia texto="Tenés firma" color={colores.verde} fondo={fondos.verdeFondo} icono="checkmark-circle" />;
  const c = coloresSemaforo[semaforo];
  const icono: Record<Semaforo, NombreIcono> = { verde: 'trending-up', amarillo: 'warning', rojo: 'close-circle', sin_datos: 'remove-circle-outline' };
  return <Insignia texto={c.nombre} color={c.texto} fondo={c.fondo} icono={icono[semaforo]} />;
}

/**
 * Semáforo para mostrar: el peor de los componentes que ya tienen datos.
 * (Un componente sin cargar no debería tapar que el resto va bien.)
 */
export function semaforoVisible(r: ResultadoFirma): Semaforo {
  if (r.firma) return 'verde';
  const partes = [r.teoria.semaforo, r.laboratorio?.semaforo, r.asistencia.semaforo, r.asistenciaLab?.semaforo].filter(
    (x): x is Semaforo => x != null && x !== 'sin_datos',
  );
  if (!partes.length) return 'sin_datos';
  if (partes.includes('rojo')) return 'rojo';
  if (partes.includes('amarillo')) return 'amarillo';
  return 'verde';
}

/** Frase corta que resume el resultado de firma. */
export function resumenFirma(r: ResultadoFirma): string {
  if (r.firma) return 'Hoy cumplís todo lo que pide la firma. Mantené la asistencia.';
  if (r.teoria.imposible || r.laboratorio?.imposible) return 'Con lo que falta ya no llegás al mínimo.';
  if (r.asistencia.faltasDisponibles != null && r.asistencia.faltasDisponibles < 0) return 'Superaste el límite de faltas.';
  const partes: string[] = [];
  if (r.teoria.necesario != null && !r.teoria.asegurado) partes.push(`${pct(r.teoria.necesario)} en lo que falta de teoría`);
  if (r.laboratorio?.necesario != null && !r.laboratorio.asegurado) partes.push(`${pct(r.laboratorio.necesario)} en laboratorio`);
  if (partes.length) return `Necesitás ${partes.join(' y ')}.`;
  if (r.teoria.actual == null) return 'Cargá tus notas para ver cómo vas.';
  return 'Seguí así.';
}

/** Leyenda de colores de la malla. */
export function LeyendaMalla() {
  const items: EstadoVisual[] = ['aprobada', 'firmada', 'cursando', 'pendiente', 'bloqueada'];
  return (
    <View style={est.leyenda}>
      {items.map((e) => (
        <View key={e} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={[est.leyendaPunto, { backgroundColor: coloresEstado[e].fondo, borderColor: coloresEstado[e].borde }]} />
          <Text style={est.leyendaTexto}>{coloresEstado[e].nombre}</Text>
        </View>
      ))}
    </View>
  );
}

/** Selector de estado de una materia (4 opciones con su color). */
export function SelectorEstado({ valor, onCambio, bloqueada, sinFirma }: {
  valor: EstadoMateria;
  onCambio: (e: EstadoMateria) => void;
  bloqueada?: boolean;
  /** Seminarios: no tienen firma ni final, solo cursando o aprobado. */
  sinFirma?: boolean;
}) {
  const opciones: EstadoMateria[] = sinFirma && valor !== 'firmada' ? ['pendiente', 'cursando', 'aprobada'] : ['pendiente', 'cursando', 'firmada', 'aprobada'];
  return (
    <View style={est.selector}>
      {opciones.map((o) => {
        const c = coloresEstado[o];
        const activo = o === valor;
        const deshabilitado = bloqueada && o !== 'pendiente' && !activo;
        return (
          <Pressable
            key={o}
            onPress={() => onCambio(o)}
            disabled={deshabilitado}
            accessibilityRole="radio"
            accessibilityState={{ checked: activo, disabled: deshabilitado }}
            accessibilityLabel={c.nombre}
            style={[est.selectorOpcion, activo && { backgroundColor: c.fondo, borderColor: c.texto }, deshabilitado && { opacity: 0.4 }]}
          >
            <Ionicons name={c.icono as NombreIcono} size={20} color={activo ? c.texto : colores.textoTenue} />
            <Text style={[est.selectorTexto, activo && { color: c.texto, fontFamily: fuentes.semibold }]}>{c.nombre}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const est = crearEstilos(() => ({
  ficha: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 118, borderRadius: radio.l, borderWidth: 1, borderColor: colores.linea, backgroundColor: fondos.superficieBlanca, padding: espacio.m, gap: 6 },
  casilla: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colores.linea, backgroundColor: fondos.superficieBlanca, alignItems: 'center', justifyContent: 'center' },
  fichaArriba: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codigo: { flex: 1, fontFamily: fuentes.semibold, fontSize: 11.5, letterSpacing: 0.5, color: colores.textoSuave },
  fichaNombre: { fontFamily: fuentes.semibold, fontSize: 16, lineHeight: 21, color: colores.texto },
  fichaPie: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: espacio.s, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colores.lineaSuave },
  fichaEstado: { flex: 1, fontFamily: fuentes.medium, fontSize: 12.5 },
  notaTexto: { fontFamily: fuentes.bold, fontSize: 12.5, color: colores.marino },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.m, marginBottom: espacio.m },
  leyendaPunto: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  leyendaTexto: { fontFamily: fuentes.regular, fontSize: 12, color: colores.textoSuave },
  selector: { flexDirection: 'row', gap: espacio.s },
  selectorOpcion: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: espacio.m, borderRadius: radio.m, borderWidth: 1.5,
    borderColor: colores.lineaSuave, backgroundColor: fondos.superficieBlanca,
  },
  selectorTexto: { fontFamily: fuentes.medium, fontSize: 11.5, color: colores.textoSuave, textAlign: 'center' },
}));
