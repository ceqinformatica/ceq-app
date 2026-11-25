import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, Boton, BotonFlotante, Campo, Cargando, EstadoVacio, Insignia, Mensaje, Pantalla, s, Segmentado, Tarjeta } from '../../components/ui';
import { buscarSocios, contarSocios, type FiltroSocios } from '../../datos/socios';
import type { SocioDb } from '../../lib/tipos-db';
import { textoError } from '../../lib/errores';
import { usarDatos } from '../../datos/usarDatos';
import { estadoCarnet, formatearCi, textoSemestre } from '../../lib/carnet';
import { colores, espacio, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

type Filtro = FiltroSocios;

const insignias = () => ({
  vigente: { texto: 'Vigente', color: colores.verde, fondo: fondos.verdeFondo },
  vencido: { texto: 'Vencido', color: colores.amarillo, fondo: fondos.amarilloFondo },
  inactivo: { texto: 'De baja', color: colores.rojo, fondo: fondos.rojoFondo },
});

/** Socios con carnet: solo los que pagaron y el CEQ dio de alta. */
export default function SociosAdmin() {
  useTema();
  const conteo = usarDatos(contarSocios, []);
  const [busqueda, setBusqueda] = useState('');
  const [buscado, setBuscado] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  // La búsqueda va al servidor (todo el padrón), por páginas.
  const [lista, setLista] = useState<SocioDb[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [masCargando, setMasCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  // Espera a que termine de escribir para no consultar con cada letra.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async (desde: number, modo: 'nuevo' | 'mas' | 'refrescar') => {
    const id = ++pedido.current;
    if (modo === 'mas') setMasCargando(true);
    else if (modo === 'refrescar') setRefrescando(true);
    else setCargando(true);
    setError(null);
    try {
      const r = await buscarSocios({ texto: buscado, filtro, desde });
      // Una respuesta vieja (otra búsqueda) no pisa la nueva.
      if (id !== pedido.current) return;
      setLista((antes) => (desde === 0 ? r.filas : [...(antes ?? []), ...r.filas]));
      setHayMas(r.hayMas);
    } catch (e) {
      if (id === pedido.current) setError(textoError(e, 'No pudimos cargar los socios.'));
    } finally {
      if (id === pedido.current) {
        setCargando(false);
        setMasCargando(false);
        setRefrescando(false);
      }
    }
  }, [buscado, filtro]);

  useEffect(() => {
    cargar(0, 'nuevo');
  }, [cargar]);

  const recargar = () => {
    conteo.recargar();
    cargar(0, 'refrescar');
  };
  const datos = lista;
  const buscando = buscado.trim() !== '' || filtro !== 'todos';

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Socios y carnets" onVolver={volver} />
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
          El carnet tiene costo: da de alta solo a quien ya pagó. También se habilita cuando aprobás la foto que manda el estudiante en Validar carnets.
        </Text>
        <Boton texto="Verificar un carnet" icono="qr-code" variante="secundario" onPress={() => router.push('/verificar')} compacto estilo={{ marginBottom: espacio.m }} />
        <Campo etiqueta="Buscar" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre o C.I." autoCorrect={false} limpiable />
        <Segmentado<Filtro>
          opciones={[
            { valor: 'todos', texto: conteo.datos ? `Todos (${conteo.datos.todos})` : 'Todos' },
            { valor: 'vigente', texto: conteo.datos ? `Vigentes (${conteo.datos.vigentes})` : 'Vigentes' },
            { valor: 'vencido', texto: 'Vencidos' },
          ]}
          valor={filtro}
          onCambio={setFiltro}
        />
        <View style={{ height: espacio.m }} />
        <Mensaje texto={datos ? error : null} />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length && (error || !buscando) ? (
          <EstadoVacio
            icono="card-outline"
            titulo={error ? 'No pudimos cargar los socios' : 'Todavía no hay socios'}
            texto={error ?? 'Cuando alguien pague la cuota, dalo de alta con el botón +.'}
            accion={{ texto: error ? 'Reintentar' : 'Dar de alta', onPress: error ? recargar : () => router.push('/admin/socio') }}
          />
        ) : !datos?.length ? (
          <EstadoVacio icono="search-outline" titulo="No encontramos a nadie" texto="Probá con otro nombre o cédula." />
        ) : (
          datos.map((x) => {
            const i = insignias()[estadoCarnet(x)];
            return (
              <Tarjeta key={x.id} onPress={() => router.push(`/admin/socio?id=${x.id}`)} etiqueta={`Editar a ${x.nombre}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
                  <Text style={[s.filaTitulo, { flex: 1, color: colores.marino }]} numberOfLines={1}>{x.nombre}</Text>
                  <Insignia texto={i.texto} color={i.color} fondo={i.fondo} />
                </View>
                <Text style={[s.filaDetalle, { marginTop: 4 }]}>
                  C.I. {formatearCi(x.ci)} · {x.vigente_hasta ? `vence el ${textoSemestre(x.vigente_hasta)}` : 'sin vencimiento'}
                </Text>
                {!x.usuario_id && <Text style={[s.filaDetalle, { marginTop: 2, color: colores.amarillo }]}>Sin cuenta en la app: solo carnet físico</Text>}
              </Tarjeta>
            );
          })
        )}
        {hayMas && datos?.length ? (
          <Boton texto="Ver más socios" variante="fantasma" onPress={() => cargar(datos.length, 'mas')} cargando={masCargando} estilo={{ marginTop: espacio.s }} />
        ) : null}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante etiqueta="Dar de alta un socio" onPress={() => router.push('/admin/socio')} />
    </View>
  );
}
