import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BotonProveedor } from '../components/BotonProveedor';
import { Hexagono } from '../components/graficos';
import { Boton, Campo, EvitaTeclado, logoCeq, Mensaje, s } from '../components/ui';
import type { ModoAcceso, Proveedor } from '../lib/acceso';
import { leerModoInicial } from '../lib/accesoGuardado';
import { entrarConCorreo, entrarConGoogle, entrarConMicrosoft, pedirRecuperarClave, registrarseConCorreo } from '../lib/auth';
import { CLAVE_MINIMA, correoValido } from '../lib/recuperacion';
import { supabaseConfigurado } from '../lib/supabase';
import { colores, crearEstilos, espacio, fondos, fuentes, radio } from '../tema';
import { useTema } from '../context/TemaProvider';

const ENTRAR_CON: Record<Proveedor, () => Promise<string | null>> = { google: entrarConGoogle, microsoft: entrarConMicrosoft };

/**
 * Acceso. La primera vez en el celular se ve "Crear cuenta" (correo, o
 * Google / Microsoft abajo). Desde que se entró una vez, después de cerrar
 * sesión se ve "Iniciar sesión".
 */
export default function Login() {
  useTema();
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState<ModoAcceso | null>(null);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    leerModoInicial().then((m) => activo && setModo((actual) => actual ?? m));
    return () => {
      activo = false;
    };
  }, []);

  const ejecutar = async (clave: string, accion: () => Promise<string | null>, exito?: string) => {
    setCargando(clave);
    setError(null);
    setInfo(null);
    const e = await accion().catch(() => 'No se pudo completar. Probá de nuevo.');
    setCargando(null);
    if (e) setError(e);
    else if (exito) setInfo(exito);
  };

  const cambiarModo = (m: ModoAcceso) => {
    setModo(m);
    setError(null);
    setInfo(null);
  };

  const crearCuenta = async () => {
    setCargando('correo');
    setError(null);
    setInfo(null);
    const r = await registrarseConCorreo(correo, clave, nombre).catch(() => ({ error: 'No se pudo crear la cuenta. Probá de nuevo.' }));
    setCargando(null);
    if ('error' in r) return setError(r.error);
    // 'adentro': la sesión ya cambió y la app pasa sola a la pantalla principal.
    if (r.resultado === 'confirmar')
      setInfo(`¡Listo! Te mandamos un correo a ${correo.trim()}. Abrí el enlace desde este celular para entrar. Revisá también la carpeta de spam.`);
    if (r.resultado === 'ya-existe') {
      setModo('entrar');
      setClave('');
      setInfo('Ese correo ya tiene una cuenta. Iniciá sesión con tu contraseña.');
    }
  };

  const registro = modo === 'registro';
  const ocupado = cargando != null;

  /** Google y Microsoft, debajo del formulario. */
  const otrasCuentas = (
    <>
      <View style={est.separador}>
        <View style={est.linea} />
        <Text style={s.filaDetalle}>o continuá con</Text>
        <View style={est.linea} />
      </View>
      {(['google', 'microsoft'] as const).map((p) => (
        <BotonProveedor key={p} proveedor={p} cargando={cargando === p} deshabilitado={ocupado} onPress={() => ejecutar(p, ENTRAR_CON[p])} />
      ))}
    </>
  );

  return (
    <EvitaTeclado estilo={{ backgroundColor: fondos.celesteMarca }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={[est.portada, { paddingTop: insets.top + espacio.xxl }]}>
          <Hexagono tamano={108} relleno={fondos.blanco}>
            <Image source={logoCeq} style={{ width: 72, height: 72 }} accessibilityLabel="Logo del CEQ" />
          </Hexagono>
          <Text style={est.marca}>Portal CEQ</Text>
          <Text style={est.nombre}>Centro de Estudiantes de Química</Text>
        </View>

        <View style={[est.panel, { paddingBottom: insets.bottom + espacio.xl }]}>
          {!supabaseConfigurado && <Mensaje texto="Falta configurar Supabase. Copiá .env.example a .env y completá la URL y la clave pública." />}

          {modo === null ? null : modo === 'recuperar' ? (
            <>
              <Pressable onPress={() => cambiarModo('entrar')} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={8} style={est.volver}>
                <Ionicons name="chevron-back" size={18} color={colores.azul} />
                <Text style={s.enlace}>Volver a iniciar sesión</Text>
              </Pressable>
              <Text style={est.titulo} accessibilityRole="header">Recuperar contraseña</Text>
              <Text style={[s.sub, { marginBottom: espacio.l }]}>
                Escribí el correo de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.
              </Text>
              <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="nombre@ejemplo.com" />
              <Boton
                texto="Enviar enlace"
                icono="send-outline"
                cargando={cargando === 'recuperar'}
                deshabilitado={!correoValido(correo)}
                onPress={() =>
                  ejecutar(
                    'recuperar',
                    () => pedirRecuperarClave(correo),
                    `Si ${correo.trim()} tiene una cuenta, te llegó un correo. Abrí el enlace desde este mismo celular. Revisá también la carpeta de spam.`,
                  )
                }
              />
              <Text style={[s.filaDetalle, { marginTop: espacio.m }]}>
                ¿Entrás con Google o Microsoft? Tu contraseña es la de esa cuenta y se recupera desde Google o Microsoft, no acá.
              </Text>
            </>
          ) : (
            <>
              <Text style={est.titulo} accessibilityRole="header">{registro ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
              <Text style={[s.sub, { marginBottom: espacio.l }]}>
                {registro ? 'Tu malla, tu firma, tu agenda y tu carnet del CEQ, en un solo lugar.' : '¡Qué bueno verte de nuevo! Entrá con tu cuenta.'}
              </Text>
              {registro && <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoComplete="name" textContentType="name" autoCapitalize="words" />}
              <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="nombre@ejemplo.com" />
              <View>
                <Campo
                  etiqueta="Contraseña"
                  value={clave}
                  onChangeText={setClave}
                  secureTextEntry={!verClave}
                  autoComplete={registro ? 'new-password' : 'current-password'}
                  textContentType={registro ? 'newPassword' : 'password'}
                  ayuda={registro ? `Mínimo ${CLAVE_MINIMA} caracteres.` : undefined}
                />
                <Pressable onPress={() => setVerClave((v) => !v)} accessibilityRole="button" accessibilityLabel={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={est.ojo} hitSlop={8}>
                  <Ionicons name={verClave ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
                </Pressable>
              </View>
              {registro ? (
                <Boton
                  texto="Crear cuenta"
                  cargando={cargando === 'correo'}
                  deshabilitado={!nombre.trim() || !correoValido(correo) || clave.length < CLAVE_MINIMA || ocupado}
                  onPress={crearCuenta}
                />
              ) : (
                <>
                  <Boton
                    texto="Iniciar sesión"
                    cargando={cargando === 'correo'}
                    deshabilitado={!correo || !clave || ocupado}
                    onPress={() => ejecutar('correo', () => entrarConCorreo(correo, clave))}
                  />
                  <Pressable onPress={() => cambiarModo('recuperar')} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', padding: espacio.s, marginTop: espacio.xs }}>
                    <Text style={s.enlace}>¿Olvidaste tu contraseña?</Text>
                  </Pressable>
                </>
              )}

              <Mensaje texto={error} />
              <Mensaje texto={info} tipo="exito" />

              {otrasCuentas}

              <Pressable
                onPress={() => cambiarModo(registro ? 'entrar' : 'registro')}
                accessibilityRole="button"
                hitSlop={8}
                style={est.cambiar}
              >
                <Text style={[s.filaDetalle, { textAlign: 'center' }]}>
                  {registro ? '¿Ya tenés cuenta? ' : '¿Todavía no tenés cuenta? '}
                  <Text style={s.enlace}>{registro ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
                </Text>
              </Pressable>
            </>
          )}

          {modo === 'recuperar' && (
            <>
              <Mensaje texto={error} />
              <Mensaje texto={info} tipo="exito" />
            </>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 'auto', paddingTop: espacio.xl }}>
            <Ionicons name="lock-closed-outline" size={13} color={colores.textoTenue} />
            <Text style={[s.filaDetalle, { color: colores.textoTenue, fontSize: 12 }]}>Tus datos académicos son privados y solo vos los ves.</Text>
          </View>
        </View>
      </ScrollView>
    </EvitaTeclado>
  );
}

const est = crearEstilos(() => ({
  portada: { alignItems: 'center', paddingHorizontal: espacio.xl, paddingBottom: espacio.xxl + espacio.l, overflow: 'hidden' },
  marca: { fontFamily: fuentes.bold, fontSize: 34, color: colores.blanco, letterSpacing: 2, textAlign: 'center', marginTop: espacio.l },
  nombre: { fontFamily: fuentes.medium, fontSize: 14, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1.4, textAlign: 'center' },
  panel: { flexGrow: 1, backgroundColor: fondos.fondo, borderTopLeftRadius: radio.xl + 6, borderTopRightRadius: radio.xl + 6, padding: espacio.xl, marginTop: -espacio.l },
  titulo: { fontFamily: fuentes.bold, fontSize: 24, color: colores.marino, textTransform: 'uppercase', letterSpacing: 0.6 },
  separador: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginVertical: espacio.l },
  linea: { flex: 1, height: 1, backgroundColor: fondos.linea },
  ojo: { position: 'absolute', right: 14, top: 38 },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: espacio.m },
  cambiar: { alignSelf: 'center', paddingVertical: espacio.m, paddingHorizontal: espacio.s, marginTop: espacio.m },
}));
