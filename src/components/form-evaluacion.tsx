/**
 * Hoja para agregar o editar una evaluación (rediseño de Josie, 2026-11-26):
 * tipo en una lista (Parcial, Laboratorio, Recu, Regu), y para el Recu y la
 * Regu el semestre del llamado (normal u opuesto) y el llamado que usó. Se usa
 * en la pestaña Parciales de la materia y en la pantalla de Parciales.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cargarFinales, guardarParcial, borrarParcial, nuevoId, tipoEvaluacion, type NuevaEvaluacion, type TipoEvaluacion } from '../datos/academico';
import { textoError } from '../lib/errores';
import { nombreSemestre, periodoAnterior, periodoDe, periodoSiguiente } from '../lib/finales';
import { esPredefinida } from '../lib/firma-carga';
import { esRecuperatorio, esRegularizacion } from '../lib/reglamento-fcq';
import type { EvaluacionDb } from '../lib/tipos-db';
import { colores, espacio, fuentes } from '../tema';
import { pct } from './academico';
import { Boton, Campo, Hoja, Mensaje, Opcion, s, Segmentado } from './ui';

export const ICONO_TIPO: Record<TipoEvaluacion, 'document-text-outline' | 'create-outline' | 'flask-outline' | 'refresh-outline' | 'swap-horizontal-outline'> = {
  parcial: 'document-text-outline',
  tp: 'create-outline',
  laboratorio: 'flask-outline',
  recuperatorio: 'refresh-outline',
  regularizacion: 'swap-horizontal-outline',
};

// Solo parciales y laboratorio: los trabajos prácticos se sacaron porque cada
// docente los cuenta distinto.
const TIPOS: { valor: TipoEvaluacion; texto: string; nombre: string }[] = [
  { valor: 'parcial', texto: 'Parcial', nombre: '' },
  { valor: 'laboratorio', texto: 'Laboratorio', nombre: 'Laboratorio' },
  { valor: 'recuperatorio', texto: 'Recuperación (Recu)', nombre: 'Recuperatorio' },
  { valor: 'regularizacion', texto: 'Regularización (Regu)', nombre: 'Regularización' },
];

export function FormEvaluacion({ visible, evaluacion, materiaId, onCerrar, onGuardado, sinRecuperatorio, otrasRecuRegu, cursaOpuesto }: {
  visible: boolean; evaluacion: EvaluacionDb | null; materiaId: string; onCerrar: () => void; onGuardado: () => void;
  /** Otras evaluaciones de Recu o Regu ya rendidas: se usa uno solo por cursada. */
  otrasRecuRegu: number;
  /** Semestre opuesto: no hay examen de recuperación (Art. 23). */
  sinRecuperatorio?: boolean;
  /** Cursa la materia en el semestre opuesto: la Regu arranca en "Opuesto". */
  cursaOpuesto?: boolean;
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
  // Recu y Regu usan un llamado de finales: en qué semestre, si es normal u opuesto, y cuál.
  const [periodo, setPeriodo] = useState(periodoDe());
  const [opuesto, setOpuesto] = useState(false);
  const [llamado, setLlamado] = useState<1 | 2>(1);
  const [eligiendoSemestre, setEligiendoSemestre] = useState(false);
  // Hasta saber si ya había un Recu o una Regu en Finales, no se guarda (se movería sin querer).
  const [finalesLeidos, setFinalesLeidos] = useState(false);
  const usaLlamado = tipo === 'recuperatorio' || tipo === 'regularizacion';
  // El Recu solo se rinde en el 1.er llamado y en semestre normal.
  const llamadoUsado: 1 | 2 = tipo === 'recuperatorio' ? 1 : llamado;
  const opuestoUsado = tipo === 'recuperatorio' ? false : opuesto;
  const masViejo = periodoAnterior(periodoAnterior(periodoDe()));
  // ID estable mientras el formulario está abierto: si se corta la red y se
  // reintenta, se actualiza la misma evaluación en vez de crear otra.
  const idEstable = useRef('');

  useEffect(() => {
    if (!visible) return;
    const e = evaluacion;
    idEstable.current = e && !esPredefinida(e) ? e.id : nuevoId();
    setNombre(e?.nombre ?? '');
    setTipo(e ? (tipoEvaluacion(e) === 'tp' ? 'parcial' : tipoEvaluacion(e)) : 'parcial');
    setModo(e && e.porcentaje == null && e.puntaje_total != null ? 'puntaje' : 'porcentaje');
    setPorcentaje(e?.porcentaje != null ? String(Number(e.porcentaje)) : '');
    setObtenido(e?.puntaje_obtenido != null ? String(Number(e.puntaje_obtenido)) : '');
    setTotal(e?.puntaje_total != null ? String(Number(e.puntaje_total)) : '');
    setRendida(e && !e.rendida ? 'no' : 'si');
    setError(null);
    setPeriodo(periodoDe());
    setOpuesto(!!cursaOpuesto);
    setLlamado(1);
    setEligiendoSemestre(false);
    setFinalesLeidos(false);
    // Si ya había un Recu o una Regu en Finales, arranca con ese semestre y llamado.
    let vivo = true;
    cargarFinales(materiaId)
      .then((fs) => {
        const usado = fs.find((f) => !f.cursada_anterior && (f.tipo === 'recuperatorio' || f.tipo === 'regularizacion'));
        if (!vivo) return;
        setFinalesLeidos(true);
        if (!usado) return;
        if (usado.periodo) setPeriodo(usado.periodo);
        if (usado.llamado === 1 || usado.llamado === 2) setLlamado(usado.llamado);
        setOpuesto(!!usado.semestre_opuesto);
      })
      .catch(() => vivo && setFinalesLeidos(true));
    return () => {
      vivo = false;
    };
  }, [visible, evaluacion, materiaId, cursaOpuesto]);

  const num = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
  const valido =
    nombre.trim().length > 0 &&
    (rendida === 'no' ||
      (modo === 'porcentaje' ? num(porcentaje) != null && num(porcentaje)! >= 0 && num(porcentaje)! <= 100 : num(obtenido) != null && num(total) != null && num(total)! > 0 && num(obtenido)! <= num(total)!));

  const vistaPrevia = modo === 'puntaje' && num(obtenido) != null && num(total) ? (num(obtenido)! / num(total)!) * 100 : null;

  const eraRecuORegu = evaluacion != null && (esRecuperatorio(evaluacion) || esRegularizacion(evaluacion));
  const registraLlamado = usaLlamado && rendida === 'si';

  const guardar = async () => {
    // Recu o Regu: uno solo por cursada (antes de guardar nada).
    if (registraLlamado && otrasRecuRegu > 0) {
      setError('Ya cargaste un Recu o una Regu rendido en esta cursada: se usa uno solo. Editá ese en vez de agregar otro.');
      return;
    }
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
      // La nota y el llamado en Finales van juntos (una transacción): si algo
      // falla no queda ninguno de los dos a medias.
      await guardarParcial(
        materiaId,
        idEstable.current,
        datos,
        registraLlamado ? { tipo: tipo as 'recuperatorio' | 'regularizacion', periodo, llamado: llamadoUsado, semestre_opuesto: opuestoUsado } : null,
        // Si dejó de ser un Recu o Regu rendido, el llamado se libera.
        !registraLlamado && eraRecuORegu && otrasRecuRegu === 0,
      );
      onGuardado();
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar. Probá de nuevo: no se duplica nada.'));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!evaluacion) return;
    setGuardando(true);
    try {
      // Sin Recu ni Regu cargado, el llamado deja de estar en Finales (en la misma transacción).
      await borrarParcial(materiaId, evaluacion.id, eraRecuORegu && otrasRecuRegu === 0);
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
      <View style={{ marginBottom: espacio.s }}>
        {TIPOS.filter((t) => !sinRecuperatorio || t.valor !== 'recuperatorio' || tipo === 'recuperatorio').map((t) => (
          <Opcion
            key={t.valor}
            texto={t.texto}
            icono={ICONO_TIPO[t.valor]}
            elegida={tipo === t.valor}
            onPress={() => {
              // Sugiere el nombre si el actual es uno de los sugeridos o está vacío.
              if (!nombre.trim() || TIPOS.some((x) => x.nombre && x.nombre === nombre.trim())) setNombre(t.nombre);
              setTipo(t.valor);
            }}
          />
        ))}
      </View>
      {usaLlamado && (
        <View style={{ marginBottom: espacio.s }}>
          <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Semestre del llamado</Text>
          <Segmentado
            opciones={[{ valor: 'normal', texto: 'Normal' }, { valor: 'opuesto', texto: 'Opuesto' }]}
            valor={opuestoUsado ? 'opuesto' : 'normal'}
            onCambio={(v) => setOpuesto(v === 'opuesto')}
            deshabilitadas={tipo === 'recuperatorio' ? ['opuesto'] : undefined}
            estilo={{ marginBottom: espacio.xs }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.m, flexWrap: 'wrap' }}>
            <Text style={s.filaDetalle}>{nombreSemestre(periodo)}</Text>
            <Enlace texto={eligiendoSemestre ? 'Listo' : 'Cambiar'} onPress={() => setEligiendoSemestre(!eligiendoSemestre)} />
          </View>
          {eligiendoSemestre && (
            <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: -espacio.s, marginBottom: espacio.m }}>
              <Boton texto="Anterior" variante="secundario" compacto icono="chevron-back" deshabilitado={periodo <= masViejo} onPress={() => setPeriodo(periodoAnterior(periodo))} estilo={{ flex: 1 }} />
              <Boton texto="Siguiente" variante="secundario" compacto deshabilitado={periodo >= periodoDe()} onPress={() => setPeriodo(periodoSiguiente(periodo))} estilo={{ flex: 1 }} />
            </View>
          )}
          <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Llamado utilizado</Text>
          <Segmentado
            opciones={[{ valor: '1', texto: 'Primer llamado' }, { valor: '2', texto: 'Segundo llamado' }]}
            valor={String(llamadoUsado) as '1' | '2'}
            onCambio={(v) => setLlamado(v === '2' ? 2 : 1)}
            deshabilitadas={tipo === 'recuperatorio' ? ['2'] : undefined}
            estilo={{ marginBottom: espacio.xs }}
          />
          <Text style={s.filaDetalle}>
            {tipo === 'recuperatorio'
              ? 'El Recu se rinde solo en el primer llamado del semestre normal. Al guardar, aparecerá en el historial de Finales como parcial. Conservás tus oportunidades de final.'
              : 'Al guardar, aparecerá en el historial de Finales como parcial. Conservás tus oportunidades de final.'}
          </Text>
        </View>
      )}
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
      <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!valido || (usaLlamado && !finalesLeidos)} />
      {evaluacion && !esPredefinida(evaluacion) && <Boton texto="Eliminar" variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} estilo={{ marginTop: espacio.s }} />}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

function Enlace({ texto: t, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={{ fontFamily: fuentes.semibold, fontSize: 13, color: colores.azul }}>{t}</Text>
    </Pressable>
  );
}
