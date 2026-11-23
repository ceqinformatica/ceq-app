import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { FichaMateria, LeyendaMalla, nombreSemestre, nota, type EstadoVisual } from '../../components/academico';
import { useDisposicion } from '../../components/disposicion';
import { AnilloProgreso, BarraProgreso } from '../../components/graficos';
import { Boton, CabeceraMarca, Cargando, Chip, Dato, EstadoVacio, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { cargarMalla, guardarEstadosEnBloque, type CambioEstado } from '../../datos/academico';
import { usarDatos } from '../../datos/usarDatos';
import { promedios } from '../../lib/finales';
import { calcularProgreso, promedioGeneral, requisitosFaltantes } from '../../lib/progreso';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../../tema';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';

type Filtro = 'todas' | 'disponibles' | 'cursando' | 'aprobadas' | 'optativas';
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'disponibles', texto: 'Puedo cursar' },
  { valor: 'cursando', texto: 'Cursando' },
  { valor: 'aprobadas', texto: 'Aprobadas' },
  { valor: 'optativas', texto: 'Optativas' },
];

/** Las optativas van en su propio bloque, al final, aunque la malla las ubique en un nivel. */
const OPTATIVAS = 0;

export default function Carrera() {
  useTema();
  // Materias por fila: 2 en el celular, 3 o 4 en tablet.
  const { dosColumnas, barraLateral } = useDisposicion();
  const porFila = barraLateral ? 4 : dosColumnas ? 3 : 2;
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos: malla, cargando, error, refrescando, recargar, setDatos } = usarDatos(() => cargarMalla(planId, perfil?.carrera_id), [planId, perfil?.carrera_id]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  /** null = modo normal; un Set = modo "Marcar varias" con las materias elegidas. */
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; deshacer?: CambioEstado[]; error?: boolean } | null>(null);

  // Al salir de la pestaña se descarta el "Deshacer": si después se cambia una
  // materia a mano, deshacer pisaría ese cambio.
  useFocusEffect(
    useCallback(() => () => {
      setAviso(null);
      setSeleccion(null);
    }, []),
  );

  const aprobada = (id: string) => malla?.estados.get(id)?.estado === 'aprobada';
  const elegibles = (filtroM: (m: { semestre: number; grupo_optativa_id: string | null }) => boolean) =>
    (malla?.materiasDb ?? []).filter((m) => !aprobada(m.id) && filtroM(m)).map((m) => m.id);

  const empezarSeleccion = () => {
    setFiltro('todas');
    setAviso(null);
    setSeleccion(new Set());
  };
  const alternar = (id: string) =>
    setSeleccion((sel) => {
      if (!sel) return sel;
      const n = new Set(sel);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** Obligatorias de los niveles 1 a N (las optativas se eligen una por una). */
  const hastaNivel = (n: number) => setSeleccion((sel) => new Set([...(sel ?? []), ...elegibles((m) => m.semestre <= n && !m.grupo_optativa_id)]));
  /** Niveles con obligatorias, en orden. */
  const niveles = useMemo(
    () => [...new Set((malla?.materiasDb ?? []).filter((m) => !m.grupo_optativa_id).map((m) => m.semestre))].sort((a, b) => a - b),
    [malla],
  );
  /** Hasta qué nivel están todas las obligatorias aprobadas o elegidas (0 = ninguno). */
  const nivelCompleto = useMemo(() => {
    if (!seleccion || !malla) return 0;
    // El último nivel completo en el que elegiste algo ahora: los niveles que
    // ya estaban aprobados de antes no cuentan solos.
    let ultimo = 0;
    for (const n of niveles) {
      const delNivel = malla.materiasDb.filter((m) => m.semestre === n && !m.grupo_optativa_id);
      if (!delNivel.every((m) => aprobada(m.id) || seleccion.has(m.id))) break;
      if (delNivel.some((m) => seleccion.has(m.id))) ultimo = n;
    }
    return ultimo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, malla, niveles]);
  /** Saca de la selección las obligatorias desde el nivel n en adelante. */
  const quitarDesdeNivel = (n: number) =>
    setSeleccion((sel) => {
      if (!sel) return sel;
      const quitar = new Set(elegibles((m) => m.semestre >= n && !m.grupo_optativa_id));
      return new Set([...sel].filter((id) => !quitar.has(id)));
    });
  const semestreCompleto = (sem: number) => {
    const ids = elegibles((m) => m.semestre === sem && !m.grupo_optativa_id);
    setSeleccion((sel) => {
      const n = new Set(sel ?? []);
      const todas = ids.length > 0 && ids.every((id) => n.has(id));
      ids.forEach((id) => (todas ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  /** Aplica cambios a la malla en pantalla sin volver a cargar. */
  const aplicar = (cambios: CambioEstado[]) => {
    setDatos((actual) => {
      if (!actual) return actual;
      const estados = new Map(actual.estados);
      for (const c of cambios) {
        if (c.estado === 'pendiente') estados.delete(c.materiaId);
        else estados.set(c.materiaId, { estado: c.estado, notaFinal: c.notaFinal });
      }
      return { ...actual, estados };
    });
  };

  const marcarAprobadas = async () => {
    if (!malla || !seleccion?.size) return;
    const ids = [...seleccion];
    const previos: CambioEstado[] = ids.map((id) => {
      const e = malla.estados.get(id);
      return { materiaId: id, estado: e?.estado ?? 'pendiente', notaFinal: e?.notaFinal ?? null };
    });
    const cambios: CambioEstado[] = ids.map((id) => ({ materiaId: id, estado: 'aprobada', notaFinal: null }));
    setGuardando(true);
    try {
      await guardarEstadosEnBloque(cambios);
      aplicar(cambios);
      setSeleccion(null);
      setAviso({ texto: `Marcaste ${ids.length} ${ids.length === 1 ? 'materia' : 'materias'} como aprobadas. La nota la podés cargar después en cada una.`, deshacer: previos });
    } catch (e) {
      setAviso({ texto: textoError(e, 'No se pudo guardar.'), error: true });
    } finally {
      setGuardando(false);
    }
  };

  const deshacer = async (previos: CambioEstado[]) => {
    setGuardando(true);
    try {
      await guardarEstadosEnBloque(previos);
      aplicar(previos);
      setAviso({ texto: 'Listo, volvió todo como estaba.' });
    } catch (e) {
      setAviso({ texto: textoError(e, 'No se pudo deshacer.'), error: true });
    } finally {
      setGuardando(false);
    }
  };

  const vista = useMemo(() => {
    if (!malla) return null;
    const progreso = calcularProgreso(malla.materias, malla.grupos, malla.estados, malla.unidad);
    // Promedio sin aplazos (nota con la que aprobó) y con aplazos (todos los finales).
    const prom = promedios(malla.materias, malla.estados, malla.intentos);
    const promedio = malla.intentos.length ? prom.sinAplazos : promedioGeneral(malla.materias, malla.estados);
    const cursando = malla.materias.filter((m) => malla.estados.get(m.id)?.estado === 'cursando').length;
    const estadoDe = (id: string): { estado: EstadoVisual; faltan: number } => {
      const e = malla.estados.get(id)?.estado ?? 'pendiente';
      if (e !== 'pendiente') return { estado: e, faltan: 0 };
      const faltan = requisitosFaltantes(id, malla.prerrequisitos, malla.estados).length;
      return { estado: faltan ? 'bloqueada' : 'pendiente', faltan };
    };
    const semestres = new Map<number, typeof malla.materiasDb>();
    for (const m of malla.materiasDb) {
      const { estado } = estadoDe(m.id);
      const optativa = m.grupo_optativa_id != null;
      const pasa =
        filtro === 'todas' ||
        (filtro === 'optativas' && optativa) ||
        (filtro === 'disponibles' && estado === 'pendiente') ||
        (filtro === 'cursando' && estado === 'cursando') ||
        (filtro === 'aprobadas' && estado === 'aprobada');
      if (!pasa) continue;
      const clave = optativa ? OPTATIVAS : m.semestre;
      semestres.set(clave, [...(semestres.get(clave) ?? []), m]);
    }
    // Niveles en orden y las optativas al final.
    const orden = (n: number) => (n === OPTATIVAS ? Infinity : n);
    return { progreso, promedio, prom, cursando, estadoDe, semestres: [...semestres.entries()].sort((a, b) => orden(a[0]) - orden(b[0])) };
  }, [malla, filtro]);

  const sub = [malla?.carrera, malla?.plan?.nombre].filter(Boolean).join(' · ') || 'Tu malla y tu avance';

  return (
    <View style={{ flex: 1, backgroundColor: fondos.fondo }}>
    <Pantalla cabecera={<CabeceraMarca titulo="Mi carrera" sub={sub} />} refrescando={refrescando} onRefrescar={recargar}>
      {cargando && !malla ? (
        <Tarjeta estilo={{ marginTop: -espacio.xxl }}><Cargando texto="Cargando tu malla…" /></Tarjeta>
      ) : error && !malla ? (
        <Tarjeta estilo={{ marginTop: -espacio.xxl }}>
          <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tu malla" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} />
        </Tarjeta>
      ) : malla && vista && malla.materias.length === 0 ? (
        <Tarjeta estilo={{ marginTop: -espacio.xxl }}>
          <EstadoVacio icono="construct-outline" titulo="Malla en preparación" texto="El CEQ todavía está cargando las materias de tu plan. Volvé a mirar pronto." />
        </Tarjeta>
      ) : malla && vista ? (
        <>
          <Tarjeta estilo={{ marginTop: -espacio.xxl }} onPress={() => router.push('/estadisticas')} etiqueta="Ver promedio y estadísticas">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.l }}>
              <AnilloProgreso porcentaje={vista.progreso.porcentaje} tamano={112} etiqueta="de la carrera" />
              <View style={{ flex: 1, gap: espacio.m }}>
                <View style={{ flexDirection: 'row' }}>
                  <Dato valor={`${vista.progreso.obligatoriasAprobadas}/${vista.progreso.obligatoriasTotales}`} etiqueta="Obligatorias" />
                  <Dato valor={nota(vista.promedio)} etiqueta={vista.prom.aplazos ? `Promedio · ${nota(vista.prom.conAplazos)} con aplazos` : 'Promedio'} />
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <Dato valor={String(vista.cursando)} etiqueta="Cursando" color={colores.amarillo} />
                  <Dato
                    valor={vista.progreso.optativas.reduce((a, o) => a + Math.min(o.aprobadas, o.exigidas), 0) + '/' + vista.progreso.optativas.reduce((a, o) => a + o.exigidas, 0)}
                    etiqueta="Optativas"
                  />
                </View>
              </View>
            </View>
            <View style={est.verEstadisticas}>
              <Ionicons name="stats-chart" size={15} color={colores.azul} />
              <Text style={[s.enlace, { flex: 1 }]}>Ver promedio y estadísticas</Text>
              <Ionicons name="chevron-forward" size={16} color={colores.azul} />
            </View>
          </Tarjeta>

          {vista.progreso.optativas.length > 0 && (
            <Tarjeta variante="celeste">
              {vista.progreso.optativas.map((o) => (
                <View key={o.grupo.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[s.filaTitulo, { color: colores.marino }]}>{o.grupo.nombre}</Text>
                    <Text style={s.filaDetalle}>{Math.min(o.aprobadas, o.exigidas)} de {o.exigidas}</Text>
                  </View>
                  <BarraProgreso valor={(Math.min(o.aprobadas, o.exigidas) / Math.max(1, o.exigidas)) * 100} fondo={fondos.superficieBlanca} />
                </View>
              ))}
            </Tarjeta>
          )}

          {aviso && (
            <Tarjeta variante="celeste" estilo={aviso.error ? { backgroundColor: fondos.rojoFondo } : undefined}>
              <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'flex-start' }}>
                <Ionicons name={aviso.error ? 'alert-circle' : 'checkmark-circle'} size={20} color={aviso.error ? colores.rojo : colores.verde} />
                <Text style={[s.cuerpo, { flex: 1, fontSize: 14 }]} accessibilityLiveRegion="polite">{aviso.texto}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: espacio.s, marginTop: espacio.s }}>
                {aviso.deshacer && <Boton texto="Deshacer" variante="fantasma" compacto icono="arrow-undo" cargando={guardando} onPress={() => deshacer(aviso.deshacer!)} />}
                <Boton texto="Cerrar" variante="fantasma" compacto onPress={() => setAviso(null)} />
              </View>
            </Tarjeta>
          )}

          {seleccion ? (
            <Tarjeta>
              <Text style={[s.filaTitulo, { color: colores.marino }]}>Marcá las que ya aprobaste</Text>
              <Text style={[s.filaDetalle, { marginTop: 2, marginBottom: espacio.m }]}>
                Tocá cada materia, o elegí hasta qué nivel aprobaste todo. Las optativas se eligen una por una.
              </Text>
              <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Aprobé todo hasta el nivel</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s }}>
                {niveles.map((n) => {
                  const elegido = n <= nivelCompleto;
                  return (
                    <Chip
                      key={n}
                      texto={`${n}º`}
                      icono={elegido ? 'checkmark' : undefined}
                      elegido={elegido}
                      onPress={() => (elegido ? quitarDesdeNivel(n) : hastaNivel(n))}
                    />
                  );
                })}
              </View>
              <Text style={[s.filaDetalle, { marginTop: espacio.s }]} accessibilityLiveRegion="polite">
                {seleccion.size
                  ? `${nivelCompleto > 0 ? `Todo hasta ${nivelCompleto}º nivel. ` : ''}${seleccion.size} ${seleccion.size === 1 ? 'materia elegida' : 'materias elegidas'}.${nivelCompleto > 0 ? ' Tocá un nivel marcado para sacarlo.' : ''}`
                  : 'Todavía no elegiste ninguna.'}
              </Text>
            </Tarjeta>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginTop: espacio.s, marginBottom: espacio.m }}>
                {FILTROS.map((f) => (
                  <Chip key={f.valor} texto={f.texto} elegido={filtro === f.valor} onPress={() => setFiltro(f.valor)} />
                ))}
              </View>
              <Tarjeta variante="borde" onPress={empezarSeleccion} etiqueta="Marcar varias materias aprobadas">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
                  <View style={est.icono}><Ionicons name="checkbox-outline" size={20} color={colores.marino} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.filaTitulo, { color: colores.marino }]}>Marcar varias aprobadas</Text>
                    <Text style={s.filaDetalle}>Si ya avanzaste en la carrera, cargalas de una vez.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
                </View>
              </Tarjeta>
              <Tarjeta variante="borde" onPress={() => router.push('/extracto')} etiqueta="Importar extracto del EALU">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
                  <View style={est.icono}><Ionicons name="document-text-outline" size={20} color={colores.marino} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.filaTitulo, { color: colores.marino }]}>Importar extracto del EALU</Text>
                    <Text style={s.filaDetalle}>Subí el PDF de notas finales y cargamos tus aprobadas con nota.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
                </View>
              </Tarjeta>
            </>
          )}
          <LeyendaMalla />
          {error && <Mensaje texto={error} />}

          {vista.semestres.length === 0 && (
            <EstadoVacio icono="filter-outline" titulo="Nada por acá" texto="No hay materias con este filtro." />
          )}

          {vista.semestres.map(([sem, materias]) => {
            const aprobadas = materias.filter((m) => malla.estados.get(m.id)?.estado === 'aprobada').length;
            const obligSem = materias.filter((m) => !m.grupo_optativa_id && !aprobada(m.id)).map((m) => m.id);
            const semCompleto = obligSem.length > 0 && obligSem.every((id) => seleccion?.has(id));
            const filas: (typeof materias)[] = [];
            for (let i = 0; i < materias.length; i += porFila) filas.push(materias.slice(i, i + porFila));
            return (
              <View key={sem} style={{ marginBottom: espacio.s }}>
                <Seccion
                  accion={
                    seleccion && obligSem.length > 0
                      ? { texto: semCompleto ? 'Quitar' : 'Todo el semestre', onPress: () => semestreCompleto(sem) }
                      : undefined
                  }
                >
                  {sem === OPTATIVAS ? 'Optativas' : nombreSemestre(sem)}
                  <Text style={{ fontFamily: fuentes.regular, fontSize: 13, color: colores.textoSuave }}>{'   '}{aprobadas}/{materias.length} aprobadas</Text>
                </Seccion>
                {filas.map((fila, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s }}>
                    {fila.map((m) => {
                      const { estado, faltan } = vista.estadoDe(m.id);
                      return (
                        <FichaMateria
                          key={m.id}
                          nombre={m.nombre}
                          codigo={m.grupo_optativa_id ? `${m.semestre}º NIVEL` : m.codigo}
                          estado={estado}
                          faltan={faltan}
                          notaFinal={malla.estados.get(m.id)?.notaFinal}
                          seleccionada={seleccion && !aprobada(m.id) ? seleccion.has(m.id) : undefined}
                          onPress={() => (seleccion ? !aprobada(m.id) && alternar(m.id) : router.push(`/materia/${m.id}`))}
                        />
                      );
                    })}
                    {Array.from({ length: porFila - fila.length }, (_, j) => <View key={`v${j}`} style={{ flex: 1 }} />)}
                  </View>
                ))}
              </View>
            );
          })}
          {seleccion && <View style={{ height: 80 }} />}
        </>
      ) : null}
    </Pantalla>

      {seleccion && (
        <View style={est.barra}>
          <Pressable onPress={() => setSeleccion(null)} accessibilityRole="button" accessibilityLabel="Cancelar" style={est.cancelar} hitSlop={6}>
            <Text style={[s.enlace, { color: colores.celeste }]}>Cancelar</Text>
          </Pressable>
          <Boton
            texto={seleccion.size ? `Marcar ${seleccion.size} aprobadas` : 'Elegí materias'}
            variante="claro"
            icono="checkmark-done"
            compacto
            cargando={guardando}
            deshabilitado={!seleccion.size}
            onPress={marcarAprobadas}
            estilo={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}

const est = crearEstilos(() => ({
  icono: { width: 38, height: 38, borderRadius: 12, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  barra: {
    position: 'absolute', left: espacio.l, right: espacio.l, bottom: espacio.l, flexDirection: 'row', alignItems: 'center', gap: espacio.m,
    backgroundColor: fondos.marino, borderRadius: radio.l, padding: espacio.s, paddingLeft: espacio.l, ...sombras.fuerte,
  },
  cancelar: { paddingVertical: espacio.s },
  verEstadisticas: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.m, paddingTop: espacio.m, borderTopWidth: 1, borderTopColor: colores.lineaSuave },
}));
