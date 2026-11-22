/**
 * Tarjeta de finales de una materia: los tres llamados de un periodo.
 *
 * Cada llamado se marca como "No rendí", "Final", "Recu" (recuperatorio,
 * solo 1.er llamado) o "Regu" (regularización, 1.º o 2.º llamado).
 * Con el promedio de firma guardado, en un final se carga el porcentaje
 * del examen y la nota sale sola (0,4 × firma + 0,6 × final, Art. 57); sin
 * firma, o si lo prefiere, se carga la nota directo.
 *
 * Un llamado usado para la regularización (Art. 40–41) no lleva nota y no
 * cuenta para los promedios. Con tres aplazos en la cursada actual hay que
 * volver a cursar (Art. 62): la tarjeta lo avisa y deja recursar, que
 * conserva el laboratorio (Art. 45).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cargarFinales, guardarFinales, guardarFirma, recursarMateria } from '../datos/academico';
import { aplazosDeLaCursada, notaDelLlamado, periodoDe, type LlamadoCargado } from '../lib/finales';
import { calificacionFinal, CONCEPTO, finalNecesario, type Nota } from '../lib/reglamento-fcq';
import type { ExamenFinalDb } from '../lib/tipos-db';
import { colores, espacio, fuentes } from '../tema';
import { pct } from './academico';
import { Boton, Campo, Mensaje, s, Segmentado, Tarjeta } from './ui';

const LLAMADOS = [1, 2, 3] as const;
const NOMBRE_LLAMADO = { 1: '1.er llamado', 2: '2.º llamado', 3: '3.er llamado' } as const;
type Tipo = 'no' | 'final' | 'recu' | 'regu';
const TEXTO_TIPO: Record<Tipo, string> = { no: 'No rendí', final: 'Final', recu: 'Recu', regu: 'Regu' };
// El recuperatorio solo se rinde en el 1.er llamado; la regularización, en el 1.º o el 2.º.
const TIPOS_DEL_LLAMADO: Record<1 | 2 | 3, Tipo[]> = {
  1: ['no', 'final', 'recu', 'regu'],
  2: ['no', 'final', 'regu'],
  3: ['no', 'final'],
};
const A_DB = { recu: 'recuperatorio', regu: 'regularizacion' } as const;

/** null si está vacío; NaN si no es un número (se marca como inválido, no como vacío). */
const num = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.').trim()));

const firmaValida = (t: string) => {
  const f = num(t);
  return f != null && Number.isFinite(f) && f >= 0 && f <= 100;
};

/** Periodo anterior: "2026-1" → "2025-2". */
function anterior(p: string): string {
  const [a, n] = p.split('-').map(Number);
  return n === 2 ? `${a}-1` : `${a - 1}-2`;
}

const nombrePeriodo = (p: string) => `${p.split('-')[1]}.º semestre ${p.split('-')[0]}`;

export function TarjetaFinales({ materiaId, firma: firmaGuardadaEnMateria, aprobada, onGuardado }: {
  materiaId: string;
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
  const [todos, setFinales] = useState<ExamenFinalDb[] | null>(null);
  // Solo los de la cursada actual: los de antes de recursar no se editan.
  const finales = useMemo(() => todos?.filter((f) => !f.cursada_anterior) ?? null, [todos]);
  const anteriores = useMemo(() => todos?.filter((f) => f.cursada_anterior && f.nota != null) ?? [], [todos]);
  const [periodo, setPeriodo] = useState(periodoDe());
  const [tipos, setTipos] = useState<Record<number, Tipo>>({});
  const [valores, setValores] = useState<Record<number, string>>({});
  // Llamados cargados con la nota directa aunque haya firma.
  const [conNota, setConNota] = useState<Record<number, boolean>>({});
  const [firmaTxt, setFirmaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarRecursar, setConfirmarRecursar] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);

  useEffect(() => {
    cargarFinales(materiaId).then(setFinales).catch((e) => setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron cargar los finales.' }));
  }, [materiaId]);

  // El actual y los cinco anteriores (dos años y medio), más los ya guardados.
  const periodos = useMemo(() => {
    const recientes = [periodoDe()];
    for (let i = 0; i < 5; i++) recientes.push(anterior(recientes[recientes.length - 1]));
    const lista = new Set([...recientes, ...(finales ?? []).map((f) => f.periodo).filter((p): p is string => !!p)]);
    return [...lista].sort().reverse();
  }, [finales]);
  const iPeriodo = periodos.indexOf(periodo);

  // Carga lo guardado del periodo elegido.
  useEffect(() => {
    if (!finales) return;
    const t: Record<number, Tipo> = {};
    const v: Record<number, string> = {};
    const n: Record<number, boolean> = {};
    for (const f of finales.filter((x) => x.periodo === periodo)) {
      if (f.llamado == null) continue;
      if (f.tipo === 'regularizacion' || f.tipo === 'recuperatorio') {
        const tipo: Tipo = f.tipo === 'recuperatorio' ? 'recu' : 'regu';
        // Si quedó en un llamado donde no se permite, se muestra como "No rendí".
        if (TIPOS_DEL_LLAMADO[f.llamado as 1 | 2 | 3]?.includes(tipo)) t[f.llamado] = tipo;
        continue;
      }
      t[f.llamado] = 'final';
      const usaPct = firma != null && f.porcentaje != null;
      n[f.llamado] = !usaPct;
      v[f.llamado] = usaPct ? String(Number(f.porcentaje)) : String(f.nota);
    }
    setTipos(t);
    setValores(v);
    setConNota(n);
  }, [finales, periodo, firma]);

  useEffect(() => {
    setMsg(null);
    setConfirmarRecursar(false);
  }, [periodo]);

  const filas = LLAMADOS.map((ll) => {
    const tipo = tipos[ll] ?? 'no';
    const conPorcentaje = firma != null && !conNota[ll];
    const v = tipo === 'final' ? num(valores[ll] ?? '') : null;
    const valido = v == null || (Number.isFinite(v) && (conPorcentaje ? v >= 0 && v <= 100 : Number.isInteger(v) && v >= 1 && v <= 5));
    const nota = valido && v != null ? notaDelLlamado(firma, conPorcentaje ? v : null, conPorcentaje ? null : v, calificacionFinal) : null;
    const rendimiento = conPorcentaje && v != null && valido ? calificacionFinal(firma!, v).rendimiento : null;
    return { llamado: ll, tipo, v, valido, nota, rendimiento, conPorcentaje };
  });
  // Un final marcado pero sin nota todavía no se puede guardar.
  const falta = filas.some((f) => f.tipo === 'final' && f.v == null);
  const todoValido = filas.every((f) => f.valido) && !falta;
  // Después de aprobar no se rinde de nuevo: avisa si cargó un llamado posterior.
  const primeraAprobada = filas.find((f) => f.nota != null && f.nota >= 2)?.llamado ?? null;
  const despuesDeAprobar = primeraAprobada != null && filas.some((f) => f.llamado > primeraAprobada && f.tipo !== 'no');
  const necesario = firma != null ? finalNecesario(firma) : null;
  const cursada = aplazosDeLaCursada(finales ?? []);

  const cambiarTipo = (ll: number, t: Tipo) => {
    setTipos({ ...tipos, [ll]: t });
    if (t !== 'final') setValores({ ...valores, [ll]: '' });
  };

  const guardar = async () => {
    setGuardando(true);
    setMsg(null);
    try {
      const llamados: LlamadoCargado[] = filas
        .filter((f) => f.tipo === 'regu' || f.tipo === 'recu' || f.nota != null)
        .map((f) => (f.tipo === 'regu' || f.tipo === 'recu'
          ? { llamado: f.llamado, tipo: A_DB[f.tipo], nota: null, porcentaje: null }
          : { llamado: f.llamado, tipo: 'final' as const, nota: f.nota!, porcentaje: f.conPorcentaje ? f.v : null }));
      await guardarFinales(materiaId, periodo, llamados);
      setFinales(await cargarFinales(materiaId));
      const aprobo = llamados.find((l) => l.nota != null && l.nota >= 2);
      setMsg({ tipo: 'exito', texto: aprobo ? `Guardado. Aprobaste con ${aprobo.nota} (${CONCEPTO[aprobo.nota as Nota]}).` : 'Guardado.' });
      onGuardado(firma);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  const recursar = async () => {
    if (!confirmarRecursar) {
      setConfirmarRecursar(true);
      return;
    }
    setGuardando(true);
    setMsg(null);
    try {
      await recursarMateria(materiaId);
      setFirmaNueva(null);
      onGuardado(null);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo marcar para volver a cursar.' });
      setGuardando(false);
    }
  };

  const guardarMiFirma = async () => {
    const f = num(firmaTxt);
    if (f == null || !Number.isFinite(f) || f < 0 || f > 100) return;
    setGuardando(true);
    try {
      await guardarFirma(materiaId, Math.round(f * 100) / 100);
      setFirmaNueva(Math.round(f * 100) / 100);
      onGuardado(Math.round(f * 100) / 100);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la firma.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta>
      {/* Firma: con ella la nota del final sale sola. */}
      {firma == null ? (
        <View style={{ marginBottom: espacio.m }}>
          <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'flex-end' }}>
            <Campo etiqueta="Firma (%)" value={firmaTxt} onChangeText={setFirmaTxt} keyboardType="decimal-pad" placeholder="Ej. 72" estilo={{ flex: 1, marginBottom: 0 }} />
            <Boton texto="Guardar" compacto onPress={guardarMiFirma} deshabilitado={!firmaValida(firmaTxt)} cargando={guardando} />
          </View>
          <Text style={[s.filaDetalle, { marginTop: 6 }]}>Con tu firma, en cada final ponés el porcentaje y la nota sale sola.</Text>
        </View>
      ) : (
        <View style={{ marginBottom: espacio.m }}>
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino }}>Firma {pct(firma)}</Text>
          <Text style={s.filaDetalle}>{necesario == null ? 'Con esta firma no alcanza para aprobar.' : `Para aprobar necesitás ${pct(necesario)} en el final.`}</Text>
        </View>
      )}

      {/* Periodo: uno a la vez, con flechas. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.m }}>
        <Flecha icono="chevron-back" etiqueta="Periodo anterior" deshabilitada={iPeriodo >= periodos.length - 1} onPress={() => setPeriodo(periodos[iPeriodo + 1])} />
        <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino }}>{nombrePeriodo(periodo)}</Text>
        <Flecha icono="chevron-forward" etiqueta="Periodo siguiente" deshabilitada={iPeriodo <= 0} onPress={() => setPeriodo(periodos[iPeriodo - 1])} />
      </View>

      {filas.map((f, i) => (
        <View key={f.llamado} style={{ paddingVertical: espacio.m, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colores.linea }}>
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto, marginBottom: espacio.s }}>{NOMBRE_LLAMADO[f.llamado]}</Text>
          <Segmentado opciones={TIPOS_DEL_LLAMADO[f.llamado].map((valor) => ({ valor, texto: TEXTO_TIPO[valor] }))} valor={f.tipo} onCambio={(t) => cambiarTipo(f.llamado, t)} />
          {f.tipo === 'final' && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espacio.m }}>
              <Campo
                etiqueta={f.conPorcentaje ? '¿Cuánto sacaste en el final? (%)' : 'Nota (1 a 5)'}
                value={valores[f.llamado] ?? ''}
                onChangeText={(t) => setValores({ ...valores, [f.llamado]: t })}
                keyboardType="decimal-pad"
                placeholder={f.conPorcentaje ? 'Ej. 75' : 'Ej. 4'}
                maxLength={5}
                estilo={{ flex: 1, marginBottom: 0 }}
              />
              <View style={{ width: 96, alignItems: 'flex-end', paddingBottom: 4 }}>
                {f.nota != null ? (
                  <>
                    <Text style={{ fontFamily: fuentes.bold, fontSize: 24, color: f.nota >= 2 ? colores.verde : colores.rojo }}>{f.nota}</Text>
                    <Text style={s.filaDetalle}>{CONCEPTO[f.nota as Nota]}</Text>
                  </>
                ) : !f.valido ? (
                  <Text style={[s.filaDetalle, { color: colores.rojo }]}>{f.conPorcentaje ? 'De 0 a 100' : 'De 1 a 5'}</Text>
                ) : null}
              </View>
            </View>
          )}
          {f.tipo === 'final' && f.rendimiento != null && (
            <Text style={[s.filaDetalle, { marginTop: 4 }]}>Nota final {pct(f.rendimiento)} (40 % firma + 60 % final)</Text>
          )}
          {f.tipo === 'final' && firma != null && (
            <Enlace
              texto={f.conPorcentaje ? 'Sé la nota, no el porcentaje' : 'Cargar el porcentaje'}
              onPress={() => {
                setConNota({ ...conNota, [f.llamado]: f.conPorcentaje });
                setValores({ ...valores, [f.llamado]: '' });
              }}
            />
          )}
          {f.tipo === 'regu' && (
            <Text style={[s.filaDetalle, { marginTop: espacio.s }]}>Regularización: rendiste el parcial al que faltaste. Este llamado queda usado y no lleva nota. Cargá la nota en la calculadora de firma.</Text>
          )}
          {f.tipo === 'recu' && (
            <Text style={[s.filaDetalle, { marginTop: espacio.s }]}>Recuperatorio: rendiste para levantar tu promedio de teoría. Este llamado queda usado y no lleva nota. Cargá la nota en la calculadora de firma.</Text>
          )}
        </View>
      ))}

      {despuesDeAprobar && <Mensaje tipo="info" texto="Marcaste un llamado después del que aprobaste. ¿Seguro que lo rendiste?" />}
      <Boton texto="Guardar finales" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!todoValido || finales == null} />
      {msg && <Mensaje texto={msg.texto} tipo={msg.tipo} />}

      {anteriores.length > 0 && (
        <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>
          Notas de la cursada anterior: {anteriores.map((f) => f.nota).join(', ')}. Cuentan para el promedio con aplazos.
        </Text>
      )}

      {/* Volver a cursar: con 3 aplazos, o si se venció la firma. */}
      {!aprobada && (cursada.debeRecursar ? (
        <View style={{ marginTop: espacio.m }}>
          <Mensaje tipo="error" texto={`Tenés ${cursada.aplazos} aplazos: tenés que volver a cursar la materia. Tu laboratorio se conserva.`} />
          <Boton texto={confirmarRecursar ? 'Sí, volver a cursar' : 'Volver a cursar'} icono="refresh" variante={confirmarRecursar ? 'peligro' : 'secundario'} onPress={recursar} cargando={guardando} />
          {confirmarRecursar && <Enlace texto="Cancelar" onPress={() => setConfirmarRecursar(false)} />}
        </View>
      ) : confirmarRecursar ? (
        <View style={{ marginTop: espacio.m }}>
          <Mensaje tipo="info" texto="Se borran tus parciales y tu firma; el laboratorio se conserva. Tus finales quedan en el historial." />
          <Boton texto="Sí, volver a cursar" icono="refresh" variante="peligro" onPress={recursar} cargando={guardando} />
          <Enlace texto="Cancelar" onPress={() => setConfirmarRecursar(false)} />
        </View>
      ) : (
        <Enlace texto="Tengo que volver a cursarla" onPress={recursar} />
      ))}
    </Tarjeta>
  );
}

function Flecha({ icono, etiqueta, deshabilitada, onPress }: { icono: 'chevron-back' | 'chevron-forward'; etiqueta: string; deshabilitada: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: deshabilitada }}
      disabled={deshabilitada}
      onPress={onPress}
      hitSlop={8}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.grisFondo, opacity: deshabilitada ? 0.35 : 1 }}
    >
      <Ionicons name={icono} size={20} color={colores.marino} />
    </Pressable>
  );
}

function Enlace({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ paddingVertical: 6, marginTop: 4 }}>
      <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>{texto}</Text>
    </Pressable>
  );
}
