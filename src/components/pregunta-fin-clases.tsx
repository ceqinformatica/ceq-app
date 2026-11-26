import { useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, Hoja, s } from './ui';
import { contarClasesDe, quitarMateriaDelHorario } from '../datos/agenda';
import { espacio } from '../tema';
import { textoError } from '../lib/errores';

/** Cuántas clases de la materia hay en la agenda (0 si no se pudo saber). */
export const clasesEnAgendaDe = (materiaId: string) => contarClasesDe(materiaId).catch(() => 0);

/**
 * Después de registrar la firma: si la materia tiene clases en la agenda,
 * pregunta si ya terminaron para sacarlas del horario (las fechas de exámenes quedan).
 */
export function PreguntaFinClases({ materiaId, nombre, clases, onCerrar, onQuitada, onError }: {
  materiaId: string;
  nombre: string;
  /** Clases en la agenda; con 0 la hoja no se ve. */
  clases: number;
  onCerrar: () => void;
  onQuitada?: () => void;
  onError?: (texto: string) => void;
}) {
  const [quitando, setQuitando] = useState(false);
  const quitar = async () => {
    setQuitando(true);
    try {
      await quitarMateriaDelHorario(materiaId);
      onCerrar();
      onQuitada?.();
    } catch (e) {
      onCerrar();
      onError?.(textoError(e, 'No se pudo quitar la materia de tu agenda.'));
    } finally {
      setQuitando(false);
    }
  };
  return (
    <Hoja visible={clases > 0} titulo="¿Terminaron tus clases?" onCerrar={onCerrar}>
      <Text style={[s.cuerpo, { marginBottom: espacio.l }]}>
        {`Tenés ${clases === 1 ? 'una clase' : `${clases} clases`} de ${nombre} en tu agenda. ¿Querés eliminar esta materia de tu agenda? Tus fechas de exámenes no se borran.`}
      </Text>
      <Boton texto="Sí, terminé las clases" icono="checkmark" onPress={quitar} cargando={quitando} />
      <Boton texto="No, aún no terminaron" variante="secundario" onPress={onCerrar} estilo={{ marginTop: espacio.s }} />
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}
