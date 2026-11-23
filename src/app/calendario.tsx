import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, View } from 'react-native';
import { FilaCalendario } from '../components/calendario';
import { AvisoSinConexion, BarraSuperior, Boton, Cargando, Chip, EstadoVacio, Mensaje, Pantalla, Seccion, Tarjeta } from '../components/ui';
import { useTema } from '../context/TemaProvider';
import { cargarCalendario } from '../datos/calendario';
import { FUENTE_CALENDARIO } from '../datos/calendario-fcq';
import { usarDatos } from '../datos/usarDatos';
import { CATEGORIAS_CALENDARIO, filtrar, hoyPy, momento, NOMBRE_CATEGORIA, porMes, type CategoriaCalendario } from '../lib/calendario';
import { espacio } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/ceq'));

/** Calendario académico oficial de la FCQ: inscripciones, finales, aranceles, feriados. */
export default function Calendario() {
  useTema();
  const { datos, cargando, error, refrescando, recargar, sinConexion } = usarDatos(cargarCalendario, [], { cache: 'calendario' });
  const [categoria, setCategoria] = useState<CategoriaCalendario | null>(null);
  const [verPasadas, setVerPasadas] = useState(false);
  const hoy = hoyPy();

  const categorias = useMemo(() => CATEGORIAS_CALENDARIO.filter((c) => datos?.some((e) => e.categoria === c)), [datos]);
  const enCurso = useMemo(() => (datos ?? []).filter((e) => momento(e, hoy) === 'ahora' && (categoria == null || e.categoria === categoria)), [datos, hoy, categoria]);
  const meses = useMemo(
    () => porMes(filtrar(datos ?? [], hoy, categoria, verPasadas).filter((e) => verPasadas || momento(e, hoy) !== 'ahora')),
    [datos, hoy, categoria, verPasadas],
  );
  const hayPasadas = (datos ?? []).some((e) => momento(e, hoy) === 'pasado' && (categoria == null || e.categoria === categoria));

  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Calendario académico" onVolver={volver} />
      <AvisoSinConexion texto={sinConexion && datos ? error : null} />
      {categorias.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingBottom: espacio.m }}>
          <Chip texto="Todo" elegido={categoria == null} onPress={() => setCategoria(null)} />
          {categorias.map((c) => <Chip key={c} texto={NOMBRE_CATEGORIA[c]} elegido={categoria === c} onPress={() => setCategoria(categoria === c ? null : c)} />)}
        </ScrollView>
      )}

      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.length ? (
        <EstadoVacio
          icono="calendar-outline"
          titulo={error ? 'No pudimos cargar el calendario' : 'El calendario todavía no está cargado'}
          texto={error ?? 'Cuando el CEQ lo cargue vas a ver acá las fechas de inscripción, finales y feriados.'}
          accion={error ? { texto: 'Reintentar', onPress: recargar } : undefined}
        />
      ) : (
        <>
          {!verPasadas && enCurso.length > 0 && (
            <>
              <Seccion>Ahora</Seccion>
              <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
                {enCurso.map((e, i) => <FilaCalendario key={e.id} e={e} hoy={hoy} ultima={i === enCurso.length - 1} />)}
              </Tarjeta>
            </>
          )}
          {!verPasadas && hayPasadas && (
            <Boton texto="Ver también lo que ya pasó" variante="fantasma" icono="time-outline" onPress={() => setVerPasadas(true)} />
          )}
          {meses.length === 0 && enCurso.length === 0 ? (
            <EstadoVacio icono="calendar-clear-outline" titulo="No hay fechas por delante" texto="El CEQ carga el calendario nuevo apenas la facultad lo publica." />
          ) : (
            meses.map((m) => (
              <View key={m.clave}>
                <Seccion>{m.titulo}</Seccion>
                <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
                  {m.eventos.map((e, i) => <FilaCalendario key={e.id} e={e} hoy={hoy} ultima={i === m.eventos.length - 1} />)}
                </Tarjeta>
              </View>
            ))
          )}
          {verPasadas && <Boton texto="Ocultar lo que ya pasó" variante="fantasma" icono="eye-off-outline" onPress={() => setVerPasadas(false)} />}
        </>
      )}

      <Mensaje
        tipo="info"
        texto="Fechas del calendario oficial de la FCQ. Pueden cambiar por resolución: ante la duda, confirmá en la Dirección Académica."
      />
      <Boton texto="Ver el calendario en qui.una.py" variante="fantasma" icono="open-outline" onPress={() => WebBrowser.openBrowserAsync(FUENTE_CALENDARIO).catch(() => {})} />
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}
