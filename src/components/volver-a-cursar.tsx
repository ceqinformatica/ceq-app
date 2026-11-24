/**
 * Volver a cursar una materia: en el semestre normal o en el semestre
 * opuesto (Res. 0108-00-2024, Art. 7 c, 23, 45 y 62).
 *
 * - Semestre normal: se cursa la teoría de nuevo (parciales y asistencia);
 *   el laboratorio se conserva (Art. 45) y los finales quedan en el historial.
 * - Semestre opuesto: solo parciales y finales, sin recuperatorio (Art. 23).
 *   El laboratorio y la asistencia siguen valiendo y los llamados que queden
 *   se comparten (son 3 por materia). Con 3 aplazos o la firma vencida no hay
 *   opuesto (Art. 62). El Recu y la Regu son parciales: no gastan un final.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cargarFinales, cursarSemestreOpuesto, recursarMateria } from '../datos/academico';
import { semestreOpuesto, TEXTO_SIN_OPUESTO } from '../lib/finales';
import { textoError } from '../lib/errores';
import type { ExamenFinalDb } from '../lib/tipos-db';
import { colores, espacio, fondos, fuentes, radio } from '../tema';
import { Boton, Mensaje, s } from './ui';
import { vibrar } from './movimiento';

/** Art. 23: las materias del plan 2018 no se ofrecen en semestre opuesto. */
export const sinOpuestoEnPlan = (anioPlan: number | null | undefined) => anioPlan === 2018;

type Modo = 'normal' | 'opuesto';

export function VolverACursar({ materiaId, aprobada, anioPlan, motivo, onHecho }: {
  materiaId: string;
  aprobada?: boolean;
  anioPlan?: number | null;
  /** Por qué se ofrece volver a cursar (aparece arriba). */
  motivo?: string | null;
  onHecho: () => void;
}) {
  const [finales, setFinales] = useState<ExamenFinalDb[] | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarFinales(materiaId).then(setFinales).catch((e) => setError(textoError(e, 'No se pudieron cargar los finales.')));
  }, [materiaId]);

  const calculado = semestreOpuesto({ finales: finales ?? [], aprobada, sinOpuestoEnPlan: sinOpuestoEnPlan(anioPlan) });
  // Hasta saber cuántos finales rindió (o si no se pudieron cargar), el opuesto no se puede elegir.
  const opuesto = finales == null ? { ...calculado, puede: false } : calculado;

  const elegir = (m: Modo) => {
    vibrar();
    setModo(m);
    setConfirmar(false);
  };

  const hacer = async () => {
    if (!modo) return;
    if (!confirmar) {
      setConfirmar(true);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (modo === 'opuesto') await cursarSemestreOpuesto(materiaId);
      else await recursarMateria(materiaId);
      vibrar('exito');
      onHecho();
    } catch (e) {
      setError(textoError(e, 'No se pudo marcar para volver a cursar.'));
      setGuardando(false);
    }
  };

  return (
    <View>
      {motivo ? <Mensaje tipo="error" texto={motivo} /> : null}
      <Text style={[s.filaTitulo, { marginBottom: espacio.s }]}>¿Cómo la volvés a cursar?</Text>
      <Opcion
        titulo="Semestre normal"
        texto="Cursás la teoría de nuevo: parciales y asistencia. Tu laboratorio se conserva y tus finales quedan en el historial."
        elegida={modo === 'normal'}
        onPress={() => elegir('normal')}
      />
      <Opcion
        titulo="Semestre opuesto"
        texto={opuesto.puede
          ? `Solo rendís los parciales y los finales, sin recuperatorio. Tu laboratorio y tu asistencia siguen valiendo. ${opuesto.llamadosRestantes === 1 ? 'Te queda 1 final' : `Te quedan ${opuesto.llamadosRestantes} finales`} de los 3.`
          : finales == null ? 'Revisando tus finales…' : TEXTO_SIN_OPUESTO[opuesto.motivo!]}
        elegida={modo === 'opuesto'}
        deshabilitada={!opuesto.puede}
        onPress={() => elegir('opuesto')}
      />
      {modo === 'opuesto' && (
        <>
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>Necesitás tener las prácticas aprobadas y la asistencia cumplida (Art. 7 c). La materia se abre a pedido: se inscribe con un formulario en Mesa de Entrada.</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/tramite/clave:semestre-opuesto')} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
            <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>Ver el trámite de semestre opuesto</Text>
          </Pressable>
        </>
      )}
      {confirmar && (
        <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
          {modo === 'opuesto'
            ? 'Se borran tus parciales de teoría y tu firma; el laboratorio, la asistencia y los finales se conservan.'
            : 'Se borran tus parciales, tu asistencia de teoría y tu firma; el laboratorio se conserva y tus finales quedan en el historial.'}
          {' '}Si te equivocás, lo podés deshacer desde la materia mientras no cargues nada nuevo.
        </Text>
      )}
      <Boton
        texto={!modo ? 'Elegí una opción' : confirmar ? 'Sí, volver a cursar' : modo === 'opuesto' ? 'Cursar en el semestre opuesto' : 'Volver a cursar'}
        icono="refresh"
        variante={confirmar ? 'peligro' : 'primario'}
        onPress={hacer}
        cargando={guardando}
        deshabilitado={!modo || (modo === 'opuesto' && !opuesto.puede)}
      />
      {confirmar && (
        <Pressable accessibilityRole="button" onPress={() => setConfirmar(false)} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
          <Text style={[s.filaDetalle, { color: colores.marino, textDecorationLine: 'underline' }]}>Cancelar</Text>
        </Pressable>
      )}
      <Mensaje texto={error} />
    </View>
  );
}

function Opcion({ titulo, texto, elegida, deshabilitada, onPress }: { titulo: string; texto: string; elegida: boolean; deshabilitada?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: elegida, disabled: deshabilitada }}
      disabled={deshabilitada}
      onPress={onPress}
      style={{
        flexDirection: 'row', gap: espacio.m, alignItems: 'flex-start', padding: espacio.m, marginBottom: espacio.s,
        borderWidth: elegida ? 2 : 1, borderColor: elegida ? colores.marino : colores.linea, borderRadius: radio.m,
        backgroundColor: elegida ? fondos.grisFondo : 'transparent', opacity: deshabilitada ? 0.55 : 1,
      }}
    >
      <Ionicons name={elegida ? 'radio-button-on' : 'radio-button-off'} size={20} color={deshabilitada ? colores.gris : colores.marino} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto }}>{titulo}</Text>
        <Text style={[s.filaDetalle, { marginTop: 2 }]}>{texto}</Text>
      </View>
    </Pressable>
  );
}
