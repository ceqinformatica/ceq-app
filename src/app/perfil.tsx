import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import { Hexagono } from '../components/graficos';
import { BarraSuperior, Boton, Fila, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { db, MODO_DEMO } from '../datos/demo';
import { salir } from '../lib/auth';
import { registrarEsteCelular, type EstadoRegistro } from '../lib/notificaciones';
import { activarBiometria, biometriaActiva, biometriaDisponible, desactivarBiometria } from '../lib/biometria';
import { supabase } from '../lib/supabase';
import { colores, espacio, fuentes, texto } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function Perfil() {
  const { sesion, perfil, actualizarPerfil } = useSesion();
  const [carrera, setCarrera] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [bio, setBio] = useState<{ disponible: boolean; nombre: string; activa: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<EstadoRegistro | null>(null);

  // Sin pedir permiso: solo saber si este celular ya recibe notificaciones.
  useEffect(() => {
    registrarEsteCelular({ pedirPermiso: false }).then(setPush).catch(() => setPush('error'));
  }, []);

  const cambiarPreferencia = async (campo: 'notif_avisos' | 'notif_recordatorios', valor: boolean) => {
    setError(await actualizarPerfil({ [campo]: valor }));
    if (valor && push !== 'activo') setPush(await registrarEsteCelular());
  };

  useEffect(() => {
    (async () => {
      const [d, activa] = await Promise.all([biometriaDisponible(), biometriaActiva()]);
      setBio({ ...d, activa });
    })().catch(() => setBio({ disponible: false, nombre: 'huella', activa: false }));
  }, []);

  useEffect(() => {
    if (MODO_DEMO) {
      setCarrera(db.carreras.find((c) => c.id === perfil?.carrera_id)?.nombre ?? null);
      setPlan(db.planes.find((p) => p.id === perfil?.plan_id)?.nombre ?? null);
      return;
    }
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

  const inicial = (perfil?.nombre?.[0] ?? sesion?.user.email?.[0] ?? '?').toUpperCase();

  return (
    <Pantalla>
      <BarraSuperior titulo="Mi perfil" onVolver={volver} />

      <View style={{ alignItems: 'center', marginBottom: espacio.l }}>
        <Hexagono tamano={92} relleno={colores.marino}>
          <Text style={{ fontFamily: fuentes.bold, fontSize: 34, color: colores.blanco }}>{inicial}</Text>
        </Hexagono>
        <Text style={[texto.titulo, { color: colores.marino, marginTop: espacio.m, textAlign: 'center' }]}>{perfil?.nombre ?? 'Sin nombre'}</Text>
        <Text style={s.filaDetalle}>{sesion?.user.email}</Text>
      </View>

      <Seccion>Situación académica</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila icono="school-outline" titulo={carrera ?? '…'} detalle="Carrera" />
        <Fila icono="git-network-outline" titulo={plan ?? '…'} detalle="Plan de estudios" />
        <Fila icono="calendar-outline" titulo={perfil?.anio_ingreso ? String(perfil.anio_ingreso) : 'Sin cargar'} detalle="Año de ingreso" ultima />
      </Tarjeta>
      <Boton
        texto="Cambiar carrera o plan"
        variante="secundario"
        icono="swap-horizontal"
        onPress={async () => setError(await actualizarPerfil({ carrera_id: null, plan_id: null }))}
      />

      {perfil?.rol === 'validador' && (
        <>
          <Seccion estilo={{ marginTop: espacio.xl }}>CEQ</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            <Fila icono="qr-code-outline" titulo="Verificar carnet" detalle="Escanear el QR de un socio" onPress={() => router.push('/admin/verificar')} ultima />
          </Tarjeta>
        </>
      )}

      {perfil?.rol === 'admin' && (
        <>
          <Seccion estilo={{ marginTop: espacio.xl }}>Administración</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            <Fila icono="construct-outline" titulo="Panel del CEQ" detalle="Socios, avisos, notificaciones, encuestas y sugerencias" onPress={() => router.push('/admin')} ultima />
          </Tarjeta>
        </>
      )}

      <Seccion estilo={{ marginTop: espacio.xl }}>Notificaciones</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          icono="megaphone-outline"
          titulo="Avisos del CEQ"
          detalle="Comunicados, fechas importantes y novedades."
          derecha={<Interruptor valor={perfil?.notif_avisos ?? true} onCambio={(v) => cambiarPreferencia('notif_avisos', v)} etiqueta="Avisos del CEQ" />}
        />
        <Fila
          icono="alarm-outline"
          titulo="Recordatorios de mi agenda"
          detalle="Un aviso antes de cada parcial, final o entrega que cargues."
          derecha={<Interruptor valor={perfil?.notif_recordatorios ?? true} onCambio={(v) => cambiarPreferencia('notif_recordatorios', v)} etiqueta="Recordatorios de mi agenda" />}
          ultima
        />
      </Tarjeta>
      {push === 'sin_permiso' && (
        <Mensaje tipo="info" texto="Este celular tiene las notificaciones de la app apagadas. Activalas en los ajustes del teléfono." />
      )}
      {push === 'sin_permiso' && Platform.OS !== 'web' && (
        <Boton texto="Abrir ajustes" variante="fantasma" compacto icono="settings-outline" onPress={() => Linking.openSettings()} />
      )}
      {push === 'error' && <Mensaje tipo="info" texto="No pudimos activar las notificaciones en este celular. Probá de nuevo más tarde." />}

      <Seccion estilo={{ marginTop: espacio.xl }}>Seguridad</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        {bio && !bio.disponible ? (
          <Fila icono="finger-print" titulo="Desbloqueo biométrico" detalle="Este celular no tiene huella ni rostro configurados." ultima />
        ) : (
          <Fila
            icono="finger-print"
            titulo={`Desbloquear con ${bio?.nombre ?? 'huella'}`}
            detalle="Tus datos biométricos nunca salen del celular."
            derecha={
              <Switch
                value={bio?.activa ?? false}
                onValueChange={cambiarBio}
                disabled={!bio}
                accessibilityLabel={`Desbloquear con ${bio?.nombre ?? 'huella'}`}
                trackColor={{ true: colores.marino, false: colores.linea }}
                thumbColor={colores.blanco}
              />
            }
            ultima
          />
        )}
      </Tarjeta>

      <Mensaje texto={error} />
      <Boton texto="Cerrar sesión" variante="peligro" icono="log-out-outline" onPress={salir} estilo={{ marginTop: espacio.xl }} />
      <Text style={{ fontFamily: fuentes.regular, fontSize: 11.5, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.l }}>
        App del CEQ · Centro de Estudiantes de Química
      </Text>
    </Pantalla>
  );
}

function Interruptor({ valor, onCambio, etiqueta }: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <Switch
      value={valor}
      onValueChange={onCambio}
      accessibilityLabel={etiqueta}
      trackColor={{ true: colores.marino, false: colores.linea }}
      thumbColor={colores.blanco}
    />
  );
}
