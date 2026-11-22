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
 * volver a cursar (Art. 62): recién ahí la tarjeta ofrece recursar (se
 * puede deshacer desde la materia), que
 * conserva el laboratorio (Art. 45).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cargarFinales, guardarFinales, guardarFirma, recursarMateria } from '../datos/academico';
import { aplazosDeLaCursada, firmaVencida, notaDelLlamado, periodoDe, type LlamadoCargado } from '../lib/finales';
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

/** Porcentaje con dos decimales: junto al límite de aprobación, uno solo engaña (65,84 se vería 65,8). */
const pct2 = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',').replace(/0$/, '')} %`;

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
  const [eligiendoPeriodo, setEligiendoPeriodo] = useState(false);
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
  // Resumen de lo cargado en cada periodo, para la lista de periodos.
  const resumen = (p: string) => {
    const delPeriodo = (finales ?? []).filter((f) => f.periodo === p && f.llamado != null).sort((a, b) => (a.llamado ?? 0) - (b.llamado ?? 0));
    if (!delPeriodo.length) return 'Sin finales cargados';
    return delPeriodo.map((f) => `${f.llamado}.º: ${f.tipo === 'recuperatorio' ? 'Recu' : f.tipo === 'regularizacion' ? 'Regu' : f.nota}`).join(' · ');
  };

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
  // Art. 49 y 62: dos periodos sin aprobar vencen la firma.
  const vencida = !cursada.debeRecursar && (firmaVencida(finales ?? [], periodo) || firmaVencida(finales ?? [], periodoDe()));

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
          <Text style={s.filaDetalle}>{necesario == null ? 'Con esta firma no alcanza para aprobar.' : `Para aprobar necesitás ${pct2(necesario)} en el final.`}</Text>
        </View>
      )}

      {/* Periodo: el de ahora por defecto; los anteriores se eligen de una lista. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.s }}>
        <View style={{ flex: 1 }}>
          <Text style={s.filaDetalle}>Finales de</Text>
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 16, color: colores.marino }}>{nombrePeriodo(periodo)}{periodo === periodoDe() ? ' (este semestre)' : ''}</Text>
        </View>
        <Enlace texto={eligiendoPeriodo ? 'Cerrar' : 'Otro semestre'} onPress={() => setEligiendoPeriodo(!eligiendoPeriodo)} />
      </View>
      {eligiendoPeriodo && (
        <View style={{ borderWidth: 1, borderColor: colores.linea, borderRadius: 12, marginBottom: espacio.m }}>
          {periodos.map((p, i) => (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ checked: p === periodo }}
              onPress={() => {
                setPeriodo(p);
                setEligiendoPeriodo(false);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, padding: espacio.m, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colores.linea, backgroundColor: p === periodo ? colores.grisFondo : 'transparent' }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: p === periodo ? fuentes.semibold : fuentes.regular, fontSize: 15, color: colores.texto }}>{nombrePeriodo(p)}</Text>
                <Text style={s.filaDetalle}>{resumen(p)}</Text>
              </View>
              {p === periodo && <Ionicons name="checkmark" size={20} color={colores.marino} />}
            </Pressable>
          ))}
        </View>
      )}

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
            <Text style={[s.filaDetalle, { marginTop: 4 }]}>Nota final {pct2(f.rendimiento)} (40 % firma + 60 % final)</Text>
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

      {/* Volver a cursar: solo cuando ya usó sus oportunidades (3 aplazos) o se venció la firma. */}
      {!aprobada && (cursada.debeRecursar || vencida) && (
        <View style={{ marginTop: espacio.m }}>
          <Mensaje
            tipo="error"
            texto={cursada.debeRecursar
              ? `Usaste tus ${cursada.aplazos} oportunidades sin aprobar: tenés que volver a cursar la materia.`
              : 'Pasaron dos periodos sin aprobar y tu firma venció: tenés que volver a cursar la materia.'}
          />
          {confirmarRecursar && (
            <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>Se borran tus parciales y tu firma; el laboratorio se conserva y tus finales quedan en el historial. Si te equivocaste, después lo podés deshacer.</Text>
          )}
          <Boton texto={confirmarRecursar ? 'Sí, volver a cursar' : 'Volver a cursar la materia'} icono="refresh" variante={confirmarRecursar ? 'peligro' : 'primario'} onPress={recursar} cargando={guardando} />
          {confirmarRecursar && <Enlace texto="Cancelar" onPress={() => setConfirmarRecursar(false)} />}
        </View>
      )}
    </Tarjeta>
  );
}

function Enlace({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ paddingVertical: 6, marginTop: 4 }}>
      <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>{texto}</Text>
    </Pressable>
  );
}
