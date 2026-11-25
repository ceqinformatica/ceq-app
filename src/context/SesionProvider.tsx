import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { borrarCache, fijarUsuarioCache, guardarCache, leerCache } from '../datos/cache';
import { db as demo, MODO_DEMO, UID_DEMO } from '../datos/demo';
import { esErrorDeRed, textoError } from '../lib/errores';
import { biometriaActiva, verificarIdentidad } from '../lib/biometria';
import { almacenSeguro } from '../lib/almacenSeguro';
import { borrarPin, comprobarPin, fijarCuentaPin, guardarPin, pinActivo, reiniciarIntentosPin, type ResultadoPin } from '../lib/pinGuardado';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../lib/tipos-db';

/** Segundos en segundo plano antes de volver a pedir la huella o el PIN. */
const BLOQUEO_TRAS_SEGUNDOS = 60;

interface SesionCtx {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** Error al leer el perfil (por ejemplo sin internet). Mientras haya error no se manda al onboarding. */
  errorPerfil: string | null;
  /** true cuando hay que pasar la huella, el rostro o el PIN antes de ver la app. */
  bloqueado: boolean;
  desbloquear: () => Promise<boolean>;
  desbloquearConPin: (pin: string) => Promise<ResultadoPin>;
  /**
   * "Olvidé mi PIN": después de confirmar la cuenta (huella, Google o
   * contraseña) guarda el PIN nuevo, o lo quita si no se eligió uno, y abre la app.
   */
  abrirConPinNuevo: (pinNuevo: string | null) => Promise<string | null>;
  recargarPerfil: () => Promise<void>;
  actualizarPerfil: (cambios: Partial<Pick<Perfil, 'nombre' | 'ci' | 'carrera_id' | 'plan_id' | 'anio_ingreso' | 'notif_avisos' | 'notif_recordatorios' | 'fin_clases'>>) => Promise<string | null>;
}

const Ctx = createContext<SesionCtx | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const enFondoDesde = useRef<number | null>(null);
  const sinConexionAlEmpezar = useRef(false);
  const usuarioActual = useRef<string | null>(null);
  // La cuenta con sesión, para saber cuándo alguien recién entra.
  const uidSesion = useRef<string | null>(null);

  const cargarPerfil = useCallback(async (uid: string | undefined) => {
    fijarUsuarioCache(uid ?? null);
    usuarioActual.current = uid ?? null;
    if (!uid) {
      setPerfil(null);
      setErrorPerfil(null);
      return;
    }
    // Cambió la cuenta: el perfil de la anterior no se muestra mientras llega el nuevo.
    setPerfil((p) => (p && p.id === uid ? p : null));
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle();
    // Si mientras tanto cambió la cuenta, esta respuesta ya no corresponde.
    if (usuarioActual.current !== uid) return;
    if (error) {
      // Sin conexión no hay que confundir "no se pudo leer" con "no tiene carrera":
      // se usa el perfil guardado en el celular (o el anterior) y se avisa.
      const guardado = esErrorDeRed(error) ? await leerCache<Perfil>('perfil') : null;
      if (guardado && usuarioActual.current === uid && guardado.valor.id === uid) {
        setPerfil((p) => (p && p.id === uid ? p : guardado.valor));
        setErrorPerfil(null);
        return;
      }
      setErrorPerfil('No pudimos cargar tu perfil. Revisá tu conexión.');
      return;
    }
    setErrorPerfil(null);
    setPerfil(data ?? null);
    if (data) guardarCache('perfil', data);
  }, []);

  useEffect(() => {
    // Modo demostración: sesión falsa con datos de ejemplo, sin Supabase.
    if (MODO_DEMO) {
      fijarCuentaPin(UID_DEMO);
      uidSesion.current = UID_DEMO;
      setSesion({ user: { id: UID_DEMO, email: demo.correo } } as Session);
      setPerfil(demo.perfil);
      hayBloqueo().then((b) => {
        setBloqueado(b);
        setCargando(false);
      });
      return;
    }
    let activo = true;
    (async () => {
      const r = await supabase.auth.getSession().catch((error: unknown) => ({ data: { session: null }, error }));
      let inicial = r.data.session;
      // Sin internet y con el token vencido, Supabase no puede renovarlo y
      // devuelve "sin sesión", pero la sesión sigue guardada: se usa esa para
      // poder ver lo guardado. Al volver la conexión se renueva sola.
      if (!inicial && 'error' in r && r.error && esErrorDeRed(r.error)) inicial = await sesionGuardada();
      sinConexionAlEmpezar.current = Boolean(inicial && !r.data.session);
      if (!activo) return;
      uidSesion.current = inicial?.user.id ?? null;
      fijarCuentaPin(uidSesion.current);
      setSesion(inicial);
      const data = { session: inicial };
      if (data.session && (await hayBloqueo())) setBloqueado(true);
      await cargarPerfil(data.session?.user.id);
      setCargando(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((evento, nueva) => {
      // El primer aviso llega sin sesión cuando no hay internet: no es un cierre de sesión.
      if (evento === 'INITIAL_SESSION' && !nueva && sinConexionAlEmpezar.current) return;
      if (evento === 'SIGNED_OUT') {
        sinConexionAlEmpezar.current = false;
        borrarCache();
        // El PIN NO se borra: es de esa cuenta en este celular y se vuelve a
        // pedir cuando entre de nuevo (ver pinGuardado).
      }
      const uid = nueva?.user.id ?? null;
      // Alguien recién entra (o cambió de cuenta): si esa cuenta tiene PIN o
      // huella en este celular, se bloquea ANTES de mostrar nada. Así cerrar
      // sesión y volver a entrar con Google no saltea el PIN.
      const entro = uid != null && uid !== uidSesion.current;
      uidSesion.current = uid;
      fijarCuentaPin(uid);
      const aplicar = (bloquear: boolean) => {
        if (uidSesion.current !== uid) return; // mientras tanto cambió otra vez
        if (bloquear) setBloqueado(true);
        setSesion(nueva);
        if (!nueva) setBloqueado(false);
        cargarPerfil(uid ?? undefined);
      };
      if (entro) hayBloqueo().then(aplicar, () => aplicar(false));
      else aplicar(false);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [cargarPerfil]);

  // Vuelve a bloquear si la app estuvo en segundo plano un rato.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (estado) => {
      if (estado === 'background') enFondoDesde.current = Date.now();
      if (estado === 'active' && enFondoDesde.current) {
        const segundos = (Date.now() - enFondoDesde.current) / 1000;
        enFondoDesde.current = null;
        if (sesion && segundos > BLOQUEO_TRAS_SEGUNDOS && (await hayBloqueo())) setBloqueado(true);
      }
    });
    return () => sub.remove();
  }, [sesion]);

  const desbloquear = useCallback(async () => {
    const ok = await verificarIdentidad();
    if (ok) {
      await reiniciarIntentosPin().catch(() => {});
      setBloqueado(false);
    }
    return ok;
  }, []);

  const desbloquearConPin = useCallback(async (pin: string) => {
    const r = await comprobarPin(pin);
    if (r.ok) setBloqueado(false);
    return r;
  }, []);

  const abrirConPinNuevo = useCallback(async (pinNuevo: string | null) => {
    if (pinNuevo) {
      const err = await guardarPin(pinNuevo).catch(() => 'No se pudo guardar el PIN en este dispositivo.');
      if (err) return err;
    } else {
      await borrarPin().catch(() => {});
    }
    setBloqueado(false);
    return null;
  }, []);

  const recargarPerfil = useCallback(() => cargarPerfil(sesion?.user.id), [cargarPerfil, sesion]);

  const actualizarPerfil = useCallback<SesionCtx['actualizarPerfil']>(
    async (cambios) => {
      if (!sesion) return 'No hay sesión.';
      if (MODO_DEMO) {
        demo.perfil = { ...demo.perfil, ...cambios };
        setPerfil(demo.perfil);
        return null;
      }
      const { data, error } = await supabase.from('perfiles').update(cambios).eq('id', sesion.user.id).select('*').single();
      if (error) return textoError(error, 'No se pudo guardar.');
      setPerfil(data);
      guardarCache('perfil', data);
      return null;
    },
    [sesion],
  );

  return (
    <Ctx.Provider value={{ cargando, sesion, perfil, errorPerfil, bloqueado, desbloquear, desbloquearConPin, abrirConPinNuevo, recargarPerfil, actualizarPerfil }}>
      {children}
    </Ctx.Provider>
  );
}

/** Si este dispositivo tiene huella/rostro o PIN activado para abrir la app. */
async function hayBloqueo(): Promise<boolean> {
  const [bio, pin] = await Promise.all([biometriaActiva().catch(() => false), pinActivo().catch(() => false)]);
  return bio || pin;
}

/** La sesión tal como quedó guardada en el celular (para usar la app sin internet). */
async function sesionGuardada(): Promise<Session | null> {
  try {
    const clave = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (!clave) return null;
    const texto = await almacenSeguro.getItem(clave);
    const s = texto ? (JSON.parse(texto) as Session) : null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return c;
}
