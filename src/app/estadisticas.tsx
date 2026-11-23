import { router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { nombreSemestre } from '../components/academico';
import { AnilloProgreso, BarraProgreso } from '../components/graficos';
import { BarraSuperior, Boton, Cargando, Dato, EstadoVacio, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { cargarMalla } from '../datos/academico';
import { usarDatos } from '../datos/usarDatos';
import { calcularEstadisticas } from '../lib/estadisticas';
import { colores, espacio, fuentes, radio } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/carrera'));

const UNIDAD: Record<string, string> = { creditos: 'créditos', horas: 'horas' };
/** Promedio siempre con dos decimales: "4,00". */
const prom2 = (n: number | null) => (n == null ? '—' : n.toFixed(2).replace('.', ','));
const numero = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const listaNiveles = (ns: number[]) => {
  const t = ns.map((n) => `${n}º`);
  return t.length > 1 ? `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}` : t[0] ?? '';
};
/** Color de una nota de 1 a 5. */
const colorNota = (n: number | null) => (n == null ? colores.textoTenue : n >= 4 ? colores.verde : n >= 3 ? colores.azul : n >= 2 ? colores.amarillo : colores.rojo);

export default function Estadisticas() {
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos: malla, cargando, error, refrescando, recargar } = usarDatos(() => cargarMalla(planId, perfil?.carrera_id), [planId, perfil?.carrera_id]);

  const columnas = useRef<ScrollViewInstance>(null);
  const e = useMemo(
    () => (malla ? calcularEstadisticas(malla.materias, malla.grupos, malla.estados, malla.intentos, malla.unidad) : null),
    [malla],
  );

  if (cargando && !malla) {
    return <Pantalla><BarraSuperior titulo="Estadísticas" onVolver={volver} /><Cargando texto="Calculando tus estadísticas…" /></Pantalla>;
  }
  if (!malla || !e) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Estadísticas" onVolver={volver} />
        <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tus datos" texto={error ?? undefined} accion={{ texto: 'Reintentar', onPress: recargar }} />
      </Pantalla>
    );
  }
  if (malla.materias.length === 0) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Estadísticas" onVolver={volver} />
        <EstadoVacio icono="construct-outline" titulo="Malla en preparación" texto="Cuando el CEQ cargue las materias de tu plan vas a ver acá tus estadísticas." />
      </Pantalla>
    );
  }

  const unidad = UNIDAD[e.progreso.unidad];
  const maxDist = Math.max(1, ...e.distribucion.map((d) => d.cantidad));
  const optFaltan = e.progreso.optativas.reduce((a, o) => a + Math.max(0, o.exigidas - o.aprobadas), 0);
  const oblFaltan = e.faltan - optFaltan;

  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Estadísticas" onVolver={volver} />

      {/* Resumen: avance y promedio. En pantallas anchas (tablet) se ponen lado a lado. */}
      <View style={est.grilla}>
        <Tarjeta estilo={est.celda}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.l }}>
            <AnilloProgreso porcentaje={e.progreso.porcentaje} tamano={104} etiqueta="de la carrera" />
            <View style={{ flex: 1, gap: espacio.xs }}>
              <Text style={s.etiqueta}>Avance</Text>
              <Text style={[s.cuerpo, { color: colores.texto }]}>
                {e.exigidas - e.faltan} de {e.exigidas} materias
                {unidad ? `\n${numero(e.progreso.aprobado)} de ${numero(e.progreso.total)} ${unidad}` : ''}
              </Text>
            </View>
          </View>
        </Tarjeta>
        <Tarjeta variante="marino" estilo={est.celda}>
          <Text style={[s.etiqueta, { color: colores.celesteVivo }]}>Promedio general</Text>
          <Text style={est.promedio} accessibilityLabel={`Promedio general ${prom2(e.promedio)}`}>{prom2(e.promedio)}</Text>
          <Text style={[s.filaDetalle, { color: colores.celeste }]}>
            {e.promedio == null
              ? 'Todavía no cargaste notas de materias aprobadas.'
              : [
                  e.aplazos ? `${prom2(e.promedioConAplazos)} con aplazos (${e.aplazos})` : 'Sin aplazos',
                  e.promedioPonderado != null ? `${prom2(e.promedioPonderado)} ponderado por ${unidad}` : null,
                ].filter(Boolean).join(' · ')}
          </Text>
        </Tarjeta>
      </View>

      <Tarjeta>
        <View style={est.datos}>
          <Dato valor={String(e.aprobadas)} etiqueta="Aprobadas" color={colores.verde} estilo={est.dato} />
          <Dato valor={String(e.firmadas)} etiqueta="Firmadas" color={colores.azulHover} estilo={est.dato} />
          <Dato valor={String(e.cursando)} etiqueta="Cursando" color={colores.amarillo} estilo={est.dato} />
          <Dato valor={String(e.faltan)} etiqueta="Faltan" estilo={est.dato} />
        </View>
        <View style={[est.datos, { marginTop: espacio.l }]}>
          <Dato valor={String(e.finalesRendidos)} etiqueta="Finales rendidos" estilo={est.dato} />
          <Dato valor={e.efectividad == null ? '—' : `${e.efectividad}%`} etiqueta="Finales aprobados" estilo={est.dato} />
          <Dato valor={String(e.aplazos)} etiqueta="Aplazos" color={e.aplazos ? colores.rojo : colores.marino} estilo={est.dato} />
          <Dato valor={e.promedioFirma == null ? '—' : `${numero(e.promedioFirma)}%`} etiqueta="Promedio de firma" estilo={est.dato} />
        </View>
      </Tarjeta>

      <Seccion>Cuánto te falta</Seccion>
      <Tarjeta variante="celeste">
        {e.faltan === 0 ? (
          <Text style={s.cuerpo}>¡Aprobaste todas las materias de tu plan! Ya podés averiguar el trámite de título.</Text>
        ) : (
          <Text style={s.cuerpo}>
            Te {e.faltan === 1 ? 'falta' : 'faltan'} <Text style={est.fuerte}>{e.faltan} {e.faltan === 1 ? 'materia' : 'materias'}</Text>
            {optFaltan > 0 ? ` (${oblFaltan} ${oblFaltan === 1 ? 'obligatoria' : 'obligatorias'} y ${optFaltan} ${optFaltan === 1 ? 'optativa' : 'optativas'})` : ''}
            {e.nivelesPendientes.length > 0
              ? `. Tenés obligatorias pendientes en ${e.nivelesPendientes.length === 1 ? 'el nivel' : 'los niveles'} ${listaNiveles(e.nivelesPendientes)}.`
              : '.'}
          </Text>
        )}
      </Tarjeta>

      <View style={est.grilla}>
        <View style={est.celda}>
          <Seccion>Tus notas</Seccion>
          <Tarjeta>
            {e.distribucion.every((d) => d.cantidad === 0) ? (
              <Text style={s.filaDetalle}>Cuando cargues notas de materias aprobadas vas a ver cuántas tenés de cada una.</Text>
            ) : (
              [...e.distribucion].reverse().map((d) => (
                <View key={d.nota} style={est.filaBarra} accessibilityLabel={`${d.cantidad} materias con ${d.nota}`}>
                  <View style={[est.notaChip, { backgroundColor: colorNota(d.nota) }]}><Text style={est.notaChipTexto}>{d.nota}</Text></View>
                  <View style={{ flex: 1 }}>
                    <BarraProgreso valor={(d.cantidad / maxDist) * 100} color={colorNota(d.nota)} alto={10} />
                  </View>
                  <Text style={est.cantidad}>{d.cantidad}</Text>
                </View>
              ))
            )}
          </Tarjeta>
        </View>

        <View style={est.celda}>
          <Seccion>Evolución por semestre</Seccion>
          <Tarjeta>
            {e.porPeriodo.length === 0 ? (
              <Text style={s.filaDetalle}>
                Para ver tu evolución, cargá los finales en cada materia con su semestre (o importá tu extracto del EALU).
              </Text>
            ) : (
              <>
                {/* Con muchos semestres se desliza de costado; arranca mostrando los más recientes. */}
                <ScrollView
                  ref={columnas}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  onContentSizeChange={() => columnas.current?.scrollToEnd({ animated: false })}
                  contentContainerStyle={est.columnas}
                  accessibilityRole="summary"
                >
                  {e.porPeriodo.map((p) => (
                    <View key={p.periodo} style={est.columna} accessibilityLabel={`${p.etiqueta}: promedio ${prom2(p.promedio)}, ${p.aprobados} aprobados, ${p.aplazos} aplazos`}>
                      <Text style={[est.cantidad, { color: colorNota(p.promedio) }]} numberOfLines={1}>{prom2(p.promedio)}</Text>
                      <View style={est.columnaFondo}>
                        <View style={[est.columnaRelleno, { height: `${((p.promedio ?? 0) / 5) * 100}%`, backgroundColor: colorNota(p.promedio) }]} />
                      </View>
                      <Text style={est.columnaEtiqueta} numberOfLines={2}>{p.etiqueta}</Text>
                    </View>
                  ))}
                </ScrollView>
                {e.porPeriodo.map((p, i) => (
                  <View key={p.periodo} style={[est.filaPeriodo, i === 0 && { borderTopWidth: 0 }]}>
                    <Text style={[s.filaTitulo, { flex: 1 }]}>{p.etiqueta}</Text>
                    <Text style={s.filaDetalle}>
                      {p.aprobados} {p.aprobados === 1 ? 'aprobado' : 'aprobados'}
                      {p.aplazos ? ` · ${p.aplazos} ${p.aplazos === 1 ? 'aplazo' : 'aplazos'}` : ''} · acumulado {prom2(p.acumulado)}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </Tarjeta>
        </View>
      </View>

      <Seccion>Por nivel</Seccion>
      <Tarjeta>
        {e.porNivel.map((n, i) => (
          <View key={n.nivel} style={[est.filaNivel, i === 0 && { borderTopWidth: 0, paddingTop: 0 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={[s.filaTitulo, { color: colores.marino }]}>{nombreSemestre(n.nivel)}</Text>
              <Text style={s.filaDetalle}>
                {n.aprobadas}/{n.total} aprobadas{n.promedio != null ? ' · promedio ' : ''}
                {n.promedio != null && <Text style={{ fontFamily: fuentes.semibold, color: colorNota(n.promedio) }}>{prom2(n.promedio)}</Text>}
              </Text>
            </View>
            <BarraProgreso valor={(n.aprobadas / Math.max(1, n.total)) * 100} color={n.aprobadas === n.total ? colores.verde : colores.marino} />
          </View>
        ))}
      </Tarjeta>

      <Text style={[s.filaDetalle, { marginTop: espacio.s, marginBottom: espacio.l }]}>
        El promedio usa la nota con la que aprobaste cada materia (escala 1 a 5); los seminarios no llevan nota y no entran.
        &quot;Con aplazos&quot; suma también los finales reprobados. La evolución por semestre solo cuenta los finales cargados con su
        semestre, así que el acumulado puede no coincidir con el promedio general.
      </Text>
      <Boton texto="Ver mi malla" variante="fantasma" icono="grid-outline" onPress={volver} />
    </Pantalla>
  );
}

const est = StyleSheet.create({
  // Dos columnas cuando hay lugar (tablet); una sola en el teléfono.
  grilla: { flexDirection: 'row', flexWrap: 'wrap', columnGap: espacio.l },
  celda: { flexGrow: 1, flexBasis: 320, minWidth: 0 },
  promedio: { fontFamily: fuentes.bold, fontSize: 52, lineHeight: 60, color: colores.blanco, letterSpacing: -1 },
  datos: { flexDirection: 'row', flexWrap: 'wrap', rowGap: espacio.l },
  dato: { fontSize: 22, lineHeight: 26 },
  fuerte: { fontFamily: fuentes.semibold, color: colores.marino },
  filaBarra: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.xs },
  notaChip: { width: 28, height: 28, borderRadius: radio.s, alignItems: 'center', justifyContent: 'center' },
  notaChipTexto: { fontFamily: fuentes.bold, fontSize: 14, color: colores.blanco },
  cantidad: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.marino, minWidth: 24, textAlign: 'center' },
  columnas: { flexGrow: 1, flexDirection: 'row', alignItems: 'flex-end', gap: espacio.s, marginBottom: espacio.m },
  columna: { width: 56, alignItems: 'center', gap: espacio.xs },
  columnaFondo: { width: '70%', height: 110, borderRadius: radio.s, backgroundColor: colores.cielo, justifyContent: 'flex-end', overflow: 'hidden' },
  columnaRelleno: { width: '100%', borderRadius: radio.s },
  columnaEtiqueta: { fontFamily: fuentes.medium, fontSize: 11, lineHeight: 14, color: colores.textoSuave, textAlign: 'center' },
  filaPeriodo: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, paddingVertical: espacio.s, borderTopWidth: 1, borderTopColor: colores.lineaSuave, flexWrap: 'wrap' },
  filaNivel: { gap: espacio.xs, paddingTop: espacio.m, marginTop: espacio.xs, borderTopWidth: 1, borderTopColor: colores.lineaSuave },
});
