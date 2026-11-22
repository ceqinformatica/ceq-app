import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Carnet } from '../components/Carnet';
import { BarraSuperior, Boton, Cargando, EstadoVacio, Fila, Hoja, Mensaje, Pantalla, s, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { cargarSocio } from '../datos/ceq';
import { db, MODO_DEMO } from '../datos/demo';
import { renovarCodigo, subirFoto, urlFoto } from '../datos/socios';
import { usarDatos } from '../datos/usarDatos';
import { AVISO_CARNET_PAGO, estadoCarnet } from '../lib/carnet';
import { supabase } from '../lib/supabase';
import { colores, espacio } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/ceq'));

/** Hora que corre en vivo: una captura de pantalla se nota porque queda quieta. */
function useHora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return ahora.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Carnet a pantalla completa con el QR, para mostrar en la puerta o en comercios. */
export default function PantallaCarnet() {
  const { sesion, perfil } = useSesion();
  const { datos: socio, cargando, error, recargar, setDatos } = usarDatos(() => cargarSocio(sesion?.user.id ?? ''), [sesion?.user.id]);
  const [carrera, setCarrera] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'foto' | 'qr' | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);
  const [confirmarQr, setConfirmarQr] = useState(false);
  const hora = useHora();

  useEffect(() => {
    if (!perfil?.carrera_id) return;
    if (MODO_DEMO) setCarrera(db.carreras.find((c) => c.id === perfil.carrera_id)?.nombre ?? null);
    else supabase.from('carreras').select('nombre').eq('id', perfil.carrera_id).maybeSingle().then(({ data }) => setCarrera(data?.nombre ?? null));
  }, [perfil?.carrera_id]);

  useEffect(() => {
    let vivo = true;
    urlFoto(socio?.foto_path).then((u) => vivo && setFoto(u));
    return () => {
      vivo = false;
    };
  }, [socio?.foto_path]);

  async function elegirFoto() {
    if (!socio) return;
    setMensaje(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 5 * 1024 * 1024) {
      setMensaje({ texto: 'La foto pesa más de 5 MB. Elegí una más liviana.', tipo: 'error' });
      return;
    }
    setOcupado('foto');
    try {
      const path = await subirFoto(socio, a.uri, a.mimeType);
      setDatos({ ...socio, foto_path: path });
      setMensaje({ texto: 'Listo, tu foto ya está en el carnet.', tipo: 'exito' });
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No pudimos subir la foto.', tipo: 'error' });
    } finally {
      setOcupado(null);
    }
  }

  async function nuevoQr() {
    if (!socio) return;
    setConfirmarQr(false);
    setOcupado('qr');
    try {
      const codigo = await renovarCodigo(socio.id);
      setDatos({ ...socio, codigo_qr: codigo });
      setMensaje({ texto: 'Tu QR es nuevo. El anterior y cualquier captura ya no sirven.', tipo: 'exito' });
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No pudimos cambiar el código.', tipo: 'error' });
    } finally {
      setOcupado(null);
    }
  }

  const estado = socio ? estadoCarnet(socio) : null;

  return (
    <Pantalla>
      <BarraSuperior titulo="Carnet de socio" onVolver={volver} />
      {cargando && !socio ? (
        <Cargando />
      ) : socio ? (
        <>
          <Carnet socio={socio} carrera={carrera} foto={foto} conQr />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: espacio.m }} accessibilityLabel={`Hora actual ${hora}`}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: estado === 'vigente' ? colores.verde : colores.rojo }} />
            <Text style={[s.filaDetalle, { fontVariant: ['tabular-nums'] }]}>En vivo · {hora}</Text>
          </View>

          {estado === 'vencido' && <Mensaje texto="Tu carnet venció. Renová la cuota de socio en la sede del CEQ y se vuelve a habilitar." />}
          {estado === 'inactivo' && <Mensaje texto="El CEQ dio de baja este carnet. Consultá en la sede." />}
          <Mensaje texto={mensaje?.texto ?? null} tipo={mensaje?.tipo} />

          <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.l, paddingHorizontal: espacio.s }}>
            <Ionicons name="sunny-outline" size={18} color={colores.textoSuave} />
            <Text style={[s.filaDetalle, { flex: 1 }]}>Subí el brillo para que lean mejor el código. Mostralo desde la app: la hora en vivo prueba que no es una captura.</Text>
          </View>

          <Tarjeta estilo={{ paddingVertical: espacio.xs, marginTop: espacio.l }}>
            <Fila
              icono="camera-outline"
              titulo={socio.foto_path ? 'Cambiar la foto' : 'Agregar tu foto'}
              detalle={ocupado === 'foto' ? 'Subiendo…' : 'Una foto de frente, como la de la cédula'}
              onPress={ocupado ? undefined : elegirFoto}
            />
            <Fila
              icono="refresh-outline"
              titulo="Cambiar el código QR"
              detalle={ocupado === 'qr' ? 'Cambiando…' : 'Si alguien sacó una foto de tu QR'}
              onPress={ocupado ? undefined : () => setConfirmarQr(true)}
              ultima
            />
          </Tarjeta>

          <Hoja visible={confirmarQr} titulo="¿Cambiar el código QR?" onCerrar={() => setConfirmarQr(false)}>
            <Text style={[s.filaDetalle, { marginBottom: espacio.l }]}>
              Se genera un código nuevo. El anterior deja de servir, también en las capturas que se hayan hecho.
            </Text>
            <Boton texto="Sí, cambiar el código" icono="refresh" onPress={nuevoQr} />
            <Boton texto="Cancelar" variante="fantasma" onPress={() => setConfirmarQr(false)} />
          </Hoja>
        </>
      ) : error ? (
        <EstadoVacio icono="card-outline" titulo="No pudimos cargar tu carnet" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} />
      ) : (
        <SinCarnet />
      )}
    </Pantalla>
  );
}

/** Para quien no pagó: el carnet no está habilitado y se explica cómo obtenerlo. */
export function SinCarnet() {
  return (
    <>
      <EstadoVacio icono="card-outline" titulo="Todavía no tenés carnet" texto={AVISO_CARNET_PAGO} />
      <Tarjeta>
        <Text style={s.filaTitulo}>Cómo obtenerlo</Text>
        {[
          'Pasá por la sede del CEQ en el horario de atención.',
          'Pagá la cuota de socio y llevá tu cédula.',
          'El CEQ te da el carnet físico y habilita el virtual en esta app, con tu cuenta.',
        ].map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.s }}>
            <Text style={[s.filaDetalle, { color: colores.marino, fontWeight: '700' }]}>{i + 1}.</Text>
            <Text style={[s.filaDetalle, { flex: 1 }]}>{t}</Text>
          </View>
        ))}
      </Tarjeta>
    </>
  );
}
