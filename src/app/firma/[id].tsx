import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { pct, resumenFirma, semaforoVisible } from '../../components/academico';
import { BarraProgreso } from '../../components/graficos';
import {
  AvisoSinConexion, BarraSuperior, Boton, Campo, Cargando, Chip, Contador, EstadoVacio, Fila, Hoja, Insignia, Mensaje, Pantalla, s, Seccion, Segmentado, Tarjeta,
} from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import {
  aAsistencia, aEvaluacion, borrarEvaluacion, cargarFirmas, cargarMalla, guardarAsistencia, guardarEvaluacion, guardarFirma, REGLA_POR_DEFECTO, reglaDe,
  tieneLab, tipoEvaluacion, type NuevaEvaluacion, type TipoEvaluacion,
} from '../../datos/academico';
import { usarDatos } from '../../datos/usarDatos';
import { contarClasesDe, quitarMateriaDelHorario } from '../../datos/agenda';
import { evaluarFirma, porcentajeEvaluacion, promedioFirma, type ResultadoAsistencia, type ResultadoComponente } from '../../lib/firma';
import { esRecuperatorio, esRegularizacion, puedeRecuperar, RECUPERACION_DESDE, RECUPERACION_MINIMO } from '../../lib/reglamento-fcq';
import type { AsistenciaDb, ComponenteDb, EvaluacionDb } from '../../lib/tipos-db';
import { colores, coloresSemaforo, espacio, fondos, fuentes, radio, texto } from '../../tema';
import { vibrar } from '../../components/movimiento';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';
import { VolverACursar } from '../../components/volver-a-cursar';
import { ASISTENCIA_CUMPLIDA, ASISTENCIA_VACIA, esAsistenciaContada, esAsistenciaCumplida, esPredefinida } from '../../lib/firma-carga';

const ICONO_TIPO: Record<TipoEvaluacion, 'document-text-outline' | 'create-outline' | 'flask-outline' | 'refresh-outline' | 'swap-horizontal-outline'> = {
  parcial: 'document-text-outline',
  tp: 'create-outline',
  laboratorio: 'flask-outline',
  recuperatorio: 'refresh-outline',
  regularizacion: 'swap-horizontal-outline',
};

// Solo parciales y laboratorio: los trabajos prácticos se sacaron porque cada
// docente los cuenta distinto.
const TIPOS: { valor: TipoEvaluacion; texto: string; icono: 'document-text' | 'flask' | 'refresh' | 'swap-horizontal'; nombre: string }[] = [
  { valor: 'parcial', texto: 'Parcial', icono: 'document-text', nombre: '' },
  { valor: 'laboratorio', texto: 'Laboratorio', icono: 'flask', nombre: 'Laboratorio' },
  { valor: 'recuperatorio', texto: 'Recuperatorio', icono: 'refresh', nombre: 'Recuperatorio' },
  { valor: 'regularizacion', texto: 'Regularización', icono: 'swap-horizontal', nombre: 'Regularización' },
];

/** Parcial teórico común (no recuperatorio ni regularización). */
const esParcialTeorico = (e: { nombre: string; componente: string }) => e.componente === 'teoria' && !esRecuperatorio(e) && !esRegularizacion(e);

const MOTIVO_REGULARIZACION = {
  'dos-faltas': 'No cuenta: con dos parciales sin rendir no se puede regularizar (Art. 41)',
  'sin-falta': 'No cuenta: no tenés ningún parcial sin rendir. Dejá como no rendido el parcial al que faltaste',
  'sin-nota': 'Cargá cuánto sacaste',
} as const;

const volver = () => (router.canGoBack() ? router.back() : router.replace('/firma'));

async function cargar(planId: string, materiaId: string) {
  const malla = await cargarMalla(planId);
  const materia = malla.materiasDb.find((m) => m.id === materiaId) ?? null;
  const firmas = await cargarFirmas([materiaId]);
  const regla = reglaDe(malla.reglas, materiaId);
  const estado = malla.estados.get(materiaId);
  return {
    materia, regla: regla ?? REGLA_POR_DEFECTO, reglaOficial: Boolean(regla), firmaGuardada: estado?.promedioFirma ?? null,
    semestreOpuesto: estado?.semestreOpuesto ?? false, recienRecursada: estado?.puedeDeshacerRecursada ?? false, anioPlan: malla.plan?.anio ?? null,
    ...firmas.get(materiaId)!,
  };
}

export default function CalculadoraFirma() {
  useTema();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { perfil } = useSesion();
  const { datos, cargando, error, recargar, setDatos, sinConexion } = usarDatos(() => cargar(perfil?.plan_id ?? '', id ?? ''), [perfil?.plan_id, id], { cache: `firma:${perfil?.plan_id}:${id}` });
  const [editando, setEditando] = useState<EvaluacionDb | 'nueva' | null>(null);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [msgFirma, setMsgFirma] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);
  // Después de guardar la firma: cuántas clases de la materia quedan en la agenda (para preguntar si quitarlas).
  const [clasesEnAgenda, setClasesEnAgenda] = useState(0);
  const [quitando, setQuitando] = useState(false);

  const resultado = useMemo(() => {
    if (!datos?.materia) return null;
    return evaluarFirma({
      // Tras el examen de recuperación alcanza con PG ≥ 50 % (Art. 46).
      regla: datos.regla,
      recuperado: datos.recuperado,
      tieneLaboratorio: tieneLab(datos.evaluacionesDb),
      // Ya viene con el recuperatorio aplicado y los pesos automáticos (todas iguales).
      evaluaciones: datos.evaluaciones,
      asistencia: aAsistencia(datos.asistencia),
      asistenciaLab: aAsistencia(datos.asistenciaLab),
    });
  }, [datos]);

  if (cargando && !datos) return <Pantalla><BarraSuperior titulo="Firma" onVolver={volver} /><Cargando /></Pantalla>;
  if (!datos?.materia || !resultado) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Firma" onVolver={volver} />
        <EstadoVacio icono="help-circle-outline" titulo="No encontramos esta materia" texto={error ?? undefined} accion={{ texto: 'Reintentar', onPress: recargar }} />
      </Pantalla>
    );
  }

  const { materia, regla } = datos;
  const sem = semaforoVisible(resultado);
  const c = coloresSemaforo[sem];
  const tituloEstado = resultado.firma ? '¡Tenés firma!' : c.nombre;
  const conLab = tieneLab(datos.evaluacionesDb);
  const combinado = conLab && regla.modoLaboratorio === 'combinado';
  const cantTeoria = datos.evaluacionesDb.filter(esParcialTeorico).length;
  const tieneRecuperatorio = datos.evaluacionesDb.some(esRecuperatorio);
  const regularizado = datos.regularizacion.regularizado;
  const pendientesTeoria = !regularizado && datos.evaluacionesDb.some((e) => esParcialTeorico(e) && !e.rendida);
  const cantLab = datos.evaluacionesDb.filter((e) => e.componente === 'laboratorio').length;
  const promedio = combinado ? null : promedioFirma(resultado, { recuperado: datos.recuperado });
  const puedeGuardar = resultado.firma && promedio != null;
  // Asistencia cumplida o todavía sin cargar (no se descarta lo que no se sabe).
  const sinFaltaDeAsistencia = [resultado.asistencia, resultado.asistenciaLab].every(
    (a) => a == null || a.porcentaje == null || a.porcentaje >= a.minimo,
  );

  // Ya rindió todo y no le alcanza para la firma: puede volver a cursar (normal u opuesto, Art. 7 c).
  const sinFirmaPosible = !resultado.firma && !datos.evaluacionesDb.some((e) => !e.rendida && !esRecuperatorio(e) && !esRegularizacion(e))
    && (resultado.teoria.imposible || (resultado.laboratorio?.imposible ?? false));

  const guardarMiFirma = async () => {
    if (promedio == null) return;
    setGuardandoFirma(true);
    setMsgFirma(null);
    try {
      await guardarFirma(materia.id, promedio);
      setDatos({ ...datos, firmaGuardada: promedio });
      vibrar('exito');
      setMsgFirma({ tipo: 'exito', texto: `Listo. Tu firma en ${materia.nombre} es ${pct(promedio)}.` });
      // Si la materia tiene clases en la agenda, preguntar si ya terminaron.
      const n = await contarClasesDe(materia.id).catch(() => 0);
      setClasesEnAgenda(n);
    } catch (e) {
      setMsgFirma({ tipo: 'error', texto: textoError(e, 'No se pudo guardar la firma.') });
    } finally {
      setGuardandoFirma(false);
    }
  };

  const quitarDeAgenda = async () => {
    setQuitando(true);
    try {
      await quitarMateriaDelHorario(materia.id);
      setClasesEnAgenda(0);
      setMsgFirma({ tipo: 'exito', texto: `Listo. Tu firma en ${materia.nombre} es ${pct(promedio)} y la quitamos de tu agenda.` });
    } catch (e) {
      setClasesEnAgenda(0);
      setMsgFirma({ tipo: 'error', texto: textoError(e, 'No se pudo quitar la materia de tu agenda.') });
    } finally {
      setQuitando(false);
    }
  };

  const actualizarAsistencia = (componente: ComponenteDb, a: AsistenciaDb) => {
    setDatos({ ...datos, ...(componente === 'teoria' ? { asistencia: a } : { asistenciaLab: a }) });
  };

  return (
    <Pantalla>
      <BarraSuperior titulo="Calculadora de firma" onVolver={volver} />
      <AvisoSinConexion texto={sinConexion && datos ? error : null} />

      <View style={{ backgroundColor: fondos.marino, borderRadius: radio.l + 4, padding: espacio.l, overflow: 'hidden', marginBottom: espacio.m }}>
        <Text style={{ ...texto.etiqueta, color: colores.celeste }}>{materia.nombre}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.s }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sem === 'verde' ? '#8FD0F3' : sem === 'amarillo' ? '#E3EAF1' : sem === 'rojo' ? '#FF8F86' : fondos.celeste }} />
          <Text style={{ ...texto.display, color: colores.blanco, fontSize: 28 }}>{tituloEstado}</Text>
        </View>
        <Text style={{ ...texto.cuerpo, color: colores.cielo, marginTop: espacio.xs }}>{resumenFirma(resultado)}</Text>
        {!datos.reglaOficial && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: espacio.m, alignItems: 'center' }}>
            <Ionicons name="information-circle-outline" size={15} color={colores.celeste} />
            <Text style={{ ...texto.chico, color: colores.celeste, flex: 1 }}>Reglamento general de la FCQ: {regla.minimoTeoria} % en teoría{conLab ? `, ${regla.minimoLaboratorio} % en prácticos` : ''} y {regla.minimoAsistencia} % de asistencia.</Text>
          </View>
        )}
      </View>

      {datos.semestreOpuesto && (
        <Mensaje tipo="info" texto="Cursás esta materia en el semestre opuesto: solo parciales y finales, sin recuperatorio. Tu laboratorio y tu asistencia siguen valiendo." />
      )}
      <Tarjeta>
        <BloqueComponente titulo={combinado ? 'Nota final (teoría + laboratorio)' : 'Teoría'} r={resultado.teoria} />
        {resultado.laboratorio && <View style={{ height: 1, backgroundColor: fondos.lineaSuave, marginVertical: espacio.m }} />}
        {resultado.laboratorio && <BloqueComponente titulo="Laboratorio" r={resultado.laboratorio} />}
        {!combinado && (
          <>
            <View style={{ height: 1, backgroundColor: fondos.lineaSuave, marginVertical: espacio.m }} />
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={s.filaTitulo}>{resultado.laboratorio ? 'Promedio de firma (teoría + lab) ÷ 2' : 'Promedio de firma'}</Text>
              <Text style={{ fontFamily: fuentes.bold, fontSize: 22, color: promedio == null ? colores.textoSuave : colores.marino }}>{pct(promedio)}</Text>
            </View>
            <Text style={s.filaDetalle}>
              {promedio == null
                ? `Aparece cuando cargás todas las notas y llegás a ${regla.minimoTeoria} % en teoría${resultado.laboratorio ? ` y ${regla.minimoLaboratorio ?? regla.minimoTeoria} % en laboratorio` : ''}.`
                : datos.firmaGuardada != null
                  ? `Firma guardada: ${pct(datos.firmaGuardada)}.`
                  : 'Es el promedio que cuenta para el final.'}
            </Text>
          </>
        )}
      </Tarjeta>
      {!combinado && (
        <Boton
          texto={datos.firmaGuardada != null && datos.firmaGuardada === promedio ? 'Firma guardada' : 'Guardar firma'}
          icono="ribbon-outline"
          onPress={guardarMiFirma}
          cargando={guardandoFirma}
          deshabilitado={!puedeGuardar || datos.firmaGuardada === promedio}
        />
      )}
      {!combinado && !resultado.firma && promedio != null && (
        <Mensaje
          tipo="info"
          texto={
            resultado.asistencia.porcentaje == null || (resultado.asistenciaLab != null && resultado.asistenciaLab.porcentaje == null)
              ? 'Marcá abajo que cumpliste la asistencia mínima para poder guardar la firma.'
              : 'Te falta la asistencia mínima para poder guardar la firma.'
          }
        />
      )}
      {msgFirma && <Mensaje texto={msgFirma.texto} tipo={msgFirma.tipo} />}

      <Seccion accion={{ texto: '+ Agregar', onPress: () => setEditando('nueva') }}>Evaluaciones</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        {datos.evaluacionesDb.length === 0 ? (
          <EstadoVacio
            icono="document-text-outline"
            titulo="Sin evaluaciones"
            texto={`Agregá tus parciales${materia.tiene_laboratorio ? ' y el laboratorio' : ' y, si tiene, el laboratorio'}. Todos pesan lo mismo: con tres parciales, cada uno vale un tercio.`}
            accion={{ texto: 'Agregar evaluación', onPress: () => setEditando('nueva') }}
          />
        ) : (
          datos.evaluacionesDb.map((e, i) => {
            const p = porcentajeEvaluacion(aEvaluacion(e));
            const reemplazado = regularizado && esParcialTeorico(e) && (!e.rendida || p == null);
            const ok = p != null && p >= (esRecuperatorio(e) ? RECUPERACION_MINIMO : e.componente === 'laboratorio' ? regla.minimoLaboratorio ?? regla.minimoTeoria : regla.minimoTeoria);
            return (
              <Fila
                key={e.id}
                icono={ICONO_TIPO[tipoEvaluacion(e)]}
                titulo={e.nombre}
                detalle={esPredefinida(e) ? 'Toda cátedra toma al menos dos parciales. Tocá para cargar tu nota' : esRegularizacion(e) ? (regularizado ? 'Ocupó el lugar del parcial que faltaste' : MOTIVO_REGULARIZACION[datos.regularizacion.motivo ?? 'sin-nota']) : reemplazado ? 'Lo cubre tu regularización' : esRecuperatorio(e) ? (datos.recuperado ? 'Reemplazó tu parcial más bajo' : 'No cuenta: hace falta 60 % y un promedio teórico entre 30 y 50 %') : e.componente === 'laboratorio' ? `Pesa ${pct(Math.round(1000 / cantLab) / 10)} del laboratorio` : `Pesa ${pct(Math.round(1000 / cantTeoria) / 10)} del teórico`}
                derecha={
                  reemplazado ? (
                    <Insignia texto="Regularizado" color={colores.marino} fondo={fondos.grisFondo} />
                  ) : e.rendida && p != null ? (
                    <Text style={{ fontFamily: fuentes.bold, fontSize: 16, color: ok ? colores.verde : colores.amarillo }}>{pct(p)}</Text>
                  ) : (
                    <Insignia texto="Pendiente" color={colores.gris} fondo={fondos.grisFondo} />
                  )
                }
                onPress={() => setEditando(e)}
                ultima={i === datos.evaluacionesDb.length - 1}
              />
            );
          })
        )}
      </Tarjeta>
      {/* Art. 46 a): para optar al recuperatorio hay que haber cumplido la asistencia. */}
      {!combinado && !datos.semestreOpuesto && !datos.recuperado && !tieneRecuperatorio && !pendientesTeoria && puedeRecuperar(resultado.teoria) && sinFaltaDeAsistencia && (
        <Mensaje tipo="info" texto={`Tu promedio teórico está entre ${RECUPERACION_DESDE} y ${regla.minimoTeoria} %: podés rendir el recuperatorio en el 1.er llamado de finales (ese llamado queda usado). Si sacás ${RECUPERACION_MINIMO} % o más, reemplaza tu parcial más bajo. Cargalo como "Recuperatorio".`} />
      )}
      {regularizado && (
        <Mensaje tipo="exito" texto="Regularización aplicada: ocupa el lugar del parcial que faltaste. Recordá que el llamado en que la rendiste queda usado." />
      )}
      {!regularizado && !datos.evaluacionesDb.some(esRegularizacion) && datos.evaluacionesDb.filter((e) => esParcialTeorico(e) && !e.rendida).length === 1 && (
        <Mensaje tipo="info" texto='Si faltás a ese parcial, no cuenta como cero: podés rendir la regularización en el 1.º o 2.º llamado de finales (ese llamado queda usado). Cargala como "Regularización". Con dos faltas no se puede regularizar.' />
      )}
      {datos.recuperado && (
        <Mensaje tipo="exito" texto="Recuperación aplicada: reemplazó tu parcial más bajo. Ahora necesitás un promedio de firma de 50 % o más." />
      )}

      {sinFirmaPosible && !datos.recienRecursada && (
        <>
          <Seccion>Volver a cursar</Seccion>
          <Tarjeta>
            <VolverACursar materiaId={materia.id} anioPlan={datos.anioPlan} motivo="Con estas notas ya no llegás a la firma." onHecho={recargar} />
          </Tarjeta>
        </>
      )}

      <Seccion>Asistencia</Seccion>
      <TarjetaAsistencia
        titulo={conLab && regla.minimoAsistenciaLab != null ? 'Teoría' : 'Clases'}
        materiaId={materia.id}
        componente="teoria"
        valor={datos.asistencia}
        r={resultado.asistencia}
        onGuardado={(a) => actualizarAsistencia('teoria', a)}
        ayuda="¿Recursás en el semestre opuesto? Ya cumpliste la asistencia en tu cursada anterior: marcala."
      />
      {resultado.asistenciaLab && (
        <TarjetaAsistencia titulo="Laboratorio" materiaId={materia.id} componente="laboratorio" valor={datos.asistenciaLab} r={resultado.asistenciaLab} onGuardado={(a) => actualizarAsistencia('laboratorio', a)} />
      )}

      <FormEvaluacion
        visible={editando != null}
        evaluacion={editando === 'nueva' ? null : editando}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          recargar();
        }}
        materiaId={materia.id}
        sinRecuperatorio={datos.semestreOpuesto}
      />

      <Hoja visible={clasesEnAgenda > 0} titulo="¿Terminaron tus clases?" onCerrar={() => setClasesEnAgenda(0)}>
        <Text style={[s.cuerpo, { marginBottom: espacio.l }]}>
          {`Tenés ${clasesEnAgenda === 1 ? 'una clase' : `${clasesEnAgenda} clases`} de ${materia.nombre} en tu agenda. ¿Querés eliminar esta materia de tu agenda? Tus fechas de exámenes no se borran.`}
        </Text>
        <Boton texto="Sí, terminé las clases" icono="checkmark" onPress={quitarDeAgenda} cargando={quitando} />
        <Boton texto="No, aún no terminaron" variante="secundario" onPress={() => setClasesEnAgenda(0)} estilo={{ marginTop: espacio.s }} />
        <View style={{ height: espacio.l }} />
      </Hoja>
    </Pantalla>
  );
}

function BloqueComponente({ titulo, r }: { titulo: string; r: ResultadoComponente }) {
  const color = r.asegurado ? colores.verde : r.imposible ? colores.rojo : r.actual != null && r.actual >= r.minimo ? colores.verde : colores.amarillo;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={s.filaTitulo}>{titulo}</Text>
        <Text style={{ fontFamily: fuentes.bold, fontSize: 22, color: r.actual == null ? colores.textoSuave : color }}>{pct(r.actual)}</Text>
      </View>
      <BarraProgreso valor={r.actual} marca={r.minimo} color={r.actual == null ? colores.linea : color} fondo={fondos.lineaSuave} alto={10} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={s.filaDetalle}>Mínimo {pct(r.minimo)}</Text>
        <Text style={[s.filaDetalle, { fontFamily: fuentes.semibold, color }]}>
          {r.asegurado ? 'Asegurado' : r.imposible ? 'Ya no alcanza' : r.necesario != null ? `Necesitás ${pct(r.necesario)} en lo que falta` : ''}
        </Text>
      </View>
    </View>
  );
}

function TarjetaAsistencia({ titulo, materiaId, componente, valor, r, onGuardado, ayuda }: {
  titulo: string; materiaId: string; componente: ComponenteDb; valor: AsistenciaDb | null; r: ResultadoAsistencia; onGuardado: (a: AsistenciaDb) => void; ayuda?: string;
}) {
  // Casilla "Cumplí la asistencia mínima" por defecto; contar las clases es opcional.
  const [contando, setContando] = useState(esAsistenciaContada(valor));
  const contada = esAsistenciaContada(valor);
  const [dictadas, setDictadas] = useState(contada ? valor!.clases_dictadas : 0);
  const [asistidas, setAsistidas] = useState(contada ? valor!.clases_asistidas : 0);
  const [totales, setTotales] = useState(contada ? valor!.clases_totales ?? 0 : 0);
  // Solo se guarda lo que el estudiante tocó (al pasar de la casilla a contar no se borra nada).
  const [tocado, setTocado] = useState(false);
  const [guardandoCasilla, setGuardandoCasilla] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<(() => Promise<void>) | null>(null);
  const cumplida = esAsistenciaCumplida(valor);

  const guardar = async (a: { clases_dictadas: number; clases_asistidas: number; clases_totales: number | null }) => {
    await guardarAsistencia(materiaId, componente, a);
    setError(null);
    onGuardado({ usuario_id: valor?.usuario_id ?? '', materia_id: materiaId, componente, ...a });
  };

  // Contador: guarda solo, medio segundo después del último toque.
  useEffect(() => {
    if (!tocado) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    const a = { clases_dictadas: dictadas, clases_asistidas: Math.min(asistidas, dictadas), clases_totales: totales || null };
    pendiente.current = async () => {
      pendiente.current = null;
      try {
        await guardar(a);
      } catch (e) {
        setError(textoError(e, 'No se pudo guardar.'));
      }
    };
    temporizador.current = setTimeout(() => pendiente.current?.(), 500);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictadas, asistidas, totales, tocado]);

  // Al cambiar de modo: guarda lo que quedó pendiente del contador y no vuelve a guardar sin un toque nuevo.
  const cambiarModo = async (contar: boolean) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setTocado(false);
    setContando(contar);
    await pendiente.current?.();
  };

  const marcar = async () => {
    vibrar();
    setGuardandoCasilla(true);
    try {
      await guardar(cumplida ? { ...ASISTENCIA_VACIA } : { ...ASISTENCIA_CUMPLIDA });
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardandoCasilla(false);
    }
  };

  const cambiar = (f: () => void) => {
    setTocado(true);
    f();
  };

  const sem = coloresSemaforo[r.semaforo];
  return (
    <Tarjeta>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.m }}>
        <Text style={s.filaTitulo}>{titulo}</Text>
        {contando ? (
          <Insignia texto={r.porcentaje == null ? 'Sin datos' : `${pct(r.porcentaje)} · mín. ${r.minimo} %`} color={sem.texto} fondo={sem.fondo} />
        ) : (
          <Insignia texto={`Mínimo ${r.minimo} %`} color={colores.gris} fondo={fondos.grisFondo} />
        )}
      </View>
      {!contando ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: cumplida, disabled: guardandoCasilla }}
            disabled={guardandoCasilla}
            onPress={marcar}
            style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s }}
          >
            <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: cumplida ? colores.verde : colores.linea, backgroundColor: cumplida ? colores.verde : fondos.superficieBlanca, alignItems: 'center', justifyContent: 'center' }}>
              {cumplida && <Ionicons name="checkmark" size={18} color={colores.blanco} />}
            </View>
            <Text style={[s.cuerpo, { flex: 1 }]}>Cumplí la asistencia mínima</Text>
          </Pressable>
          {ayuda ? <Text style={[s.filaDetalle, { marginTop: 4 }]}>{ayuda}</Text> : null}
          <Enlace texto="Prefiero contar mis clases" onPress={() => cambiarModo(true)} />
        </>
      ) : (
        <>
          <FilaContador texto="Clases dictadas" valor={dictadas} onCambio={(n) => cambiar(() => { setDictadas(n); if (asistidas > n) setAsistidas(n); })} />
          <FilaContador texto="Fuiste a" valor={asistidas} onCambio={(n) => cambiar(() => setAsistidas(n))} max={dictadas} />
          <FilaContador texto="Total del semestre" ayuda="Opcional, para saber cuántas faltas te quedan" valor={totales} onCambio={(n) => cambiar(() => setTotales(n))} />
          {r.faltasDisponibles != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, backgroundColor: sem.fondo, borderRadius: radio.m, padding: espacio.m, marginTop: espacio.s }}>
              <Ionicons name={r.faltasDisponibles < 0 ? 'alert-circle' : 'calendar-clear'} size={18} color={sem.texto} />
              <Text style={{ fontFamily: fuentes.semibold, fontSize: 14, color: sem.texto, flex: 1 }}>
                {r.faltasDisponibles < 0
                  ? `Te pasaste por ${-r.faltasDisponibles} ${-r.faltasDisponibles === 1 ? 'falta' : 'faltas'}`
                  : r.faltasDisponibles === 0
                    ? 'No podés faltar más'
                    : `Podés faltar ${r.faltasDisponibles} ${r.faltasDisponibles === 1 ? 'clase' : 'clases'} más`}
              </Text>
            </View>
          )}
          <Enlace texto="Mejor marco solo que la cumplí" onPress={() => cambiarModo(false)} />
        </>
      )}
      <Mensaje texto={error} />
    </Tarjeta>
  );
}

function Enlace({ texto: t, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ paddingVertical: 6, marginTop: 4, alignSelf: 'flex-start' }}>
      <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>{t}</Text>
    </Pressable>
  );
}

function FilaContador({ texto: t, ayuda, valor, onCambio, max }: { texto: string; ayuda?: string; valor: number; onCambio: (n: number) => void; max?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.s, gap: espacio.m }}>
      <View style={{ flex: 1 }}>
        <Text style={s.cuerpo}>{t}</Text>
        {ayuda ? <Text style={s.filaDetalle}>{ayuda}</Text> : null}
      </View>
      <Contador valor={valor} onCambio={onCambio} max={max} etiqueta={t} />
    </View>
  );
}

function FormEvaluacion({ visible, evaluacion, materiaId, onCerrar, onGuardado, sinRecuperatorio }: {
  visible: boolean; evaluacion: EvaluacionDb | null; materiaId: string; onCerrar: () => void; onGuardado: () => void;
  /** Semestre opuesto: no hay examen de recuperación (Art. 23). */
  sinRecuperatorio?: boolean;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoEvaluacion>('parcial');
  const [modo, setModo] = useState<'porcentaje' | 'puntaje'>('porcentaje');
  const [porcentaje, setPorcentaje] = useState('');
  const [obtenido, setObtenido] = useState('');
  const [total, setTotal] = useState('');
  const [rendida, setRendida] = useState<'si' | 'no'>('si');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const e = evaluacion;
    setNombre(e?.nombre ?? '');
    setTipo(e ? (tipoEvaluacion(e) === 'tp' ? 'parcial' : tipoEvaluacion(e)) : 'parcial');
    setModo(e && e.porcentaje == null && e.puntaje_total != null ? 'puntaje' : 'porcentaje');
    setPorcentaje(e?.porcentaje != null ? String(Number(e.porcentaje)) : '');
    setObtenido(e?.puntaje_obtenido != null ? String(Number(e.puntaje_obtenido)) : '');
    setTotal(e?.puntaje_total != null ? String(Number(e.puntaje_total)) : '');
    setRendida(e && !e.rendida ? 'no' : 'si');
    setError(null);
  }, [visible, evaluacion]);

  const num = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
  const valido =
    nombre.trim().length > 0 &&
    (rendida === 'no' ||
      (modo === 'porcentaje' ? num(porcentaje) != null && num(porcentaje)! >= 0 && num(porcentaje)! <= 100 : num(obtenido) != null && num(total) != null && num(total)! > 0 && num(obtenido)! <= num(total)!));

  const vistaPrevia = modo === 'puntaje' && num(obtenido) != null && num(total) ? (num(obtenido)! / num(total)!) * 100 : null;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const datos: NuevaEvaluacion = {
      // El recuperatorio se reconoce por el nombre.
      nombre:
        tipo === 'recuperatorio' && !esRecuperatorio({ nombre, componente: 'teoria' }) ? 'Recuperatorio'
          : tipo === 'regularizacion' && !esRegularizacion({ nombre, componente: 'teoria' }) ? 'Regularización'
            : nombre.trim(),
      componente: tipo === 'laboratorio' ? 'laboratorio' : 'teoria',
      // Los pesos se reparten solos (todas iguales); se guarda 1 para cada una.
      ponderacion: 1,
      porcentaje: rendida === 'si' && modo === 'porcentaje' ? num(porcentaje) : null,
      puntaje_obtenido: rendida === 'si' && modo === 'puntaje' ? num(obtenido) : null,
      puntaje_total: modo === 'puntaje' ? num(total) : null,
      rendida: rendida === 'si',
      fecha: evaluacion?.fecha ?? null,
    };
    try {
      await guardarEvaluacion(materiaId, datos, evaluacion && !esPredefinida(evaluacion) ? evaluacion.id : undefined);
      onGuardado();
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!evaluacion) return;
    setGuardando(true);
    try {
      await borrarEvaluacion(evaluacion.id);
      onGuardado();
    } catch (e) {
      setError(textoError(e, 'No se pudo borrar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo={evaluacion && !esPredefinida(evaluacion) ? 'Editar evaluación' : evaluacion ? evaluacion.nombre : 'Nueva evaluación'} onCerrar={onCerrar}>
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {TIPOS.filter((t) => !sinRecuperatorio || t.valor !== 'recuperatorio' || tipo === 'recuperatorio').map((t) => (
          <Chip
            key={t.valor}
            texto={t.texto}
            icono={t.icono}
            elegido={tipo === t.valor}
            onPress={() => {
              // Sugiere el nombre si el actual es uno de los sugeridos o está vacío.
              if (!nombre.trim() || TIPOS.some((x) => x.nombre && x.nombre === nombre.trim())) setNombre(t.nombre);
              setTipo(t.valor);
            }}
          />
        ))}
      </View>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder={tipo === 'laboratorio' ? 'Laboratorio' : tipo === 'recuperatorio' ? 'Recuperatorio' : 'Ej. Primer parcial'} />
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>¿Ya la rendiste?</Text>
      <Segmentado opciones={[{ valor: 'si', texto: 'Sí, tengo la nota' }, { valor: 'no', texto: 'Todavía no o falté' }]} valor={rendida} onCambio={setRendida} />
      {rendida === 'si' && (
        <>
          <Segmentado opciones={[{ valor: 'porcentaje', texto: 'Porcentaje' }, { valor: 'puntaje', texto: 'Puntaje' }]} valor={modo} onCambio={setModo} />
          {modo === 'porcentaje' ? (
            <Campo etiqueta="Sacaste (%)" value={porcentaje} onChangeText={setPorcentaje} keyboardType="decimal-pad" placeholder="Ej. 72" />
          ) : (
            <View style={{ flexDirection: 'row', gap: espacio.m }}>
              <Campo etiqueta="Puntos obtenidos" value={obtenido} onChangeText={setObtenido} keyboardType="decimal-pad" estilo={{ flex: 1 }} />
              <Campo etiqueta="Puntaje total" value={total} onChangeText={setTotal} keyboardType="decimal-pad" estilo={{ flex: 1 }} />
            </View>
          )}
          {vistaPrevia != null && Number.isFinite(vistaPrevia) && <Mensaje tipo="info" texto={`Equivale a ${pct(Math.round(vistaPrevia * 10) / 10)}`} />}
        </>
      )}
      <Mensaje texto={error} />
      <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!valido} />
      {evaluacion && !esPredefinida(evaluacion) && <Boton texto="Eliminar" variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} />}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}
