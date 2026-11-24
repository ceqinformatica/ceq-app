import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, EvitaTeclado, Mensaje, Pantalla, s } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { MODO_DEMO } from '../../datos/demo';
import { cambiarClave, canjearCodigo, confirmarConClave } from '../../lib/auth';
import { CLAVE_MINIMA, metodosDeCuenta, problemaClaveNueva, traducirErrorClave } from '../../lib/recuperacion';
import { colores, espacio, fondos, texto } from '../../tema';
import { useTema } from '../../context/TemaProvider';

type Estado = 'canjeando' | 'formulario' | 'listo' | 'error';

const salirDeAca = () => router.replace('/');

/**
 * Elegir una contraseña nueva.
 * - Desde el enlace del correo "¿Olvidaste tu contraseña?" (llega con ?code=...).
 * - Desde Mi perfil > Seguridad > Cambiar contraseña (?modo=cambiar): pide la actual.
 */
export default function Restablecer() {
  useTema();
  const { sesion } = useSesion();
  const params = useLocalSearchParams<{ code?: string; modo?: string; error?: string; error_description?: string }>();
  const cambiar = params.modo === 'cambiar';
  const errorEnlace = params.error_description ?? params.error;
  const [estado, setEstado] = useState<Estado>(params.code ? 'canjeando' : 'formulario');
  const [errorInicial, setErrorInicial] = useState<string | null>(errorEnlace ? traducirErrorClave(String(errorEnlace)) : null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof params.code !== 'string') return;
    canjearCodigo(params.code).then((e) => {
      if (e) {
        setErrorInicial(traducirErrorClave(e));
        setEstado('error');
      } else setEstado('formulario');
    });
  }, [params.code]);

  // Sin código, sin sesión o con un error en el enlace: no hay a qué cuenta cambiarle la contraseña.
  const sinCuenta = estado === 'formulario' && !sesion && !MODO_DEMO;
  const fallo = estado === 'error' || (errorInicial != null && estado !== 'listo') || sinCuenta;
  const correo = MODO_DEMO ? 'estudiante@ejemplo.com' : metodosDeCuenta(sesion?.user).correo;

  const guardar = async () => {
    const problema = problemaClaveNueva(nueva, repetida);
    if (problema) return setError(problema);
    setGuardando(true);
    setError(null);
    let e: string | null = null;
    if (MODO_DEMO) await new Promise((r) => setTimeout(r, 400));
    else {
      if (cambiar) e = await confirmarConClave(correo ?? '', actual).then((r) => (r ? 'La contraseña actual no es correcta.' : null));
      if (!e) e = await cambiarClave(nueva);
    }
    setGuardando(false);
    if (e) setError(e);
    else setEstado('listo');
  };

  const titulo = cambiar ? 'Cambiar contraseña' : 'Contraseña nueva';
  const volver = cambiar && router.canGoBack() ? () => router.back() : salirDeAca;

  return (
    <EvitaTeclado>
      <Pantalla>
        <BarraSuperior titulo={titulo} onVolver={volver} />
        <View style={{ alignItems: 'center', marginTop: espacio.l, marginBottom: espacio.l }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: estado === 'listo' ? fondos.verdeFondo : fondos.tarjeta, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={estado === 'listo' ? 'checkmark-circle' : 'key-outline'} size={30} color={estado === 'listo' ? colores.verde : colores.marino} />
          </View>
        </View>

        {estado === 'canjeando' ? (
          <View style={{ alignItems: 'center', gap: espacio.m }}>
            <ActivityIndicator color={colores.marino} size="large" accessibilityLabel="Comprobando el enlace" />
            <Text style={s.sub}>Comprobando el enlace…</Text>
          </View>
        ) : estado === 'listo' ? (
          <>
            <Text style={[texto.subtitulo, { color: colores.marino, textAlign: 'center' }]} accessibilityRole="header">¡Listo!</Text>
            <Text style={[s.sub, { textAlign: 'center', marginBottom: espacio.xl }]}>
              Guardamos tu contraseña nueva. La próxima vez que entres con tu correo, usá esta.
            </Text>
            <Boton texto={cambiar ? 'Volver' : 'Ir a la app'} onPress={volver} />
          </>
        ) : fallo ? (
          <>
            <Text style={[texto.subtitulo, { color: colores.marino, textAlign: 'center' }]} accessibilityRole="header">No se pudo usar el enlace</Text>
            <Mensaje texto={errorInicial ?? 'Abrí el enlace que te mandamos por correo desde este mismo celular, o pedí uno nuevo.'} />
            <Boton texto={sesion ? 'Volver a la app' : 'Pedir otro enlace'} onPress={salirDeAca} estilo={{ marginTop: espacio.l }} />
          </>
        ) : (
          <>
            <Text style={[s.sub, { textAlign: 'center', marginBottom: espacio.l }]}>
              {cambiar ? 'Escribí tu contraseña actual y elegí una nueva.' : 'Elegí una contraseña nueva para tu cuenta.'}
              {correo ? `\n${correo}` : ''}
            </Text>
            {cambiar && (
              <Campo etiqueta="Contraseña actual" value={actual} onChangeText={setActual} secureTextEntry={!ver} autoComplete="current-password" textContentType="password" />
            )}
            <View>
              <Campo
                etiqueta="Contraseña nueva"
                value={nueva}
                onChangeText={setNueva}
                secureTextEntry={!ver}
                autoComplete="new-password"
                textContentType="newPassword"
                ayuda={`Mínimo ${CLAVE_MINIMA} caracteres.`}
              />
              <Pressable onPress={() => setVer((v) => !v)} accessibilityRole="button" accessibilityLabel={ver ? 'Ocultar contraseñas' : 'Mostrar contraseñas'} style={{ position: 'absolute', right: 14, top: 38 }} hitSlop={8}>
                <Ionicons name={ver ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
              </Pressable>
            </View>
            <Campo etiqueta="Repetí la contraseña nueva" value={repetida} onChangeText={setRepetida} secureTextEntry={!ver} autoComplete="new-password" textContentType="newPassword" onSubmitEditing={guardar} />
            <Mensaje texto={error} />
            <Boton
              texto="Guardar contraseña"
              icono="checkmark"
              onPress={guardar}
              cargando={guardando}
              deshabilitado={!nueva || !repetida || (cambiar && !actual)}
              estilo={{ marginTop: espacio.s }}
            />
          </>
        )}
      </Pantalla>
    </EvitaTeclado>
  );
}
