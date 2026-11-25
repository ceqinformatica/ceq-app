import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Switch, Text, View } from 'react-native';
import { Boton, BotonIcono, CabeceraMarca, Fila, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { db, MODO_DEMO } from '../datos/demo';
import { eliminarCuenta, salir } from '../lib/auth';
import { registrarEsteCelular, type EstadoRegistro } from '../lib/notificaciones';
import { activarBiometria, biometriaActiva, biometriaDisponible, desactivarBiometria } from '../lib/biometria';
import { pinActivo } from '../lib/pinGuardado';
import { metodosDeCuenta } from '../lib/recuperacion';
import { supabase } from '../lib/supabase';
import { colores, espacio, fondos, fuentes } from '../tema';
import { useTema } from '../context/TemaProvider';
import { useRecorrido } from '../context/RecorridoProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function Perfil() {
  const { preferencia, cambiarPreferencia: cambiarTema, oscuro } = useTema();
  const { sesion, perfil, actualizarPerfil } = useSesion();
  const recorrido = useRecorrido();
  const [carrera, setCarrera] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [bio, setBio] = useState<{ disponible: boolean; nombre: string; activa: boolean } | null>(null);
  const [conPin, setConPin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSalir, setErrorSalir] = useState<string | null>(null);
  const [push, setPush] = useState<EstadoRegistro | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Solo las cuentas creadas con correo tienen contraseña propia (las de Google usan la de Google).
  const conClave = MODO_DEMO || metodosDeCuenta(sesion?.user).clave;

  const borrarDeVerdad = async () => {
    setBorrando(true);
    const err = await eliminarCuenta();
    setBorrando(false);
    if (err) setError(err);
  };

  const pedirBorrarCuenta = () => {
    if (MODO_DEMO) return;
    const titulo = '¿Eliminar tu cuenta?';
    const detalle = 'Se borran tu perfil, tus materias, notas, finales y agenda. No se puede deshacer.';
    if (Platform.OS === 'web') {
      if (window.confirm(`${titulo}\n\n${detalle}`)) borrarDeVerdad();
      return;
    }
    Alert.alert(titulo, detalle, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: borrarDeVerdad },
    ]);
  };

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

  // Al volver de crear, cambiar o quitar el PIN.
  useFocusEffect(
    useCallback(() => {
      pinActivo().then(setConPin).catch(() => setConPin(false));
    }, []),
  );

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
    <Pantalla
      cabecera={
        <CabeceraMarca titulo="Mi perfil" compacta sinPerfil derecha={<BotonIcono icono="close" etiqueta="Cerrar perfil" plano onPress={volver} />}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.l, marginTop: espacio.l }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: fondos.burbuja, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fuentes.bold, fontSize: 32, color: colores.marino }}>{inicial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fuentes.bold, fontSize: 21, color: colores.marinoOscuro }} numberOfLines={2}>{perfil?.nombre ?? 'Sin nombre'}</Text>
              <Text style={{ fontFamily: fuentes.regular, fontSize: 14, color: colores.marinoOscuro, marginTop: 2 }} numberOfLines={1}>{carrera ?? sesion?.user.email}</Text>
            </View>
          </View>
        </CabeceraMarca>
      }
    >
      <Tarjeta estilo={{ paddingVertical: espacio.xs, marginTop: -espacio.m }}>
        <Fila simple icono="stats-chart-outline" titulo="Mi progreso académico" onPress={() => router.push('/estadisticas')} />
        <Fila
          simple
          icono="moon-outline"
          titulo="Modo oscuro"
          detalle={preferencia === 'sistema' ? 'Sigue el modo de tu celular.' : undefined}
          derecha={<Interruptor valor={oscuro} onCambio={(v) => cambiarTema(v ? 'oscuro' : 'claro')} etiqueta="Modo oscuro" />}
        />
        {preferencia !== 'sistema' && (
          <Fila simple icono="phone-portrait-outline" titulo="Usar el modo del celular" onPress={() => cambiarTema('sistema')} />
        )}
        <Fila
          simple
          icono="help-circle-outline"
          titulo="Ayuda y soporte"
          detalle="Ver de nuevo el recorrido de bienvenida"
          onPress={() => {
            // Se vuelve a las pestañas y ahí se abre el recorrido.
            if (router.canGoBack()) router.back();
            else router.replace('/');
            recorrido.iniciar();
          }}
        />
        <Fila simple icono="log-out-outline" titulo="Cerrar sesión" onPress={async () => setErrorSalir(await salir())} ultima />
      </Tarjeta>
      <Mensaje texto={errorSalir} />

      <Seccion icono="school-outline" estilo={{ marginTop: espacio.l }}>Situación académica</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila simple icono="school-outline" titulo={carrera ?? '…'} detalle="Carrera" />
        <Fila simple icono="git-network-outline" titulo={plan ?? '…'} detalle="Plan de estudios" />
        <Fila simple icono="calendar-outline" titulo={perfil?.anio_ingreso ? String(perfil.anio_ingreso) : 'Sin cargar'} detalle="Año de ingreso" ultima />
      </Tarjeta>
      <Boton
        texto="Cambiar carrera o plan"
        variante="secundario"
        icono="swap-horizontal"
        onPress={async () => setError(await actualizarPerfil({ carrera_id: null, plan_id: null }))}
      />

      {perfil?.rol === 'validador' && (
        <>
          <Seccion icono="qr-code-outline" estilo={{ marginTop: espacio.xl }}>CEQ</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            <Fila simple icono="qr-code-outline" titulo="Verificar carnet" detalle="Escanear el QR de un socio" onPress={() => router.push('/verificar')} ultima />
          </Tarjeta>
        </>
      )}

      {perfil?.rol === 'admin' && (
        <>
          <Seccion icono="construct-outline" estilo={{ marginTop: espacio.xl }}>Administración</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            <Fila simple icono="construct-outline" titulo="Panel del CEQ" detalle="Socios, avisos, notificaciones, encuestas y sugerencias" onPress={() => router.push('/admin')} ultima />
          </Tarjeta>
        </>
      )}

      <Seccion icono="notifications-outline" estilo={{ marginTop: espacio.xl }}>Notificaciones</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          simple
          icono="megaphone-outline"
          titulo="Avisos del CEQ"
          detalle="Comunicados, fechas importantes y novedades."
          derecha={<Interruptor valor={perfil?.notif_avisos ?? true} onCambio={(v) => cambiarPreferencia('notif_avisos', v)} etiqueta="Avisos del CEQ" />}
        />
        <Fila
          simple
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
      {push === 'sin_servicios' && (
        <Mensaje tipo="info" texto="Este celular no tiene los servicios de Google, así que no puede recibir notificaciones. Los avisos y tus fechas siguen apareciendo en la app." />
      )}
      {push === 'error' && <Mensaje tipo="info" texto="No pudimos activar las notificaciones en este celular. Probá de nuevo más tarde." />}

      <Seccion icono="lock-closed-outline" estilo={{ marginTop: espacio.xl }}>Seguridad</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        {bio && !bio.disponible ? (
          <Fila simple icono="finger-print" titulo="Desbloqueo biométrico" detalle="Este dispositivo no tiene huella ni rostro configurados. Podés usar un PIN." />
        ) : (
          <Fila
          simple
            icono="finger-print"
            titulo={`Desbloquear con ${bio?.nombre ?? 'huella'}`}
            detalle="Tus datos biométricos nunca salen del celular."
            derecha={
              <Switch
                value={bio?.activa ?? false}
                onValueChange={cambiarBio}
                disabled={!bio}
                accessibilityLabel={`Desbloquear con ${bio?.nombre ?? 'huella'}`}
                trackColor={{ true: fondos.marino, false: colores.linea }}
                thumbColor={colores.blanco}
                {...pulgarWeb}
              />
            }
          />
        )}
        <Fila
          simple
          icono="keypad-outline"
          titulo="PIN de la app"
          detalle={bio?.activa ? 'Para entrar si la huella no funciona, o en vez de ella.' : 'Pide un PIN de 4 a 6 números al abrir la app en este dispositivo.'}
          derecha={
            <Switch
              value={conPin ?? false}
              onValueChange={(v) => router.push(v ? '/pin?modo=crear' : '/pin?modo=quitar')}
              disabled={conPin == null}
              accessibilityLabel="PIN de la app"
              {...pulgarWeb}
              trackColor={{ true: fondos.marino, false: colores.linea }}
              thumbColor={colores.blanco}
            />
          }
          ultima={!conPin && !conClave}
        />
        {conPin && <Fila simple icono="create-outline" titulo="Cambiar PIN" onPress={() => router.push('/pin?modo=cambiar')} ultima={!conClave} />}
        {conClave && (
          <Fila simple icono="key-outline" titulo="Cambiar contraseña" detalle="La de tu cuenta con correo." onPress={() => router.push('/auth/restablecer?modo=cambiar')} ultima />
        )}
      </Tarjeta>

      <Mensaje texto={error} />
      {!MODO_DEMO && <Boton texto="Eliminar mi cuenta" variante="fantasma" icono="trash-outline" onPress={pedirBorrarCuenta} cargando={borrando} estilo={{ marginTop: espacio.xl }} />}
      <Text style={{ fontFamily: fuentes.regular, fontSize: 11.5, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.l }}>
        Portal CEQ · Centro de Estudiantes de Química
      </Text>
    </Pantalla>
  );
}

/** En la web el interruptor encendido usa un verde agua por defecto: lo dejamos blanco. */
const pulgarWeb = { activeThumbColor: '#FFFFFF' } as object;

function Interruptor({ valor, onCambio, etiqueta }: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <Switch
      value={valor}
      onValueChange={onCambio}
      accessibilityLabel={etiqueta}
      trackColor={{ true: fondos.marino, false: colores.linea }}
      thumbColor={colores.blanco}
      {...pulgarWeb}
    />
  );
}
