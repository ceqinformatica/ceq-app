import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, Cargando, EstadoVacio, Hoja, Insignia, Mensaje, Pantalla, s, Segmentado, Tarjeta } from '../../components/ui';
import { cargarSugerenciasAdmin, responderSugerencia } from '../../datos/admin';
import { haceCuanto } from '../../datos/ceq';
import { usarDatos } from '../../datos/usarDatos';
import type { SugerenciaDb } from '../../lib/tipos-db';
import { colores, espacio, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));
type Filtro = SugerenciaDb['estado'];

const estados = (): Record<Filtro, { texto: string; color: string; fondo: string }> => ({
  recibida: { texto: 'Nueva', color: colores.azul, fondo: fondos.cielo },
  en_revision: { texto: 'En revisión', color: colores.amarillo, fondo: fondos.amarilloFondo },
  respondida: { texto: 'Respondida', color: colores.verde, fondo: fondos.verdeFondo },
});

export default function SugerenciasAdmin() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarSugerenciasAdmin, []);
  const [filtro, setFiltro] = useState<Filtro>('recibida');
  const [abierta, setAbierta] = useState<SugerenciaDb | null>(null);
  const lista = (datos ?? []).filter((x) => x.estado === filtro);
  const cuenta = (f: Filtro) => (datos ?? []).filter((x) => x.estado === f).length;

  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Sugerencias" onVolver={volver} />
      <Segmentado
        opciones={[
          { valor: 'recibida', texto: `Nuevas (${cuenta('recibida')})` },
          { valor: 'en_revision', texto: 'En revisión' },
          { valor: 'respondida', texto: 'Respondidas' },
        ]}
        valor={filtro}
        onCambio={setFiltro}
      />
      <View style={{ height: espacio.m }} />
      {cargando && !datos ? (
        <Cargando />
      ) : !lista.length ? (
        <EstadoVacio icono="chatbubbles-outline" titulo={error ? 'No pudimos cargar las sugerencias' : 'Nada por acá'} texto={error ?? undefined} />
      ) : (
        lista.map((x) => (
          <Tarjeta key={x.id} onPress={() => setAbierta(x)} etiqueta="Abrir sugerencia">
            <View style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s, flexWrap: 'wrap' }}>
              {x.categoria ? <Insignia texto={x.categoria} /> : null}
              <Text style={s.filaDetalle}>{haceCuanto(x.created_at)}</Text>
            </View>
            <Text style={s.cuerpo} numberOfLines={4}>{x.texto}</Text>
            {x.respuesta ? <Text style={[s.filaDetalle, { marginTop: espacio.s, color: colores.verde }]} numberOfLines={2}>Respuesta: {x.respuesta}</Text> : null}
          </Tarjeta>
        ))
      )}
      {abierta && <Detalle sugerencia={abierta} onCerrar={() => setAbierta(null)} onListo={() => { setAbierta(null); recargar(); }} />}
    </Pantalla>
  );
}

function Detalle({ sugerencia, onCerrar, onListo }: { sugerencia: SugerenciaDb; onCerrar: () => void; onListo: () => void }) {
  const [respuesta, setRespuesta] = useState(sugerencia.respuesta ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = estados()[sugerencia.estado];

  const guardar = async (estado: Filtro) => {
    setError(null);
    if (estado === 'respondida' && !respuesta.trim()) return setError('Escribí la respuesta.');
    setGuardando(true);
    try {
      await responderSugerencia(sugerencia.id, estado, respuesta.trim() || null);
      onListo();
    } catch (err) {
      setError(textoError(err, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible titulo="Sugerencia" onCerrar={onCerrar}>
      <View style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.m }}>
        <Insignia texto={e.texto} color={e.color} fondo={e.fondo} />
        {sugerencia.categoria ? <Insignia texto={sugerencia.categoria} /> : null}
      </View>
      <Text style={[s.cuerpo, { marginBottom: espacio.l }]} selectable>{sugerencia.texto}</Text>
      <Campo etiqueta="Respuesta del CEQ" value={respuesta} onChangeText={setRespuesta} multiline maxLength={2000} placeholder="Queda guardada junto a la sugerencia." />
      <Mensaje texto={error} />
      <Boton texto="Responder" icono="send" onPress={() => guardar('respondida')} cargando={guardando} />
      {sugerencia.estado === 'recibida' && (
        <Boton texto="Marcar en revisión" variante="fantasma" icono="eye-outline" onPress={() => guardar('en_revision')} deshabilitado={guardando} estilo={{ marginTop: espacio.s }} />
      )}
    </Hoja>
  );
}
