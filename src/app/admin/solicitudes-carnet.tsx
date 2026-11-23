import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { BarraSuperior, Boton, Cargando, Chip, EstadoVacio, Mensaje, Pantalla, s, Tarjeta } from '../../components/ui';
import { aprobarSolicitud, cargarSolicitudesPendientes, rechazarSolicitud, socioSinCuentaConCi, urlFotoSolicitud } from '../../datos/socios';
import { usarDatos } from '../../datos/usarDatos';
import { estadoCarnet, fechaCorta, formatearCi } from '../../lib/carnet';
import type { SocioDb, SolicitudCarnetDb } from '../../lib/tipos-db';
import { colores, espacio, fondos, radio } from '../../tema';
import { useTema } from '../../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

const MOTIVOS = ['La foto no se lee', 'Los datos no coinciden con la foto', 'No figura como socio pago', 'Carnet vencido'];

/** Carnets físicos que los estudiantes fotografiaron: el CEQ los aprueba con un toque. */
export default function SolicitudesCarnet() {
  useTema();
  const { datos, cargando, error, refrescando, recargar, setDatos } = usarDatos(cargarSolicitudesPendientes, []);
  const sacar = (id: string) => setDatos((datos ?? []).filter((x) => x.id !== id));

  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Validar carnets" onVolver={volver} />
      <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
        Mirá que la foto sea de un carnet del CEQ, que el nombre y el vencimiento coincidan, y que la persona haya pagado. Al aprobar, se le habilita el carnet digital.
      </Text>
      <Mensaje texto={datos ? error : null} />
      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.length ? (
        <EstadoVacio
          icono="checkmark-done-outline"
          titulo={error ? 'No pudimos cargar las solicitudes' : 'No hay carnets por revisar'}
          texto={error ?? 'Cuando un estudiante envíe la foto de su carnet, aparece acá.'}
          accion={error ? { texto: 'Reintentar', onPress: recargar } : undefined}
        />
      ) : (
        datos.map((x) => <Solicitud key={x.id} sol={x} onListo={() => sacar(x.id)} />)
      )}
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}

function Solicitud({ sol, onListo }: { sol: SolicitudCarnetDb; onListo: () => void }) {
  const [foto, setFoto] = useState<string | null>(null);
  const [grande, setGrande] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existente, setExistente] = useState<SocioDb | null>(null);

  useEffect(() => {
    let vivo = true;
    socioSinCuentaConCi(sol.ci).then((x) => vivo && setExistente(x)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [sol.ci]);

  useEffect(() => {
    let vivo = true;
    urlFotoSolicitud(sol.foto_path).then((u) => vivo && setFoto(u));
    return () => {
      vivo = false;
    };
  }, [sol.foto_path]);

  const vencida = estadoCarnet({ vigente_hasta: sol.vigente_hasta }) === 'vencido';

  async function hacer(accion: () => Promise<void>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setOcupado(false);
    }
  }

  return (
    <Tarjeta>
      <Pressable onPress={() => setGrande((g) => !g)} accessibilityRole="imagebutton" accessibilityLabel={grande ? 'Achicar la foto' : 'Agrandar la foto del carnet'}>
        {foto ? (
          <Image source={{ uri: foto }} style={{ width: '100%', height: grande ? 360 : 180, borderRadius: radio.m, backgroundColor: fondos.tarjeta }} resizeMode="contain" />
        ) : (
          <View style={{ height: 120, borderRadius: radio.m, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={s.filaDetalle}>Foto del carnet</Text>
          </View>
        )}
      </Pressable>
      <Text style={[s.filaTitulo, { color: colores.marino, marginTop: espacio.m }]}>{sol.nombre}</Text>
      <Text style={s.filaDetalle}>
        C.I. {formatearCi(sol.ci)}{sol.numero_socio ? ` · ${sol.numero_socio}` : ''}
      </Text>
      <Text style={[s.filaDetalle, vencida && { color: colores.rojo }]}>Vence el {fechaCorta(sol.vigente_hasta)}{vencida ? ' (vencido)' : ''}</Text>

      {existente && (
        <Mensaje tipo="info" texto={`Al aprobar se vincula al socio ${existente.numero_socio ?? ''} (${existente.nombre}) que el CEQ cargó con esta cédula, y se renueva hasta ${fechaCorta(sol.vigente_hasta)}.`} />
      )}
      <Mensaje texto={error} />
      {rechazando ? (
        <>
          <Text style={[s.etiqueta, { marginTop: espacio.m, marginBottom: espacio.s }]}>¿Por qué se rechaza?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
            {MOTIVOS.map((m) => <Chip key={m} texto={m} elegido={motivo === m} onPress={() => setMotivo(m)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: espacio.s }}>
            <Boton texto="Rechazar" variante="peligro" onPress={() => hacer(() => rechazarSolicitud(sol.id, motivo ?? ''))} cargando={ocupado} deshabilitado={!motivo} compacto estilo={{ flex: 1 }} />
            <Boton texto="Cancelar" variante="fantasma" onPress={() => setRechazando(false)} compacto estilo={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.m }}>
          <Boton texto="Aprobar" icono="checkmark" onPress={() => hacer(() => aprobarSolicitud(sol.id, sol.created_at))} cargando={ocupado} deshabilitado={vencida} compacto estilo={{ flex: 1 }} />
          <Boton texto="Rechazar" variante="secundario" onPress={() => setRechazando(true)} deshabilitado={ocupado} compacto estilo={{ flex: 1 }} />
        </View>
      )}
    </Tarjeta>
  );
}
