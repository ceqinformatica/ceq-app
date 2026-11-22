import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { db as demo, MODO_DEMO, UID_DEMO } from '../datos/demo';
import { biometriaActiva, verificarIdentidad } from '../lib/biometria';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../lib/tipos-db';

/** Segundos en segundo plano antes de volver a pedir la huella. */
const BLOQUEO_TRAS_SEGUNDOS = 60;

interface SesionCtx {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** Error al leer el perfil (por ejemplo sin internet). Mientras haya error no se manda al onboarding. */
  errorPerfil: string | null;
  /** true cuando hay que pasar la huella o el rostro antes de ver la app. */
  bloqueado: boolean;
  desbloquear: () => Promise<boolean>;
  recargarPerfil: () => Promise<void>;
  actualizarPerfil: (cambios: Partial<Pick<Perfil, 'nombre' | 'ci' | 'carrera_id' | 'plan_id' | 'anio_ingreso'>>) => Promise<string | null>;
}

const Ctx = createContext<SesionCtx | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const enFondoDesde = useRef<number | null>(null);

  const cargarPerfil = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setPerfil(null);
      setErrorPerfil(null);
      return;
    }
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      // Sin conexión no hay que confundir "no se pudo leer" con "no tiene carrera":
      // se conserva el perfil anterior y se avisa.
      setErrorPerfil('No pudimos cargar tu perfil. Revisá tu conexión.');
      return;
    }
    setErrorPerfil(null);
    setPerfil(data ?? null);
  }, []);

  useEffect(() => {
    // Modo demostración: sesión falsa con datos de ejemplo, sin Supabase.
    if (MODO_DEMO) {
      setSesion({ user: { id: UID_DEMO, email: demo.correo } } as Session);
      setPerfil(demo.perfil);
      setCargando(false);
      return;
    }
    let activo = true;
    (async () => {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!activo) return;
      setSesion(data.session);
      if (data.session && (await biometriaActiva())) setBloqueado(true);
      await cargarPerfil(data.session?.user.id);
      setCargando(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      if (!nueva) setBloqueado(false);
      cargarPerfil(nueva?.user.id);
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
        if (sesion && segundos > BLOQUEO_TRAS_SEGUNDOS && (await biometriaActiva())) setBloqueado(true);
      }
    });
    return () => sub.remove();
  }, [sesion]);

  const desbloquear = useCallback(async () => {
    const ok = await verificarIdentidad();
    if (ok) setBloqueado(false);
    return ok;
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
      if (error) return error.message;
      setPerfil(data);
      return null;
    },
    [sesion],
  );

  return (
    <Ctx.Provider value={{ cargando, sesion, perfil, errorPerfil, bloqueado, desbloquear, recargarPerfil, actualizarPerfil }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return c;
}
