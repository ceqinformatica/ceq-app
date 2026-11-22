import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { pct, resumenFirma, semaforoVisible } from '../../components/academico';
import { BarraProgreso, TramaHex } from '../../components/graficos';
import {
  BarraSuperior, Boton, Campo, Cargando, Contador, EstadoVacio, Fila, Hoja, Insignia, Mensaje, Pantalla, s, Seccion, Segmentado, Tarjeta,
} from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import {
  aAsistencia, aEvaluacion, borrarEvaluacion, cargarFirmas, cargarMalla, guardarAsistencia, guardarEvaluacion, REGLA_POR_DEFECTO, reglaDe,
  type NuevaEvaluacion,
} from '../../datos/academico';
import { usarDatos } from '../../datos/usarDatos';
import { evaluarFirma, porcentajeEvaluacion, type ResultadoAsistencia, type ResultadoComponente } from '../../lib/firma';
import type { AsistenciaDb, ComponenteDb, EvaluacionDb } from '../../lib/tipos-db';
import { colores, coloresSemaforo, espacio, fuentes, radio, texto } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/firma'));

async function cargar(planId: string, materiaId: string) {
  const malla = await cargarMalla(planId);
  const materia = malla.materiasDb.find((m) => m.id === materiaId) ?? null;
  const firmas = await cargarFirmas([materiaId]);
  const regla = reglaDe(malla.reglas, materiaId);
  return { materia, regla: regla ?? REGLA_POR_DEFECTO, reglaOficial: Boolean(regla), ...firmas.get(materiaId)! };
}

export default function CalculadoraFirma() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { perfil } = useSesion();
  const { datos, cargando, error, recargar, setDatos } = usarDatos(() => cargar(perfil?.plan_id ?? '', id ?? ''), [perfil?.plan_id, id]);
  const [editando, setEditando] = useState<EvaluacionDb | 'nueva' | null>(null);

  const resultado = useMemo(() => {
    if (!datos?.materia) return null;
    return evaluarFirma({
      regla: datos.regla,
      tieneLaboratorio: datos.materia.tiene_laboratorio,
      evaluaciones: datos.evaluacionesDb.map(aEvaluacion),
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
  const conLab = materia.tiene_laboratorio;
  const combinado = conLab && regla.modoLaboratorio === 'combinado';

  const actualizarAsistencia = (componente: ComponenteDb, a: AsistenciaDb) => {
    setDatos({ ...datos, ...(componente === 'teoria' ? { asistencia: a } : { asistenciaLab: a }) });
  };

  return (
    <Pantalla>
      <BarraSuperior titulo="Calculadora de firma" onVolver={volver} />

      <View style={{ backgroundColor: colores.marino, borderRadius: radio.l + 4, padding: espacio.l, overflow: 'hidden', marginBottom: espacio.m }}>
        <TramaHex ancho={420} alto={240} opacidad={0.07} />
        <Text style={{ ...texto.etiqueta, color: colores.celeste }}>{materia.nombre}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.s }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sem === 'verde' ? '#5FD38D' : sem === 'amarillo' ? '#FFC94D' : sem === 'rojo' ? '#FF7A6E' : colores.celeste }} />
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

      <Tarjeta>
        <BloqueComponente titulo={combinado ? 'Nota final (teoría + laboratorio)' : 'Teoría'} r={resultado.teoria} />
        {resultado.laboratorio && <View style={{ height: 1, backgroundColor: colores.lineaSuave, marginVertical: espacio.m }} />}
        {resultado.laboratorio && <BloqueComponente titulo="Laboratorio" r={resultado.laboratorio} />}
      </Tarjeta>

      <Seccion accion={{ texto: '+ Agregar', onPress: () => setEditando('nueva') }}>Evaluaciones</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        {datos.evaluacionesDb.length === 0 ? (
          <EstadoVacio icono="document-text-outline" titulo="Sin evaluaciones" texto="Agregá tus parciales, trabajos y laboratorios con su ponderación." accion={{ texto: 'Agregar evaluación', onPress: () => setEditando('nueva') }} />
        ) : (
          datos.evaluacionesDb.map((e, i) => {
            const p = porcentajeEvaluacion(aEvaluacion(e));
            const ok = p != null && p >= (e.componente === 'laboratorio' ? regla.minimoLaboratorio ?? regla.minimoTeoria : regla.minimoTeoria);
            return (
              <Fila
                key={e.id}
                icono={e.componente === 'laboratorio' ? 'flask-outline' : 'document-text-outline'}
                titulo={e.nombre}
                detalle={`Vale ${Number(e.ponderacion)} %${conLab ? ` · ${e.componente === 'laboratorio' ? 'Laboratorio' : 'Teoría'}` : ''}`}
                derecha={
                  e.rendida && p != null ? (
                    <Text style={{ fontFamily: fuentes.bold, fontSize: 16, color: ok ? colores.verde : colores.amarillo }}>{pct(p)}</Text>
                  ) : (
                    <Insignia texto="Pendiente" color={colores.gris} fondo={colores.grisFondo} />
                  )
                }
                onPress={() => setEditando(e)}
                ultima={i === datos.evaluacionesDb.length - 1}
              />
            );
          })
        )}
      </Tarjeta>

      <Seccion>Asistencia</Seccion>
      <TarjetaAsistencia
        titulo={conLab && regla.minimoAsistenciaLab != null ? 'Teoría' : 'Clases'}
        materiaId={materia.id}
        componente="teoria"
        valor={datos.asistencia}
        r={resultado.asistencia}
        onGuardado={(a) => actualizarAsistencia('teoria', a)}
      />
      {resultado.asistenciaLab && (
        <TarjetaAsistencia titulo="Laboratorio" materiaId={materia.id} componente="laboratorio" valor={datos.asistenciaLab} r={resultado.asistenciaLab} onGuardado={(a) => actualizarAsistencia('laboratorio', a)} />
      )}

      <FormEvaluacion
        visible={editando != null}
        evaluacion={editando === 'nueva' ? null : editando}
        conLab={conLab}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          recargar();
        }}
        materiaId={materia.id}
      />
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
      <BarraProgreso valor={r.actual} marca={r.minimo} color={r.actual == null ? colores.linea : color} fondo={colores.lineaSuave} alto={10} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={s.filaDetalle}>Mínimo {pct(r.minimo)}</Text>
        <Text style={[s.filaDetalle, { fontFamily: fuentes.semibold, color }]}>
          {r.asegurado ? 'Asegurado' : r.imposible ? 'Ya no alcanza' : r.necesario != null ? `Necesitás ${pct(r.necesario)} en lo que falta` : ''}
        </Text>
      </View>
    </View>
  );
}

function TarjetaAsistencia({ titulo, materiaId, componente, valor, r, onGuardado }: {
  titulo: string; materiaId: string; componente: ComponenteDb; valor: AsistenciaDb | null; r: ResultadoAsistencia; onGuardado: (a: AsistenciaDb) => void;
}) {
  const [dictadas, setDictadas] = useState(valor?.clases_dictadas ?? 0);
  const [asistidas, setAsistidas] = useState(valor?.clases_asistidas ?? 0);
  const [totales, setTotales] = useState(valor?.clases_totales ?? 0);
  const [error, setError] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guarda solo, medio segundo después del último toque.
  useEffect(() => {
    const igual = dictadas === (valor?.clases_dictadas ?? 0) && asistidas === (valor?.clases_asistidas ?? 0) && totales === (valor?.clases_totales ?? 0);
    if (igual) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      const a = { clases_dictadas: dictadas, clases_asistidas: Math.min(asistidas, dictadas), clases_totales: totales || null };
      try {
        await guardarAsistencia(materiaId, componente, a);
        setError(null);
        onGuardado({ usuario_id: valor?.usuario_id ?? '', materia_id: materiaId, componente, ...a });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      }
    }, 500);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictadas, asistidas, totales]);

  const sem = coloresSemaforo[r.semaforo];
  return (
    <Tarjeta>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.m }}>
        <Text style={s.filaTitulo}>{titulo}</Text>
        <Insignia texto={r.porcentaje == null ? 'Sin datos' : `${pct(r.porcentaje)} · mín. ${r.minimo} %`} color={sem.texto} fondo={sem.fondo} />
      </View>
      <FilaContador texto="Clases dictadas" valor={dictadas} onCambio={(n) => { setDictadas(n); if (asistidas > n) setAsistidas(n); }} />
      <FilaContador texto="Fuiste a" valor={asistidas} onCambio={setAsistidas} max={dictadas} />
      <FilaContador texto="Total del semestre" ayuda="Opcional, para saber cuántas faltas te quedan" valor={totales} onCambio={setTotales} />
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
      <Mensaje texto={error} />
    </Tarjeta>
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

function FormEvaluacion({ visible, evaluacion, conLab, materiaId, onCerrar, onGuardado }: {
  visible: boolean; evaluacion: EvaluacionDb | null; conLab: boolean; materiaId: string; onCerrar: () => void; onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [componente, setComponente] = useState<ComponenteDb>('teoria');
  const [ponderacion, setPonderacion] = useState('');
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
    setComponente(e?.componente ?? 'teoria');
    setPonderacion(e ? String(Number(e.ponderacion)) : '');
    setModo(e && e.porcentaje == null && e.puntaje_total != null ? 'puntaje' : 'porcentaje');
    setPorcentaje(e?.porcentaje != null ? String(Number(e.porcentaje)) : '');
    setObtenido(e?.puntaje_obtenido != null ? String(Number(e.puntaje_obtenido)) : '');
    setTotal(e?.puntaje_total != null ? String(Number(e.puntaje_total)) : '');
    setRendida(e && !e.rendida ? 'no' : 'si');
    setError(null);
  }, [visible, evaluacion]);

  const num = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
  const pond = num(ponderacion);
  const valido =
    nombre.trim().length > 0 && pond != null && pond > 0 && pond <= 100 &&
    (rendida === 'no' ||
      (modo === 'porcentaje' ? num(porcentaje) != null && num(porcentaje)! >= 0 && num(porcentaje)! <= 100 : num(obtenido) != null && num(total) != null && num(total)! > 0 && num(obtenido)! <= num(total)!));

  const vistaPrevia = modo === 'puntaje' && num(obtenido) != null && num(total) ? (num(obtenido)! / num(total)!) * 100 : null;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const datos: NuevaEvaluacion = {
      nombre: nombre.trim(),
      componente: conLab ? componente : 'teoria',
      ponderacion: pond!,
      porcentaje: rendida === 'si' && modo === 'porcentaje' ? num(porcentaje) : null,
      puntaje_obtenido: rendida === 'si' && modo === 'puntaje' ? num(obtenido) : null,
      puntaje_total: modo === 'puntaje' ? num(total) : null,
      rendida: rendida === 'si',
      fecha: evaluacion?.fecha ?? null,
    };
    try {
      await guardarEvaluacion(materiaId, datos, evaluacion?.id);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
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
      setError(e instanceof Error ? e.message : 'No se pudo borrar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo={evaluacion ? 'Editar evaluación' : 'Nueva evaluación'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Ej. Primer parcial" />
      {conLab && (
        <Segmentado opciones={[{ valor: 'teoria', texto: 'Teoría' }, { valor: 'laboratorio', texto: 'Laboratorio' }]} valor={componente} onCambio={setComponente} />
      )}
      <Campo etiqueta="¿Cuánto vale? (%)" value={ponderacion} onChangeText={setPonderacion} keyboardType="decimal-pad" placeholder="Ej. 30" ayuda="Su peso dentro de la nota de teoría o de laboratorio." />
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>¿Ya la rendiste?</Text>
      <Segmentado opciones={[{ valor: 'si', texto: 'Sí, tengo la nota' }, { valor: 'no', texto: 'Todavía no' }]} valor={rendida} onCambio={setRendida} />
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
      {evaluacion && <Boton texto="Eliminar" variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} />}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}
