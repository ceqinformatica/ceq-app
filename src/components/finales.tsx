/**
 * Finales de una materia (rediseño de Josie, 2026-11-25): un resumen de
 * cómo va ("Mis finales", "Resultado pendiente", "Recursada pendiente"…),
 * los aplazos registrados, el botón para registrar el resultado de una mesa
 * y el historial de todo lo que rindió.
 *
 * Cada resultado se carga en una hoja: semestre, llamado y qué pasó en esa
 * mesa (rendí y tengo la nota, rendí y espero la nota, estuve ausente). Con
 * el promedio de firma guardado, el final se carga en porcentaje y la nota
 * sale sola (0,4 × firma + 0,6 × final, Art. 57); si no, la nota directa.
 *
 * El Recu y la Regu se cargan en Parciales: acá aparecen en el historial
 * y no gastan un final. Con tres aplazos en la cursada (Art. 62) o la firma
 * vencida hay que volver a cursar: el botón pasa a "Recursar materia" (se
 * puede deshacer desde la materia). El laboratorio se conserva (Art. 45).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cargarFinales, guardarFirma, guardarUnLlamado, recursarMateria } from '../datos/academico';
import { sinOpuestoEnPlan, VolverACursar } from './volver-a-cursar';
import {
  aplazosDeLaCursada, firmaVencida, LLAMADOS_POR_MATERIA, llamadosUsados, nombreLlamado, nombreSemestre, notaDelLlamado, periodoDe,
  periodosParaFinales, semestreOpuesto as calcularOpuesto, tituloResultado, type LlamadoCargado,
} from '../lib/finales';
import { calificacionFinal, CONCEPTO, FINAL_MINIMO, finalesNecesarios, finalNecesario, type Nota } from '../lib/reglamento-fcq';
import type { ExamenFinalDb } from '../lib/tipos-db';
import { colores, espacio, fondos, fuentes, radio } from '../tema';
import { pct } from './academico';
import { Boton, Campo, Hoja, Mensaje, Opcion, s, Segmentado, Tarjeta } from './ui';
import { vibrar } from './movimiento';
import { textoError } from '../lib/errores';

/** Porcentaje con dos decimales: junto al límite de aprobación, uno solo engaña (65,84 se vería 65,8). */
const pct2 = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',').replace(/0$/, '')} %`;

/** null si está vacío; NaN si no es un número (se marca como inválido, no como vacío). */
const num = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.').trim()));

const firmaValida = (t: string) => {
  const f = num(t);
  return f != null && Number.isFinite(f) && f >= 0 && f <= 100;
};

const fechaValida = (t: string) => {
  if (!t.trim()) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.trim())) return false;
  const d = new Date(`${t.trim()}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t.trim();
};

const esParcialEnFinales = (f: Pick<ExamenFinalDb, 'tipo'>) => f.tipo === 'recuperatorio' || f.tipo === 'regularizacion';

/** Del más nuevo al más viejo. */
const ordenHistorial = (a: ExamenFinalDb, b: ExamenFinalDb) =>
  (b.periodo ?? '').localeCompare(a.periodo ?? '') || (b.llamado ?? 0) - (a.llamado ?? 0) || b.created_at.localeCompare(a.created_at);

type QuePaso = 'nota' | 'espera' | 'ausente';
/** Hoja de resultado: null cerrada; `fila` null para uno nuevo. */
type HojaAbierta = { fila: ExamenFinalDb | null } | null;

export function TarjetaFinales({ materiaId, firma: firmaGuardadaEnMateria, aprobada, onGuardado, semestreOpuesto, anioPlan, periodoFirma }: {
  materiaId: string;
  /** Cursa en el semestre opuesto: sin Recu y con los llamados que le quedan. */
  semestreOpuesto?: boolean;
  anioPlan?: number | null;
  /** Semestre en que firmó (para ofrecer los semestres de finales). */
  periodoFirma?: string | null;
  /** Promedio de firma guardado (0 a 100), o null. */
  firma: number | null;
  /** Ya aprobada: no se ofrece volver a cursar. */
  aprobada?: boolean;
  /** Después de guardar: recargar la materia (estado y nota). */
  onGuardado: (firma: number | null) => void;
}) {
  // La firma recién guardada acá aparece al toque, sin esperar la recarga.
  const [firmaNueva, setFirmaNueva] = useState<number | null>(null);
  const firma = firmaGuardadaEnMateria ?? firmaNueva;
  const [todos, setTodos] = useState<ExamenFinalDb[] | null>(null);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);
  const [hoja, setHoja] = useState<HojaAbierta>(null);
  const [hojaFirma, setHojaFirma] = useState(false);
  const [hojaRecursar, setHojaRecursar] = useState<'obligatoria' | 'elegir' | null>(null);

  const recargar = useCallback(
    () => cargarFinales(materiaId).then(setTodos).catch((e) => setMsg({ tipo: 'error', texto: textoError(e, 'No se pudieron cargar los finales.') })),
    [materiaId],
  );
  useEffect(() => {
    recargar();
  }, [recargar]);

  // Solo los de la cursada actual se editan; los de antes de recursar quedan como dato.
  const finales = useMemo(() => todos?.filter((f) => !f.cursada_anterior) ?? [], [todos]);
  const anteriores = useMemo(() => todos?.filter((f) => f.cursada_anterior && f.nota != null) ?? [], [todos]);
  const historial = useMemo(() => [...finales].sort(ordenHistorial), [finales]);
  const cursada = aplazosDeLaCursada(finales);
  // Art. 49 y 62: dos periodos sin aprobar vencen la firma.
  const vencida = !aprobada && !cursada.debeRecursar && firmaVencida(finales, periodoDe());
  const recursar = !aprobada && (cursada.debeRecursar || vencida);
  const pendiente = historial.find((f) => f.tipo === 'pendiente') ?? null;
  const opuesto = calcularOpuesto({ finales, aprobada, sinOpuestoEnPlan: sinOpuestoEnPlan(anioPlan) });
  const necesario = firma != null ? finalNecesario(firma) : null;

  const titulo = aprobada
    ? 'Materia aprobada'
    : recursar
      ? 'Recursada pendiente'
      : pendiente
        ? 'Resultado pendiente'
        : cursada.aplazos > 0 && opuesto.puede
          ? 'Podés rendir el final en semestre opuesto.'
          : 'Mis finales';

  const alGuardar = (texto: string) => {
    setHoja(null);
    vibrar('exito');
    setMsg({ tipo: 'exito', texto });
    recargar();
    onGuardado(firma);
  };

  return (
    <>
      <Tarjeta>
        <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: colores.texto }} accessibilityRole="header">{titulo}</Text>
        <Text style={[s.filaDetalle, { marginTop: 2 }]}>Según tus registros</Text>
        <Text style={[s.cuerpo, { marginTop: 2 }]}>
          {todos == null ? 'Cargando…' : `${cursada.aplazos} ${cursada.aplazos === 1 ? 'aplazo registrado' : 'aplazos registrados'}`}
        </Text>

        {!aprobada && !recursar && cursada.aplazos === LLAMADOS_POR_MATERIA - 1 && (
          <Mensaje tipo="info" texto="Si volvés a aplazar, te corresponde recursar la materia completa." />
        )}
        {vencida && <Mensaje tipo="info" texto="Pasaron dos periodos sin aprobar y tu firma venció: te corresponde volver a cursar la materia (Art. 62)." />}

        {!aprobada && !recursar && (
          <Boton
            texto={firma == null ? 'Cargar tu firma' : `Firma vigente (${pct(firma)}) · Editar`}
            variante="fantasma"
            compacto
            onPress={() => setHojaFirma(true)}
            estilo={{ marginTop: espacio.s }}
          />
        )}

        {recursar ? (
          <Boton texto="Recursar materia" onPress={() => setHojaRecursar('obligatoria')} estilo={{ marginTop: espacio.s }} />
        ) : pendiente ? (
          <Boton texto="Completar nota" icono="create-outline" onPress={() => setHoja({ fila: pendiente })} estilo={{ marginTop: espacio.s }} />
        ) : !aprobada ? (
          <Boton texto="Registrar resultado" icono="add" onPress={() => setHoja({ fila: null })} deshabilitado={todos == null} estilo={{ marginTop: espacio.s }} />
        ) : null}
        {msg && <Mensaje texto={msg.texto} tipo={msg.tipo} />}

        <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto, marginTop: espacio.l }}>Historial</Text>
        {todos != null && historial.length === 0 && (
          <Text style={[s.filaDetalle, { marginTop: espacio.xs }]}>Todavía no registraste ningún final.</Text>
        )}
        {historial.map((f, i) => (
          <FilaResultado
            key={f.id}
            f={f}
            opuesto={!!semestreOpuesto && f.periodo === periodoDe()}
            ultima={i === historial.length - 1}
            // El Recu y la Regu se cambian desde Parciales.
            onPress={() => (esParcialEnFinales(f) ? router.push(`/firma/${materiaId}`) : setHoja({ fila: f }))}
          />
        ))}
        {anteriores.length > 0 && (
          <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>
            Notas de la cursada anterior: {anteriores.map((f) => f.nota).join(', ')}. Cuentan para el promedio con aplazos.
          </Text>
        )}
      </Tarjeta>

      {/* Con algún aplazo se puede elegir volver a cursar antes, por ejemplo en el semestre opuesto. */}
      {!aprobada && !recursar && cursada.aplazos > 0 && (
        <Enlace texto="¿Preferís volver a cursarla (semestre normal u opuesto)?" onPress={() => setHojaRecursar('elegir')} />
      )}

      <HojaResultado
        abierta={hoja}
        materiaId={materiaId}
        finales={finales}
        firma={firma}
        semestreOpuesto={semestreOpuesto}
        periodoFirma={periodoFirma}
        onCerrar={() => setHoja(null)}
        onGuardado={alGuardar}
      />

      <HojaFirma
        visible={hojaFirma}
        materiaId={materiaId}
        firma={firma}
        onCerrar={() => setHojaFirma(false)}
        onGuardada={(f) => {
          setFirmaNueva(f);
          setHojaFirma(false);
          setMsg({ tipo: 'exito', texto: `Listo. Tu firma es ${pct(f)}.` });
          onGuardado(f);
        }}
      />

      <Hoja visible={hojaRecursar === 'obligatoria'} titulo="¿Recursar materia?" onCerrar={() => setHojaRecursar(null)}>
        <ConfirmarRecursada
          materiaId={materiaId}
          onCancelar={() => setHojaRecursar(null)}
          onHecho={() => {
            setHojaRecursar(null);
            setFirmaNueva(null);
            onGuardado(null);
          }}
        />
      </Hoja>
      <Hoja visible={hojaRecursar === 'elegir'} titulo="Volver a cursar" onCerrar={() => setHojaRecursar(null)}>
        <VolverACursar
          materiaId={materiaId}
          anioPlan={anioPlan}
          onHecho={() => {
            setHojaRecursar(null);
            setFirmaNueva(null);
            onGuardado(null);
          }}
        />
        <View style={{ height: espacio.l }} />
      </Hoja>
    </>
  );
}

function FilaResultado({ f, opuesto, ultima, onPress }: { f: ExamenFinalDb; opuesto: boolean; ultima: boolean; onPress: () => void }) {
  const partes = [
    opuesto ? 'Semestre opuesto' : null,
    f.periodo ? nombreSemestre(f.periodo) : null,
    f.llamado ? nombreLlamado(f.llamado) : null,
    f.tipo === 'pendiente' ? 'Completar nota' : null,
  ].filter(Boolean);
  const titulo = tituloResultado(f);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${partes.join(', ')}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: espacio.s, paddingVertical: espacio.m,
        borderBottomWidth: ultima ? 0 : 1, borderBottomColor: colores.lineaSuave, opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto }}>{titulo}</Text>
        <Text style={[s.filaDetalle, { marginTop: 2 }]}>{partes.join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colores.textoSuave} />
    </Pressable>
  );
}

/** Hoja para registrar (o corregir) el resultado de una mesa. */
function HojaResultado({ abierta, materiaId, finales, firma, semestreOpuesto, periodoFirma, onCerrar, onGuardado }: {
  abierta: HojaAbierta;
  materiaId: string;
  finales: ExamenFinalDb[];
  firma: number | null;
  semestreOpuesto?: boolean;
  periodoFirma?: string | null;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const fila = abierta?.fila ?? null;
  const [periodo, setPeriodo] = useState(periodoDe());
  const [llamado, setLlamado] = useState<1 | 2 | 3>(1);
  const [quePaso, setQuePaso] = useState<QuePaso>('nota');
  const [valor, setValor] = useState('');
  // Nota directa aunque haya firma (por ejemplo, si no sabe el porcentaje).
  const [conNota, setConNota] = useState(false);
  const [fecha, setFecha] = useState('');
  const [eligiendoSemestre, setEligiendoSemestre] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: lo de la fila que se corrige, o el primer llamado libre de este semestre.
  useEffect(() => {
    if (!abierta) return;
    const f = abierta.fila;
    const p = f?.periodo ?? periodoDe();
    setPeriodo(p);
    const libre = ([1, 2, 3] as const).find((n) => !finales.some((x) => x.periodo === p && x.llamado === n)) ?? 1;
    setLlamado(f?.llamado === 1 || f?.llamado === 2 || f?.llamado === 3 ? f.llamado : libre);
    setQuePaso(f?.tipo === 'ausente' ? 'ausente' : 'nota');
    const usaPct = firma != null && f?.porcentaje != null;
    setConNota(f != null && (f.tipo ?? 'final') === 'final' && !usaPct);
    setValor(f && (f.tipo ?? 'final') === 'final' ? String(usaPct ? Number(f.porcentaje) : f.nota) : '');
    setFecha(f?.fecha ?? '');
    setEligiendoSemestre(false);
    setError(null);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta]);

  const periodos = periodosParaFinales(periodoFirma, periodoDe(), finales.map((f) => f.periodo).filter((p): p is string => !!p));
  const ocupado = finales.find((f) => f.periodo === periodo && f.llamado === llamado && f.id !== fila?.id) ?? null;
  const conPorcentaje = firma != null && !conNota;
  const v = quePaso === 'nota' ? num(valor) : null;
  const valorValido = v != null && Number.isFinite(v) && (conPorcentaje ? v >= 0 && v <= 100 : Number.isInteger(v) && v >= 1 && v <= 5);
  const nota = valorValido ? notaDelLlamado(firma, conPorcentaje ? v : null, conPorcentaje ? null : v, calificacionFinal) : null;
  const rendimiento = conPorcentaje && valorValido ? calificacionFinal(firma!, v!).rendimiento : null;
  // En el semestre opuesto los 3 finales son los de la materia (estar ausente no gasta uno).
  const otros = finales.filter((f) => f.id !== fila?.id && f.id !== ocupado?.id);
  const pasaDeLlamados = !!semestreOpuesto && quePaso !== 'ausente' && llamadosUsados(otros) + 1 > LLAMADOS_POR_MATERIA;
  const yaAprobo = otros.some((f) => (f.tipo ?? 'final') === 'final' && f.nota != null && f.nota >= 2);
  const valido = (quePaso !== 'nota' || valorValido) && fechaValida(fecha) && !(ocupado && esParcialEnFinales(ocupado)) && !pasaDeLlamados;

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    setError(null);
    const base = { llamado, fecha: fecha.trim() || null };
    const cargado: LlamadoCargado = quePaso === 'nota'
      ? { ...base, tipo: 'final', nota: nota!, porcentaje: conPorcentaje ? v : null }
      : { ...base, tipo: quePaso === 'espera' ? 'pendiente' : 'ausente', nota: null, porcentaje: null };
    try {
      await guardarUnLlamado(materiaId, periodo, cargado, fila);
      onGuardado(
        quePaso === 'nota' && nota != null && nota >= 2
          ? `Guardado. Aprobaste con ${nota} (${CONCEPTO[nota as Nota]}).`
          : quePaso === 'espera' ? 'Guardado. Cuando salga la nota, tocá "Completar nota".' : 'Guardado.',
      );
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!fila?.periodo) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarUnLlamado(materiaId, fila.periodo, null, fila);
      onGuardado('Listo, lo quitamos del historial.');
    } catch (e) {
      setError(textoError(e, 'No se pudo borrar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={abierta != null} titulo={fila?.tipo === 'pendiente' ? 'Completar nota' : fila ? 'Editar resultado' : 'Registrar resultado'} onCerrar={onCerrar}>
      <Text style={s.filaDetalle}>{periodo === periodoDe() ? 'Este semestre' : 'Semestre'}</Text>
      <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: colores.texto }}>{nombreSemestre(periodo)}</Text>
      {semestreOpuesto && periodo === periodoDe() && <Text style={s.filaDetalle}>Semestre opuesto para esta materia</Text>}
      {periodos.length > 1 && (
        <Boton texto={eligiendoSemestre ? 'Listo' : 'Cambiar semestre'} variante="fantasma" compacto onPress={() => setEligiendoSemestre(!eligiendoSemestre)} />
      )}
      {eligiendoSemestre && (
        <View style={{ marginBottom: espacio.s }}>
          {periodos.map((p) => (
            <Opcion
              key={p}
              texto={nombreSemestre(p)}
              detalle={p === periodoDe() ? 'Este semestre' : undefined}
              elegida={p === periodo}
              onPress={() => {
                setPeriodo(p);
                setEligiendoSemestre(false);
              }}
            />
          ))}
        </View>
      )}

      <Text style={[s.etiqueta, { marginTop: espacio.s, marginBottom: espacio.s }]}>Llamado</Text>
      <Segmentado
        opciones={([1, 2, 3] as const).map((n) => ({ valor: String(n) as '1' | '2' | '3', texto: nombreLlamado(n) }))}
        valor={String(llamado) as '1' | '2' | '3'}
        onCambio={(t) => setLlamado(Number(t) as 1 | 2 | 3)}
      />
      {ocupado && esParcialEnFinales(ocupado) && (
        <Mensaje texto={`Ese llamado lo usaste para ${ocupado.tipo === 'recuperatorio' ? 'el Recu' : 'la Regu'}. Elegí otro, o cambialo desde Parciales.`} />
      )}
      {ocupado && !esParcialEnFinales(ocupado) && (
        <Mensaje tipo="info" texto={`En ese llamado ya tenés "${tituloResultado(ocupado)}". Al guardar se reemplaza.`} />
      )}

      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>¿Qué pasó en esa mesa?</Text>
      <Opcion texto="Rendí y tengo la nota" elegida={quePaso === 'nota'} onPress={() => setQuePaso('nota')} />
      <Opcion texto="Rendí y espero la nota" elegida={quePaso === 'espera'} onPress={() => setQuePaso('espera')} />
      <Opcion texto="Estuve ausente" detalle="No es aplazo y no gasta uno de tus 3 finales." elegida={quePaso === 'ausente'} onPress={() => setQuePaso('ausente')} />

      {quePaso === 'nota' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espacio.m, marginTop: espacio.s }}>
            <Campo
              etiqueta={conPorcentaje ? '¿Cuánto sacaste en el final? (%)' : 'Nota (1 a 5)'}
              value={valor}
              onChangeText={setValor}
              keyboardType="decimal-pad"
              placeholder={conPorcentaje ? 'Ej. 75' : 'Ej. 4'}
              maxLength={5}
              estilo={{ flex: 1, marginBottom: 0 }}
            />
            <View style={{ width: 96, alignItems: 'flex-end', paddingBottom: 4 }}>
              {nota != null ? (
                <>
                  <Text style={{ fontFamily: fuentes.bold, fontSize: 24, color: nota >= 2 ? colores.verde : colores.rojo }}>{nota}</Text>
                  <Text style={s.filaDetalle}>{CONCEPTO[nota as Nota]}</Text>
                </>
              ) : valor.trim() && !valorValido ? (
                <Text style={[s.filaDetalle, { color: colores.rojo }]}>{conPorcentaje ? 'De 0 a 100' : 'De 1 a 5'}</Text>
              ) : null}
            </View>
          </View>
          {rendimiento != null && <Text style={[s.filaDetalle, { marginTop: 4 }]}>Nota final {pct2(rendimiento)} (40 % firma + 60 % final)</Text>}
          {firma != null && (
            <Enlace
              texto={conPorcentaje ? 'Sé la nota, no el porcentaje' : 'Cargar el porcentaje'}
              onPress={() => {
                setConNota(conPorcentaje);
                setValor('');
              }}
            />
          )}
        </>
      )}

      <Campo
        etiqueta="Fecha del examen (opcional)"
        value={fecha}
        onChangeText={setFecha}
        placeholder="AAAA-MM-DD"
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        estilo={{ marginTop: espacio.m }}
      />
      {!fechaValida(fecha) && <Mensaje texto="Escribí la fecha así: 2026-12-04." />}
      {pasaDeLlamados && <Mensaje texto={`En el semestre opuesto usás los mismos ${LLAMADOS_POR_MATERIA} finales de la materia, y ya los cargaste todos.`} />}
      {yaAprobo && quePaso !== 'ausente' && <Mensaje tipo="info" texto="Ya tenés un final aprobado en esta materia. ¿Seguro que rendiste este?" />}
      <Mensaje texto={error} />
      <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!valido} />
      {fila && <Boton texto="Eliminar" variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} estilo={{ marginTop: espacio.s }} />}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

/** Cargar o corregir el promedio de firma: con él la nota del final sale sola. */
function HojaFirma({ visible, materiaId, firma, onCerrar, onGuardada }: {
  visible: boolean; materiaId: string; firma: number | null; onCerrar: () => void; onGuardada: (f: number) => void;
}) {
  const [txt, setTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setTxt(firma != null ? String(firma) : '');
    setError(null);
  }, [visible, firma]);
  const f = num(txt);
  const necesario = firmaValida(txt) ? finalNecesario(Math.round(f! + 1e-9)) : null;

  const guardar = async () => {
    if (!firmaValida(txt)) return;
    setGuardando(true);
    setError(null);
    try {
      // La firma es un entero: desde 0,5 se redondea para arriba (90,5 → 91).
      const entera = Math.round(f! + 1e-9);
      await guardarFirma(materiaId, entera);
      onGuardada(entera);
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar la firma.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Tu firma" onCerrar={onCerrar}>
      <Campo etiqueta="Promedio de firma (%)" value={txt} onChangeText={setTxt} keyboardType="decimal-pad" placeholder="Ej. 72" />
      <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
        {firmaValida(txt)
          ? necesario == null ? 'Con esta firma no alcanza para aprobar el final.' : `Para aprobar necesitás ${pct2(necesario)} en el final.`
          : 'Con tu firma, en cada final ponés el porcentaje y la nota sale sola.'}
      </Text>
      <Mensaje texto={error} />
      <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!firmaValida(txt)} />
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

/** Con 3 aplazos o la firma vencida: volver a cursar (Art. 45 y 62). */
function ConfirmarRecursada({ materiaId, onCancelar, onHecho }: { materiaId: string; onCancelar: () => void; onHecho: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View>
      <Text style={[s.cuerpo, { marginBottom: espacio.l }]}>
        Empezás una nueva cursada de teoría: se borran tus parciales, tu asistencia de teoría y tu firma. Tu laboratorio se conserva (Art. 45). Tus finales anteriores quedan en el historial y los aplazos siguen contando en tu promedio con aplazos. Si te equivocás, lo podés deshacer desde la materia.
      </Text>
      <Mensaje texto={error} />
      <Boton
        texto="Confirmar recursada"
        cargando={guardando}
        onPress={async () => {
          setGuardando(true);
          setError(null);
          try {
            await recursarMateria(materiaId);
            vibrar('exito');
            onHecho();
          } catch (e) {
            setError(textoError(e, 'No se pudo marcar para volver a cursar.'));
          } finally {
            setGuardando(false);
          }
        }}
      />
      <Boton texto="Cancelar" variante="fantasma" onPress={onCancelar} estilo={{ marginTop: espacio.s }} />
      <View style={{ height: espacio.l }} />
    </View>
  );
}

/**
 * Cuánto necesita en el final para sacar 1, 2, 3, 4 o 5, con su firma
 * (Art. 57: 0,4 × firma + 0,6 × final, y el final tiene que llegar a 60 %).
 * Con `estimada`, la firma sale de lo que lleva cargado y todavía puede cambiar.
 */
export function TarjetaNotaNecesaria({ firma, estimada, aviso, sinDatos, onGuardarFirma }: {
  firma: number | null;
  estimada?: boolean;
  /** Por ejemplo, que con lo que lleva todavía no firma. */
  aviso?: string;
  /** Texto cuando todavía no hay con qué calcular. */
  sinDatos?: string;
  /** Firmada sin promedio guardado: deja escribir con cuánto firmó. */
  onGuardarFirma?: (firma: number) => Promise<void>;
}) {
  const [firmaTxt, setFirmaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabla = firma != null ? finalesNecesarios(firma) : [];
  const paraDos = tabla[0]?.necesario ?? null;

  const guardar = async () => {
    const f = num(firmaTxt);
    if (!onGuardarFirma || f == null || !Number.isFinite(f) || f < 0 || f > 100) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardarFirma(Math.round(f + 1e-9));
      setFirmaTxt('');
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar la firma.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta>
      {firma == null ? (
        onGuardarFirma ? (
          <>
            <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'flex-end' }}>
              <Campo etiqueta="¿Con cuánto firmaste? (%)" value={firmaTxt} onChangeText={setFirmaTxt} keyboardType="decimal-pad" placeholder="Ej. 72" estilo={{ flex: 1, marginBottom: 0 }} />
              <Boton texto="Guardar" compacto onPress={guardar} deshabilitado={!firmaValida(firmaTxt)} cargando={guardando} />
            </View>
            <Text style={[s.filaDetalle, { marginTop: 6 }]}>Con tu firma te decimos cuánto necesitás en el final para cada nota.</Text>
            {error && <Mensaje texto={error} />}
          </>
        ) : (
          <Text style={s.filaDetalle}>{sinDatos ?? 'Todavía no hay datos para calcularlo.'}</Text>
        )
      ) : (
        <>
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino }}>
            {estimada ? `Con lo que llevás: ${pct(firma)}` : `Tu firma: ${pct(firma)}`}
          </Text>
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
            {estimada
              ? 'Es tu promedio de ahora; cambia con cada parcial que cargues.'
              : 'Tu nota final es 40 % de la firma y 60 % del final.'}
          </Text>
          {aviso && <Mensaje tipo="info" texto={aviso} />}
          <FilaNota nota={1} texto={paraDos == null ? 'Con cualquier nota' : `Menos de ${pct2(paraDos)}`} apagada />
          {tabla.map(({ nota, necesario }) => (
            <FilaNota key={nota} nota={nota} texto={necesario == null ? 'No alcanza' : `${pct2(necesario)} o más`} apagada={necesario == null} />
          ))}
          <Text style={[s.filaDetalle, { marginTop: espacio.s }]}>
            El final tiene que llegar al {FINAL_MINIMO} % para contar; con menos es aplazo.
          </Text>
        </>
      )}
    </Tarjeta>
  );
}

function FilaNota({ nota, texto, apagada }: { nota: Nota; texto: string; apagada?: boolean }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s, borderBottomWidth: nota === 5 ? 0 : 1, borderBottomColor: colores.lineaSuave }}
      accessible
      accessibilityLabel={`Para sacar ${nota}, ${CONCEPTO[nota]}: ${texto} en el final`}
    >
      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: nota >= 2 ? fondos.verdeFondo : fondos.rojoFondo }}>
        <Text style={{ fontFamily: fuentes.bold, fontSize: 15, color: nota >= 2 ? colores.verde : colores.rojo }}>{nota}</Text>
      </View>
      <Text style={[s.filaDetalle, { flex: 1 }]}>{CONCEPTO[nota]}</Text>
      <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: apagada ? colores.textoSuave : colores.texto }}>{texto}</Text>
    </View>
  );
}

function Enlace({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ paddingVertical: 6, marginTop: 4 }}>
      <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>{texto}</Text>
    </Pressable>
  );
}
