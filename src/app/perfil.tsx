import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Boton, Mensaje, Pantalla, Tarjeta, s } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { salir } from '../lib/auth';
import { activarBiometria, biometriaActiva, biometriaDisponible, desactivarBiometria } from '../lib/biometria';
import { supabase } from '../lib/supabase';
import { colores, espacio } from '../tema';

export default function Perfil() {
  const { sesion, perfil, actualizarPerfil } = useSesion();
  const [carrera, setCarrera] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [bio, setBio] = useState<{ disponible: boolean; nombre: string; activa: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [d, activa] = await Promise.all([biometriaDisponible(), biometriaActiva()]);
      setBio({ ...d, activa });
    })();
  }, []);

  useEffect(() => {
    if (perfil?.carrera_id) supabase.from('carreras').select('nombre').eq('id', perfil.carrera_id).maybeSingle().then(({ data }) => setCarrera(data?.nombre ?? null));
    if (perfil?.plan_id) supabase.from('planes').select('nombre').eq('id', perfil.plan_id).maybeSingle().then(({ data }) => setPlan(data?.nombre ?? null));
  }, [perfil?.carrera_id, perfil?.plan_id]);

  const cambiarBio = async (valor: boolean) => {
    setError(null);
    if (valor) {
      const ok = await activarBiometria();
      if (!ok) setError('No se pudo verificar tu identidad.');
      setBio((b) => b && { ...b, activa: ok });
    } else {
      await desactivarBiometria();
      setBio((b) => b && { ...b, activa: false });
    }
  };

  return (
    <Pantalla>
      <Tarjeta>
        <Text style={s.seccion}>Cuenta</Text>
        <Text style={s.fuerte}>{perfil?.nombre ?? 'Sin nombre'}</Text>
        <Text style={s.sub}>{sesion?.user.email}</Text>
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>Situación académica</Text>
        <Text style={s.fuerte}>{carrera ?? '...'}</Text>
        <Text style={s.sub}>
          {plan ?? ''}
          {perfil?.anio_ingreso ? ` · Ingreso ${perfil.anio_ingreso}` : ''}
        </Text>
        <Boton
          texto="Cambiar carrera o plan"
          variante="secundario"
          onPress={async () => setError(await actualizarPerfil({ carrera_id: null, plan_id: null }))}
        />
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>Seguridad</Text>
        {bio && !bio.disponible ? (
          <Text style={s.sub}>Este celular no tiene huella ni reconocimiento facial configurados.</Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.m }}>
            <Text style={[s.cuerpo, { flex: 1 }]}>Desbloquear con {bio?.nombre ?? 'huella'}</Text>
            <Switch value={bio?.activa ?? false} onValueChange={cambiarBio} disabled={!bio} trackColor={{ true: colores.marino, false: colores.linea }} />
          </View>
        )}
        <Text style={[s.sub, { marginTop: espacio.s }]}>Tus datos biométricos nunca salen del celular.</Text>
      </Tarjeta>

      <Mensaje texto={error} />
      <Boton texto="Cerrar sesión" variante="peligro" onPress={salir} />
    </Pantalla>
  );
}
