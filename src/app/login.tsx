import { useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, Campo, Mensaje, Pantalla, Tarjeta, Titulo } from '../components/ui';
import { entrarConCorreo, entrarConGoogle, registrarseConCorreo } from '../lib/auth';
import { supabaseConfigurado } from '../lib/supabase';
import { colores, espacio } from '../tema';

export default function Login() {
  const [modo, setModo] = useState<'inicio' | 'entrar' | 'registro'>('inicio');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const ejecutar = async (accion: () => Promise<string | null>, exito?: string) => {
    setCargando(true);
    setError(null);
    setInfo(null);
    const e = await accion();
    setCargando(false);
    if (e) setError(e);
    else if (exito) setInfo(exito);
  };

  return (
    <Pantalla estilo={{ paddingTop: espacio.xxl * 2 }}>
      <Titulo sub="Tu vida académica en la FCQ, en un solo lugar">CEQ</Titulo>

      {!supabaseConfigurado && (
        <Tarjeta>
          <Text style={{ color: colores.rojo }}>
            Falta configurar Supabase. Copiá .env.example a .env y completá la URL y la clave pública.
          </Text>
        </Tarjeta>
      )}

      {modo === 'inicio' && (
        <View>
          <Boton texto="Entrar con Google" onPress={() => ejecutar(entrarConGoogle)} cargando={cargando} />
          <Boton texto="Entrar con correo" variante="secundario" onPress={() => setModo('entrar')} />
          <Boton texto="Crear cuenta con correo" variante="secundario" onPress={() => setModo('registro')} />
        </View>
      )}

      {modo !== 'inicio' && (
        <Tarjeta>
          {modo === 'registro' && <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoComplete="name" />}
          <Campo etiqueta="Correo" value={correo} onChangeText={setCorreo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Campo etiqueta="Contraseña" value={clave} onChangeText={setClave} secureTextEntry autoComplete={modo === 'registro' ? 'new-password' : 'current-password'} />
          {modo === 'entrar' ? (
            <Boton texto="Entrar" cargando={cargando} deshabilitado={!correo || !clave} onPress={() => ejecutar(() => entrarConCorreo(correo, clave))} />
          ) : (
            <Boton
              texto="Crear cuenta"
              cargando={cargando}
              deshabilitado={!correo || clave.length < 6 || !nombre}
              onPress={() => ejecutar(() => registrarseConCorreo(correo, clave, nombre), 'Te mandamos un correo para confirmar tu cuenta.')}
            />
          )}
          <Boton texto="Volver" variante="secundario" onPress={() => setModo('inicio')} />
        </Tarjeta>
      )}

      <Mensaje texto={error} />
      <Mensaje texto={info} tipo="info" />
    </Pantalla>
  );
}
