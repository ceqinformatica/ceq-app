import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Carnet } from '../components/Carnet';
import { BarraSuperior, Cargando, EstadoVacio, Pantalla, s } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { cargarSocio } from '../datos/ceq';
import { db, MODO_DEMO } from '../datos/demo';
import { usarDatos } from '../datos/usarDatos';
import { supabase } from '../lib/supabase';
import { colores, espacio } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/ceq'));

/** Carnet a pantalla completa con el QR, para mostrar en la puerta o en comercios. */
export default function PantallaCarnet() {
  const { sesion, perfil } = useSesion();
  const { datos: socio, cargando, error, recargar } = usarDatos(() => cargarSocio(sesion?.user.id ?? ''), [sesion?.user.id]);
  const [carrera, setCarrera] = useState<string | null>(null);

  useEffect(() => {
    if (!perfil?.carrera_id) return;
    if (MODO_DEMO) setCarrera(db.carreras.find((c) => c.id === perfil.carrera_id)?.nombre ?? null);
    else supabase.from('carreras').select('nombre').eq('id', perfil.carrera_id).maybeSingle().then(({ data }) => setCarrera(data?.nombre ?? null));
  }, [perfil?.carrera_id]);

  return (
    <Pantalla>
      <BarraSuperior titulo="Carnet de socio" onVolver={volver} />
      {cargando && !socio ? (
        <Cargando />
      ) : socio ? (
        <>
          <Carnet socio={socio} carrera={carrera} conQr />
          <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.xl, paddingHorizontal: espacio.s }}>
            <Ionicons name="sunny-outline" size={18} color={colores.textoSuave} />
            <Text style={[s.filaDetalle, { flex: 1 }]}>Subí el brillo de la pantalla para que lean mejor el código.</Text>
          </View>
        </>
      ) : (
        <EstadoVacio
          icono="card-outline"
          titulo="Todavía no tenés carnet"
          texto={error ?? 'Cuando te asocies al CEQ, tu carnet aparece acá automáticamente.'}
          accion={error ? { texto: 'Reintentar', onPress: recargar } : undefined}
        />
      )}
    </Pantalla>
  );
}
