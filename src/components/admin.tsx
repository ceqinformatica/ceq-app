/**
 * Piezas compartidas del panel del CEQ: cuándo sale algo, a qué carrera
 * va y cómo se ve la notificación en el celular.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { alcance } from '../datos/admin';
import { atajos, describirCuando, leerFechaHora, partesDe, type Resultado } from '../lib/programacion';
import type { Carrera } from '../lib/tipos-db';
import { CampoFechaHora } from './fecha';
import { colores, espacio, fuentes, radio } from '../tema';
import { Campo, Chip, logoCeq, s, Segmentado } from './ui';

export interface Cuando {
  modo: 'ahora' | 'programar';
  fecha: string;
  hora: string;
}

export const cuandoAhora = (): Cuando => ({ modo: 'ahora', fecha: '', hora: '' });

export function cuandoDesde(iso: string | undefined, ahora = new Date()): Cuando {
  if (!iso || new Date(iso) <= ahora) return cuandoAhora();
  return { modo: 'programar', ...partesDe(new Date(iso)) };
}

/** Fecha elegida, o error para mostrar. "Ahora" = en el próximo minuto. */
export function resolverCuando(c: Cuando, ahora = new Date()): Resultado {
  if (c.modo === 'ahora') return { fecha: ahora };
  return leerFechaHora(c.fecha, c.hora, ahora);
}

export function SelectorCuando({ valor, onCambio, textoAhora = 'Ahora' }: { valor: Cuando; onCambio: (c: Cuando) => void; textoAhora?: string }) {
  const sugeridos = useMemo(() => atajos(), []);
  const r = valor.modo === 'programar' && valor.fecha && valor.hora ? leerFechaHora(valor.fecha, valor.hora) : null;
  return (
    <View style={{ marginBottom: espacio.m }}>
      <Segmentado
        opciones={[{ valor: 'ahora', texto: textoAhora }, { valor: 'programar', texto: 'Programar' }]}
        valor={valor.modo}
        onCambio={(modo) => onCambio({ ...valor, modo })}
      />
      {valor.modo === 'programar' && (
        <View style={{ marginTop: espacio.m }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
            {sugeridos.map((a) => {
              const p = partesDe(a.fecha);
              return <Chip key={a.texto} texto={a.texto} elegido={p.fecha === valor.fecha && p.hora === valor.hora} onPress={() => onCambio({ modo: 'programar', ...p })} />;
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: espacio.m }}>
            <CampoFechaHora etiqueta="Fecha" modo="date" valor={valor.fecha} onCambio={(fecha) => onCambio({ ...valor, fecha })} minimo={new Date()} estilo={{ flex: 3 }} />
            <CampoFechaHora etiqueta="Hora" modo="time" valor={valor.hora} onCambio={(hora) => onCambio({ ...valor, hora })} estilo={{ flex: 2 }} />
          </View>
          {r && (
            <Text style={[s.filaDetalle, { color: 'fecha' in r ? colores.verde : colores.rojo, marginTop: -espacio.s }]}>
              {'fecha' in r ? `Sale ${describirCuando(r.fecha).replace(/^([A-Z])/, (l) => l.toLowerCase())}` : r.error}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/** "Todas las carreras" o una sola, y a cuántos celulares llega. */
export function SelectorCarrera({ carreras, valor, onCambio, mostrarAlcance = true }: {
  carreras: Carrera[]; valor: string | null; onCambio: (id: string | null) => void; mostrarAlcance?: boolean;
}) {
  const [cuantos, setCuantos] = useState<number | null>(null);
  useEffect(() => {
    if (!mostrarAlcance) return;
    let activo = true;
    setCuantos(null);
    alcance(valor).then((n) => activo && setCuantos(n));
    return () => {
      activo = false;
    };
  }, [valor, mostrarAlcance]);
  return (
    <View style={{ marginBottom: espacio.m }}>
      <Text style={s.etiqueta}>Para quién</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s }}>
        <Chip texto="Todas las carreras" elegido={valor == null} onPress={() => onCambio(null)} />
        {carreras.map((c) => (
          <Chip key={c.id} texto={c.sigla ?? c.nombre} elegido={valor === c.id} onPress={() => onCambio(c.id)} />
        ))}
      </View>
      {mostrarAlcance && cuantos != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: espacio.s }}>
          <Ionicons name="phone-portrait-outline" size={14} color={colores.textoSuave} />
          <Text style={s.filaDetalle}>
            {cuantos === 1 ? 'Llega a 1 celular' : `Llega a ${cuantos} celulares`} con las notificaciones activadas
          </Text>
        </View>
      )}
    </View>
  );
}

/** Cómo se ve la notificación en la pantalla del celular. */
export function VistaPrevia({ titulo, cuerpo }: { titulo: string; cuerpo: string }) {
  return (
    <View style={{ backgroundColor: colores.grisFondo, borderRadius: radio.l, padding: espacio.m, marginBottom: espacio.m }} accessibilityLabel="Vista previa de la notificación">
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Así se ve en el celular</Text>
      <View style={{ flexDirection: 'row', gap: espacio.m, backgroundColor: colores.superficieBlanca, borderRadius: radio.m, padding: espacio.m }}>
        <Image source={logoCeq} style={{ width: 28, height: 28 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fuentes.semibold, fontSize: 14, color: colores.texto }} numberOfLines={1}>{titulo.trim() || 'Título'}</Text>
          <Text style={{ fontFamily: fuentes.regular, fontSize: 13, color: colores.textoSuave }} numberOfLines={3}>{cuerpo.trim() || 'Texto de la notificación'}</Text>
        </View>
      </View>
    </View>
  );
}

/** Etiqueta del estado de una notificación. */
export function estadoNotificacion(estado: string, destinatarios: number | null, cuando: string): { texto: string; color: string; fondo: string } {
  switch (estado) {
    case 'pendiente':
      return { texto: `Programada · ${describirCuando(cuando)}`, color: colores.amarillo, fondo: colores.amarilloFondo };
    case 'enviada':
      return { texto: `Enviada a ${destinatarios ?? 0} · ${describirCuando(cuando)}`, color: colores.verde, fondo: colores.verdeFondo };
    case 'error':
      return { texto: 'No se pudo enviar', color: colores.rojo, fondo: colores.rojoFondo };
    case 'sin_destinatarios':
      return { texto: 'Nadie la recibió (sin celulares)', color: colores.gris, fondo: colores.grisFondo };
    default:
      return { texto: 'Cancelada', color: colores.gris, fondo: colores.grisFondo };
  }
}
