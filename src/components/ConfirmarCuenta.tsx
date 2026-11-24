import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSesion } from '../context/SesionProvider';
import { db as demo, MODO_DEMO } from '../datos/demo';
import { confirmarConClave, confirmarConProveedor, salir } from '../lib/auth';
import type { Proveedor } from '../lib/acceso';
import { BotonProveedor } from './BotonProveedor';
import { biometriaActiva, biometriaDisponible, verificarIdentidad } from '../lib/biometria';
import { metodosDeCuenta } from '../lib/recuperacion';
import { colores, crearEstilos, espacio, fondos, fuentes } from '../tema';
import { Boton, Campo, Mensaje, s } from './ui';

/**
 * "Olvidé mi PIN": la persona confirma que es la dueña de la cuenta (con la
 * huella del celular, con Google o con la contraseña de su cuenta) y después
 * puede crear un PIN nuevo. No se borra ningún dato.
 */
export function ConfirmarCuenta({ onConfirmado, onCancelar }: { onConfirmado: () => void; onCancelar: () => void }) {
  const { sesion } = useSesion();
  const metodos = MODO_DEMO ? { google: false, microsoft: false, clave: true, correo: demo.correo } : metodosDeCuenta(sesion?.user);
  const [huella, setHuella] = useState<string | null>(null);
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [cargando, setCargando] = useState<'huella' | Proveedor | 'clave' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // La huella sirve solo si la persona ya la usa para abrir la app.
  useEffect(() => {
    Promise.all([biometriaActiva(), biometriaDisponible()])
      .then(([activa, d]) => setHuella(activa && d.disponible ? d.nombre : null))
      .catch(() => setHuella(null));
  }, []);

  const intentar = async (tipo: 'huella' | Proveedor | 'clave', accion: () => Promise<string | null>) => {
    setCargando(tipo);
    setError(null);
    const r = await accion().catch(() => 'No se pudo confirmar. Probá de nuevo.');
    setCargando(null);
    if (r === null) onConfirmado();
    else if (r !== 'cancelado') setError(r);
  };

  const conHuella = () =>
    intentar('huella', async () => ((await verificarIdentidad('Confirmá para crear un PIN nuevo')) ? null : 'cancelado'));
  const conProveedor = (p: Proveedor) => intentar(p, () => confirmarConProveedor(p));
  const conOtraCuenta = metodos.google || metodos.microsoft;
  const conClave = () =>
    intentar('clave', async () => {
      if (MODO_DEMO) {
        await new Promise((r) => setTimeout(r, 400));
        return null;
      }
      return confirmarConClave(metodos.correo ?? '', clave);
    });

  const ninguno = !huella && !conOtraCuenta && !metodos.clave;

  return (
    <View>
      <View style={est.icono}>
        <Ionicons name="shield-checkmark-outline" size={28} color={colores.marino} />
      </View>
      <Text style={est.titulo} accessibilityRole="header">¿Olvidaste tu PIN?</Text>
      <Text style={[s.sub, { textAlign: 'center', marginBottom: espacio.l }]}>
        Confirmá que sos vos y elegís uno nuevo. No se borra nada de tu información.
      </Text>

      {huella && (
        <Boton
          texto={`Usar mi ${huella}`}
          icono={huella === 'reconocimiento facial' ? 'scan-outline' : 'finger-print'}
          onPress={conHuella}
          cargando={cargando === 'huella'}
          deshabilitado={cargando != null}
        />
      )}

      {(['google', 'microsoft'] as const).map((p) =>
        metodos[p] ? (
          <BotonProveedor key={p} proveedor={p} accion="Confirmar" onPress={() => conProveedor(p)} cargando={cargando === p} deshabilitado={cargando != null} />
        ) : null,
      )}

      {metodos.clave && (
        <View style={{ marginTop: huella || conOtraCuenta ? espacio.l : 0 }}>
          {(huella || conOtraCuenta) && <Text style={[s.filaDetalle, { textAlign: 'center', marginBottom: espacio.m }]}>o con la contraseña de tu cuenta</Text>}
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]} numberOfLines={1}>
            Cuenta: <Text style={{ fontFamily: fuentes.semibold, color: colores.marino }}>{metodos.correo}</Text>
          </Text>
          <View>
            <Campo
              etiqueta="Contraseña"
              value={clave}
              onChangeText={setClave}
              secureTextEntry={!verClave}
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => clave && conClave()}
            />
            <Pressable onPress={() => setVerClave((v) => !v)} accessibilityRole="button" accessibilityLabel={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={est.ojo} hitSlop={8}>
              <Ionicons name={verClave ? 'eye-off-outline' : 'eye-outline'} size={20} color={colores.textoSuave} />
            </Pressable>
          </View>
          <Boton texto="Confirmar" onPress={conClave} cargando={cargando === 'clave'} deshabilitado={!clave || cargando != null} />
        </View>
      )}

      {ninguno && <Mensaje tipo="info" texto="No encontramos otra forma de confirmar tu cuenta. Cerrá sesión y volvé a entrar para crear un PIN nuevo." />}
      <Mensaje texto={error} />

      <Boton texto="Volver al PIN" variante="fantasma" onPress={onCancelar} deshabilitado={cargando != null} estilo={{ marginTop: espacio.s }} />
      <Pressable onPress={salir} accessibilityRole="button" style={{ alignSelf: 'center', padding: espacio.s }}>
        <Text style={[s.filaDetalle, { textAlign: 'center' }]}>
          ¿Tampoco podés entrar a tu cuenta? <Text style={s.enlace}>Cerrar sesión</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const est = crearEstilos(() => ({
  icono: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center', marginBottom: espacio.m },
  titulo: { fontFamily: fuentes.bold, fontSize: 20, color: colores.marino, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  ojo: { position: 'absolute', right: 14, top: 38 },
}));
