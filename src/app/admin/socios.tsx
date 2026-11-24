import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, Boton, BotonFlotante, Campo, Cargando, EstadoVacio, Insignia, Mensaje, Pantalla, s, Segmentado, Tarjeta } from '../../components/ui';
import { cargarSocios } from '../../datos/socios';
import { usarDatos } from '../../datos/usarDatos';
import { estadoCarnet, formatearCi, normalizarCi, textoSemestre } from '../../lib/carnet';
import { colores, espacio, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

type Filtro = 'todos' | 'vigente' | 'vencido';

const insignias = () => ({
  vigente: { texto: 'Vigente', color: colores.verde, fondo: fondos.verdeFondo },
  vencido: { texto: 'Vencido', color: colores.amarillo, fondo: fondos.amarilloFondo },
  inactivo: { texto: 'De baja', color: colores.rojo, fondo: fondos.rojoFondo },
});

/** Socios con carnet: solo los que pagaron y el CEQ dio de alta. */
export default function SociosAdmin() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarSocios, []);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const ci = normalizarCi(t);
    return (datos ?? []).filter((x) => {
      if (filtro !== 'todos' && estadoCarnet(x) !== filtro) return false;
      if (!t) return true;
      return x.nombre.toLowerCase().includes(t) || (ci && x.ci.includes(ci)) || (x.numero_socio ?? '').toLowerCase().includes(t);
    });
  }, [datos, busqueda, filtro]);

  const vigentes = (datos ?? []).filter((x) => estadoCarnet(x) === 'vigente').length;

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Socios y carnets" onVolver={volver} />
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
          El carnet tiene costo: da de alta solo a quien ya pagó. También se habilita cuando aprobás la foto que manda el estudiante en Validar carnets.
        </Text>
        <Boton texto="Verificar un carnet" icono="qr-code" variante="secundario" onPress={() => router.push('/verificar')} compacto estilo={{ marginBottom: espacio.m }} />
        <Campo etiqueta="Buscar" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre o C.I." autoCorrect={false} />
        <Segmentado<Filtro>
          opciones={[
            { valor: 'todos', texto: `Todos (${datos?.length ?? 0})` },
            { valor: 'vigente', texto: `Vigentes (${vigentes})` },
            { valor: 'vencido', texto: 'Vencidos' },
          ]}
          valor={filtro}
          onCambio={setFiltro}
        />
        <View style={{ height: espacio.m }} />
        <Mensaje texto={datos ? error : null} />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio
            icono="card-outline"
            titulo={error ? 'No pudimos cargar los socios' : 'Todavía no hay socios'}
            texto={error ?? 'Cuando alguien pague la cuota, dalo de alta con el botón +.'}
            accion={{ texto: error ? 'Reintentar' : 'Dar de alta', onPress: error ? recargar : () => router.push('/admin/socio') }}
          />
        ) : !lista.length ? (
          <EstadoVacio icono="search-outline" titulo="No encontramos a nadie" texto="Probá con otro nombre o cédula." />
        ) : (
          lista.map((x) => {
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
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante etiqueta="Dar de alta un socio" onPress={() => router.push('/admin/socio')} />
    </View>
  );
}
