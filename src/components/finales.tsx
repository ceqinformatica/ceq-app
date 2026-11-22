/**
 * Tarjeta de finales de una materia: los tres llamados de un periodo.
 * Con el promedio de firma guardado se carga el porcentaje del final y la
 * nota sale sola (0,4 × firma + 0,6 × final, Art. 57). Sin firma guardada
 * se carga la nota directo. Los llamados vacíos no cuentan.
 */
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { cargarFinales, guardarFinales, guardarFirma } from '../datos/academico';
import { notaDelLlamado, periodoDe, type LlamadoCargado } from '../lib/finales';
import { calificacionFinal, CONCEPTO, FINAL_MINIMO, finalNecesario, type Nota } from '../lib/reglamento-fcq';
import type { ExamenFinalDb } from '../lib/tipos-db';
import { colores, espacio, fuentes } from '../tema';
import { pct } from './academico';
import { Boton, Campo, Chip, Mensaje, s, Tarjeta } from './ui';

const LLAMADOS = [1, 2, 3] as const;
const NOMBRE_LLAMADO = { 1: '1.er llamado', 2: '2.º llamado', 3: '3.er llamado' } as const;

const num = (t: string) => {
  const v = t.trim() === '' ? null : Number(t.replace(',', '.'));
  return v != null && Number.isFinite(v) ? v : null;
};

/** Periodo anterior: "2026-1" → "2025-2". */
function anterior(p: string): string {
  const [a, n] = p.split('-').map(Number);
  return n === 2 ? `${a}-1` : `${a - 1}-2`;
}

export function TarjetaFinales({ materiaId, firma, onGuardado }: {
  materiaId: string;
  /** Promedio de firma guardado (0 a 100), o null. */
  firma: number | null;
  /** Después de guardar: recargar la materia (estado y nota). */
  onGuardado: (firma: number | null) => void;
}) {
  const [finales, setFinales] = useState<ExamenFinalDb[] | null>(null);
  const [periodo, setPeriodo] = useState(periodoDe());
  const [valores, setValores] = useState<Record<number, string>>({});
  const [firmaTxt, setFirmaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);

  useEffect(() => {
    cargarFinales(materiaId).then(setFinales).catch((e) => setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron cargar los finales.' }));
  }, [materiaId]);

  const periodos = useMemo(() => {
    const actual = periodoDe();
    const lista = new Set([actual, anterior(actual), anterior(anterior(actual)), ...(finales ?? []).map((f) => f.periodo).filter((p): p is string => !!p)]);
    return [...lista].sort().reverse();
  }, [finales]);

  // Carga lo guardado del periodo elegido en los campos.
  useEffect(() => {
    if (!finales) return;
    const v: Record<number, string> = {};
    for (const f of finales.filter((x) => x.periodo === periodo)) {
      if (f.llamado == null) continue;
      v[f.llamado] = firma != null && f.porcentaje != null ? String(Number(f.porcentaje)) : String(f.nota);
    }
    setValores(v);
  }, [finales, periodo, firma]);

  useEffect(() => setMsg(null), [periodo]);

  const conPorcentaje = firma != null;
  const filas = LLAMADOS.map((ll) => {
    const v = num(valores[ll] ?? '');
    const valido = v == null || (conPorcentaje ? v >= 0 && v <= 100 : Number.isInteger(v) && v >= 1 && v <= 5);
    const nota = valido ? notaDelLlamado(firma, conPorcentaje ? v : null, conPorcentaje ? null : v, calificacionFinal) : null;
    const rendimiento = conPorcentaje && v != null && valido ? calificacionFinal(firma!, v).rendimiento : null;
    return { llamado: ll, v, valido, nota, rendimiento };
  });
  const todoValido = filas.every((f) => f.valido);
  // Después de aprobar no se rinde de nuevo: avisa si cargó un llamado posterior.
  const primeraAprobada = filas.find((f) => f.nota != null && f.nota >= 2)?.llamado ?? null;
  const despuesDeAprobar = primeraAprobada != null && filas.some((f) => f.llamado > primeraAprobada && f.nota != null);
  const necesario = firma != null ? finalNecesario(firma) : null;

  const guardar = async () => {
    setGuardando(true);
    setMsg(null);
    try {
      const llamados: LlamadoCargado[] = filas
        .filter((f) => f.nota != null)
        .map((f) => ({ llamado: f.llamado, nota: f.nota!, porcentaje: conPorcentaje ? f.v : null }));
      await guardarFinales(materiaId, periodo, llamados);
      setFinales(await cargarFinales(materiaId));
      const aprobo = llamados.find((l) => l.nota >= 2);
      setMsg({ tipo: 'exito', texto: aprobo ? `Guardado. Aprobaste con ${aprobo.nota} (${CONCEPTO[aprobo.nota as Nota]}).` : 'Guardado.' });
      onGuardado(firma);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  const guardarMiFirma = async () => {
    const f = num(firmaTxt);
    if (f == null || f < 0 || f > 100) return;
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
            <Boton texto="Guardar" compacto onPress={guardarMiFirma} deshabilitado={num(firmaTxt) == null || num(firmaTxt)! > 100} cargando={guardando} />
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
          <Campo
            etiqueta={`${NOMBRE_LLAMADO[f.llamado]} ${conPorcentaje ? '(% del final)' : '(nota 1 a 5)'}`}
            value={valores[f.llamado] ?? ''}
            onChangeText={(t) => setValores({ ...valores, [f.llamado]: t })}
            keyboardType="decimal-pad"
            placeholder="No lo rendí"
            maxLength={5}
            estilo={{ flex: 1, marginBottom: 0 }}
          />
          <View style={{ width: 96, alignItems: 'flex-end' }}>
            {f.nota != null ? (
              <>
                <Text style={{ fontFamily: fuentes.bold, fontSize: 22, color: f.nota >= 2 ? colores.verde : colores.rojo }}>{f.nota}</Text>
                <Text style={s.filaDetalle}>{f.rendimiento != null ? `${pct(f.rendimiento)} · ` : ''}{CONCEPTO[f.nota as Nota]}</Text>
              </>
            ) : !f.valido ? (
              <Text style={[s.filaDetalle, { color: colores.rojo }]}>{conPorcentaje ? '0 a 100' : '1 a 5'}</Text>
            ) : null}
          </View>
        </View>
      ))}
      {despuesDeAprobar && <Mensaje tipo="info" texto="Cargaste un llamado después del que aprobaste. ¿Seguro que lo rendiste?" />}
      <Text style={[s.filaDetalle, { marginVertical: espacio.s }]}>Dejá vacíos los llamados que no rendiste: no cuentan. Los aplazos (1) cuentan para el promedio con aplazos.</Text>
      <Boton texto="Guardar finales" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!todoValido || finales == null} />
      {msg && <Mensaje texto={msg.texto} tipo={msg.tipo} />}
    </Tarjeta>
  );
}
