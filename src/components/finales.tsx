/**
 * Tarjeta de finales de una materia: los tres llamados de un periodo.
 * Con el promedio de firma guardado se carga el porcentaje del final y la
 * nota sale sola (0,4 × firma + 0,6 × final, Art. 57). Sin firma guardada
 * se carga la nota directo. Los llamados vacíos no cuentan.
 *
 * Un llamado se puede marcar como usado para la regularización (Art. 40–41):
 * no lleva nota y no cuenta para los promedios. Con tres aplazos en la
 * cursada actual hay que volver a cursar (Art. 62): la tarjeta lo avisa y
 * deja recursar, que conserva el laboratorio (Art. 45).
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cargarFinales, guardarFinales, guardarFirma, recursarMateria } from '../datos/academico';
import { APLAZOS_PARA_RECURSAR, aplazosDeLaCursada, notaDelLlamado, periodoDe, type LlamadoCargado } from '../lib/finales';
import { calificacionFinal, CONCEPTO, FINAL_MINIMO, finalNecesario, type Nota } from '../lib/reglamento-fcq';
import type { ExamenFinalDb } from '../lib/tipos-db';
import { colores, espacio, fuentes } from '../tema';
import { pct } from './academico';
import { Boton, Campo, Chip, Mensaje, s, Tarjeta } from './ui';

const LLAMADOS = [1, 2, 3] as const;
const NOMBRE_LLAMADO = { 1: '1.er llamado', 2: '2.º llamado', 3: '3.er llamado' } as const;
type Modo = 'pct' | 'nota' | 'regu';

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

export function TarjetaFinales({ materiaId, firma, aprobada, onGuardado }: {
  materiaId: string;
  /** Ya aprobada: no se ofrece volver a cursar. */
  aprobada?: boolean;
  /** Promedio de firma guardado (0 a 100), o null. */
  firma: number | null;
  /** Después de guardar: recargar la materia (estado y nota). */
  onGuardado: (firma: number | null) => void;
}) {
  const [todos, setFinales] = useState<ExamenFinalDb[] | null>(null);
  // Solo los de la cursada actual: los de antes de recursar no se editan.
  const finales = useMemo(() => todos?.filter((f) => !f.cursada_anterior) ?? null, [todos]);
  const anteriores = useMemo(() => todos?.filter((f) => f.cursada_anterior && f.nota != null) ?? [], [todos]);
  const [confirmarRecursar, setConfirmarRecursar] = useState(false);
  const [periodo, setPeriodo] = useState(periodoDe());
  const [valores, setValores] = useState<Record<number, string>>({});
  // Cada llamado se carga como porcentaje del final o como nota. Un llamado
  // guardado como nota sigue siendo nota aunque después se cargue la firma.
  const [modos, setModos] = useState<Record<number, Modo>>({});
  const [firmaTxt, setFirmaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);

  useEffect(() => {
    cargarFinales(materiaId).then(setFinales).catch((e) => setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron cargar los finales.' }));
  }, [materiaId]);

  const periodos = useMemo(() => {
    const actual = periodoDe();
    // El actual y los cinco anteriores (dos años y medio), más los ya guardados.
    const recientes = [actual];
    for (let i = 0; i < 5; i++) recientes.push(anterior(recientes[recientes.length - 1]));
    const lista = new Set([...recientes, ...(finales ?? []).map((f) => f.periodo).filter((p): p is string => !!p)]);
    return [...lista].sort().reverse();
  }, [finales]);

  // Carga lo guardado del periodo elegido en los campos.
  useEffect(() => {
    if (!finales) return;
    const v: Record<number, string> = {};
    const m: Record<number, Modo> = {};
    for (const ll of LLAMADOS) m[ll] = firma != null ? 'pct' : 'nota';
    for (const f of finales.filter((x) => x.periodo === periodo)) {
      if (f.llamado == null) continue;
      if (f.tipo === 'regularizacion') {
        m[f.llamado] = 'regu';
        continue;
      }
      const pct = firma != null && f.porcentaje != null;
      m[f.llamado] = pct ? 'pct' : 'nota';
      v[f.llamado] = pct ? String(Number(f.porcentaje)) : String(f.nota);
    }
    setValores(v);
    setModos(m);
  }, [finales, periodo, firma]);

  useEffect(() => setMsg(null), [periodo]);

  const filas = LLAMADOS.map((ll) => {
    if (modos[ll] === 'regu') return { llamado: ll, v: null, valido: true, nota: null, rendimiento: null, conPorcentaje: false, regu: true };
    const conPorcentaje = firma != null && (modos[ll] ?? 'pct') === 'pct';
    const v = num(valores[ll] ?? '');
    const valido = v == null || (Number.isFinite(v) && (conPorcentaje ? v >= 0 && v <= 100 : Number.isInteger(v) && v >= 1 && v <= 5));
    const nota = valido && v != null ? notaDelLlamado(firma, conPorcentaje ? v : null, conPorcentaje ? null : v, calificacionFinal) : null;
    const rendimiento = conPorcentaje && v != null && valido ? calificacionFinal(firma!, v).rendimiento : null;
    return { llamado: ll, v, valido, nota, rendimiento, conPorcentaje, regu: false };
  });
  const todoValido = filas.every((f) => f.valido);
  // Después de aprobar no se rinde de nuevo: avisa si cargó un llamado posterior.
  const primeraAprobada = filas.find((f) => f.nota != null && f.nota >= 2)?.llamado ?? null;
  const despuesDeAprobar = primeraAprobada != null && filas.some((f) => f.llamado > primeraAprobada && f.nota != null);
  const necesario = firma != null ? finalNecesario(firma) : null;
  const cursada = aplazosDeLaCursada(finales ?? []);

  const guardar = async () => {
    setGuardando(true);
    setMsg(null);
    try {
      const llamados: LlamadoCargado[] = filas
        .filter((f) => f.nota != null || f.regu)
        .map((f) => (f.regu
          ? { llamado: f.llamado, tipo: 'regularizacion' as const, nota: null, porcentaje: null }
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

  const cambiarModo = (ll: number, m: Modo) => {
    setModos({ ...modos, [ll]: m });
    setValores({ ...valores, [ll]: '' });
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
      onGuardado(Math.round(f * 100) / 100);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la firma.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta>
      {firma == null ? (
        <View style={{ marginBottom: espacio.m }}>
          <Text style={s.filaDetalle}>Si cargás tu promedio de firma, solo ponés cuánto sacaste en el final y la nota sale sola (40 % firma + 60 % final).</Text>
          <View style={{ flexDirection: 'row', gap: espacio.s, alignItems: 'flex-end', marginTop: espacio.s }}>
            <Campo etiqueta="Promedio de firma (%)" value={firmaTxt} onChangeText={setFirmaTxt} keyboardType="decimal-pad" placeholder="Ej. 72" estilo={{ flex: 1, marginBottom: 0 }} />
            <Boton texto="Guardar" compacto onPress={guardarMiFirma} deshabilitado={!firmaValida(firmaTxt)} cargando={guardando} />
          </View>
        </View>
      ) : (
        <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
          Firma {pct(firma)}. {necesario == null ? 'Con esta firma no alcanza para aprobar en el final.' : `Para aprobar necesitás ${pct(necesario)} en el final (mínimo ${FINAL_MINIMO} %).`}
        </Text>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {periodos.map((p) => (
          <Chip key={p} texto={`${p.split('-')[1]}.º sem. ${p.split('-')[0]}`} elegido={p === periodo} onPress={() => setPeriodo(p)} />
        ))}
      </View>

      {filas.map((f) => (
        <View key={f.llamado} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginBottom: espacio.s }}>
          {f.regu ? (
            <View style={{ flex: 1, paddingVertical: espacio.s }}>
              <Text style={[s.filaDetalle, { fontFamily: fuentes.semibold, color: colores.marino }]}>{NOMBRE_LLAMADO[f.llamado]}</Text>
              <Text style={s.filaDetalle}>Lo usaste para la regularización. No lleva nota de final.</Text>
            </View>
          ) : (
            <Campo
              etiqueta={`${NOMBRE_LLAMADO[f.llamado]} ${f.conPorcentaje ? '(% del final)' : '(nota 1 a 5)'}`}
              value={valores[f.llamado] ?? ''}
              onChangeText={(t) => setValores({ ...valores, [f.llamado]: t })}
              keyboardType="decimal-pad"
              placeholder="No lo rendí"
              maxLength={5}
              estilo={{ flex: 1, marginBottom: 0 }}
            />
          )}
          <View style={{ width: 110, alignItems: 'flex-end', gap: 2 }}>
            {f.nota != null ? (
              <>
                <Text style={{ fontFamily: fuentes.bold, fontSize: 22, color: f.nota >= 2 ? colores.verde : colores.rojo }}>{f.nota}</Text>
                <Text style={s.filaDetalle}>{f.rendimiento != null ? `${pct(f.rendimiento)} · ` : ''}{CONCEPTO[f.nota as Nota]}</Text>
              </>
            ) : !f.valido ? (
              <Text style={[s.filaDetalle, { color: colores.rojo }]}>{f.conPorcentaje ? '0 a 100' : '1 a 5'}</Text>
            ) : null}
            {firma != null && !f.regu && (
              <Enlace texto={f.conPorcentaje ? 'Poner nota' : 'Poner %'} onPress={() => cambiarModo(f.llamado, f.conPorcentaje ? 'nota' : 'pct')} />
            )}
            <Enlace
              texto={f.regu ? 'Fue un final' : 'Fue regularización'}
              onPress={() => cambiarModo(f.llamado, f.regu ? (firma != null ? 'pct' : 'nota') : 'regu')}
            />
          </View>
        </View>
      ))}
      {despuesDeAprobar && <Mensaje tipo="info" texto="Cargaste un llamado después del que aprobaste. ¿Seguro que lo rendiste?" />}
      <Text style={[s.filaDetalle, { marginVertical: espacio.s }]}>Dejá vacíos los llamados que no rendiste: no cuentan. Los aplazos (1) cuentan para el promedio con aplazos. Si faltaste a un parcial y rendiste la regularización en un llamado, marcalo con «Fue regularización»: ese llamado queda usado.</Text>
      <Boton texto="Guardar finales" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!todoValido || finales == null} />
      {msg && <Mensaje texto={msg.texto} tipo={msg.tipo} />}

      {anteriores.length > 0 && (
        <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>
          De cursadas anteriores: {anteriores.map((f) => f.nota).join(', ')}. Cuentan para el promedio con aplazos.
        </Text>
      )}
      {aprobada ? null : cursada.debeRecursar ? (
        <View style={{ marginTop: espacio.m }}>
          <Mensaje tipo="error" texto={`Tenés ${cursada.aplazos} aplazos en esta cursada: tenés que volver a cursar la materia (Art. 62). Se conserva tu promedio de laboratorio (Art. 45).`} />
          <Boton texto={confirmarRecursar ? 'Sí, volver a cursar' : 'Volver a cursar'} icono="refresh" variante={confirmarRecursar ? 'peligro' : 'secundario'} onPress={recursar} cargando={guardando} />
        </View>
      ) : (
        <View style={{ marginTop: espacio.m }}>
          {cursada.aplazos > 0 && (
            <Text style={s.filaDetalle}>
              Aplazos en esta cursada: {cursada.aplazos} de {APLAZOS_PARA_RECURSAR}. Con {APLAZOS_PARA_RECURSAR} hay que volver a cursar.
            </Text>
          )}
          <Enlace
            texto={confirmarRecursar ? 'Tocá de nuevo para confirmar: se borran tus parciales y se conserva el laboratorio' : '¿Se te venció la firma? Volver a cursar'}
            onPress={recursar}
          />
        </View>
      )}
      {confirmarRecursar && !aprobada && <Enlace texto="Cancelar" onPress={() => setConfirmarRecursar(false)} />}
    </Tarjeta>
  );
}

function Enlace({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ paddingVertical: 4 }}>
      <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>{texto}</Text>
    </Pressable>
  );
}
