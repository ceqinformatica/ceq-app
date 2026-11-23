import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hexagono, TramaHex } from '../components/graficos';
import { Boton, Campo, EvitaTeclado, logoCeq, Mensaje, s } from '../components/ui';
import { entrarConCorreo, entrarConGoogle, registrarseConCorreo } from '../lib/auth';
import { supabaseConfigurado } from '../lib/supabase';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../tema';
import { useTema } from '../context/TemaProvider';

export default function Login() {
  useTema();
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState<'inicio' | 'entrar' | 'registro'>('inicio');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });

  const ejecutar = async (clave: string, accion: () => Promise<string | null>, exito?: string) => {
    setCargando(clave);
    setError(null);
    setInfo(null);
    const e = await accion();
    setCargando(null);
    if (e) setError(e);
    else if (exito) setInfo(exito);
  };

  const cambiarModo = (m: typeof modo) => {
    setModo(m);
    setError(null);
    setInfo(null);
  };

  return (
    <EvitaTeclado estilo={{ backgroundColor: fondos.marino }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={[est.portada, { paddingTop: insets.top + espacio.xxl }]} onLayout={(e) => setTam({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {tam.w > 0 && <TramaHex ancho={tam.w} alto={tam.h} opacidad={0.09} tam={44} />}
          <Hexagono tamano={124} relleno={fondos.blanco}>
            <Image source={logoCeq} style={{ width: 84, height: 84 }} accessibilityLabel="Logo del CEQ" />
          </Hexagono>
          <Text style={est.marca}>Portal CEQ</Text>
          <Text style={est.nombre}>Centro de Estudiantes de Química</Text>
          <Text style={est.lema}>Tu vida académica en la FCQ, en un solo lugar</Text>
        </View>

        <View style={[est.panel, { paddingBottom: insets.bottom + espacio.xl }]}>
          {!supabaseConfigurado && <Mensaje texto="Falta configurar Supabase. Copiá .env.example a .env y completá la URL y la clave pública." />}

          {modo === 'inicio' ? (
            <>
              <Text style={est.titulo} accessibilityRole="header">¡Hola!</Text>
              <Text style={[s.sub, { marginBottom: espacio.l }]}>Entrá con tu cuenta para ver tu malla, tu firma y tu carnet.</Text>
              <Pressable
                onPress={() => ejecutar('google', entrarConGoogle)}
                disabled={cargando != null}
                accessibilityRole="button"
                accessibilityLabel="Entrar con Google"
                style={({ pressed }) => [est.google, pressed && { backgroundColor: fondos.tarjeta }, cargando != null && { opacity: 0.6 }]}
              >
                <Ionicons name="logo-google" size={20} color={colores.marino} />
                <Text style={est.googleTexto}>{cargando === 'google' ? 'Abriendo Google…' : 'Continuar con Google'}</Text>
              </Pressable>
              <View style={est.separador}>
                <View style={est.linea} />
                <Text style={s.filaDetalle}>o con tu correo</Text>
                <View style={est.linea} />
              </View>
              <Boton texto="Entrar con correo" icono="mail-outline" onPress={() => cambiarModo('entrar')} />
              <Boton texto="Crear cuenta" variante="fantasma" onPress={() => cambiarModo('registro')} />
            </>
          ) : (
            <>
              <Pressable onPress={() => cambiarModo('inicio')} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: espacio.m }}>
                <Ionicons name="chevron-back" size={18} color={colores.azul} />
                <Text style={s.enlace}>Otras opciones</Text>
              </Pressable>
              <Text style={est.titulo} accessibilityRole="header">{modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</Text>
              <Text style={[s.sub, { marginBottom: espacio.l }]}>{modo === 'entrar' ? 'Con el correo y la contraseña de tu cuenta.' : 'Te mandamos un correo para confirmarla.'}</Text>
              {modo === 'registro' && <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoComplete="name" textContentType="name" />}
              <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="nombre@ejemplo.com" />
              <View>
                <Campo
                  etiqueta="Contraseña"
                  value={clave}
                  onChangeText={setClave}
                  secureTextEntry={!verClave}
                  autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                  ayuda={modo === 'registro' ? 'Mínimo 6 caracteres.' : undefined}
                />
                <Pressable onPress={() => setVerClave((v) => !v)} accessibilityRole="button" accessibilityLabel={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={est.ojo} hitSlop={8}>
                  <Ionicons name={verClave ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
                </Pressable>
              </View>
              {modo === 'entrar' ? (
                <Boton texto="Entrar" cargando={cargando === 'correo'} deshabilitado={!correo || !clave} onPress={() => ejecutar('correo', () => entrarConCorreo(correo, clave))} />
              ) : (
                <Boton
                  texto="Crear cuenta"
                  cargando={cargando === 'correo'}
                  deshabilitado={!correo || clave.length < 6 || !nombre}
                  onPress={() => ejecutar('correo', () => registrarseConCorreo(correo, clave, nombre), 'Te mandamos un correo para confirmar tu cuenta.')}
                />
              )}
            </>
          )}

          <Mensaje texto={error} />
          <Mensaje texto={info} tipo="exito" />

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
  nombre: { fontFamily: fuentes.medium, fontSize: 14, color: colores.celeste, textTransform: 'uppercase', letterSpacing: 1.4, textAlign: 'center' },
  lema: { fontFamily: fuentes.regular, fontSize: 14.5, color: colores.cielo, marginTop: espacio.m, textAlign: 'center', opacity: 0.9 },
  panel: { flexGrow: 1, backgroundColor: fondos.fondo, borderTopLeftRadius: radio.xl + 6, borderTopRightRadius: radio.xl + 6, padding: espacio.xl, marginTop: -espacio.l },
  titulo: { fontFamily: fuentes.bold, fontSize: 24, color: colores.marino, textTransform: 'uppercase', letterSpacing: 0.6 },
  google: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espacio.m, minHeight: 54, borderRadius: radio.m,
    backgroundColor: fondos.superficieBlanca, borderWidth: 1, borderColor: colores.linea, ...sombras.suave,
  },
  googleTexto: { fontFamily: fuentes.semibold, fontSize: 15.5, color: colores.marino },
  separador: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginVertical: espacio.l },
  linea: { flex: 1, height: 1, backgroundColor: fondos.linea },
  ojo: { position: 'absolute', right: 14, top: 38 },
}));
