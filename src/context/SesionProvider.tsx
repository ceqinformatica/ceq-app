import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { biometriaActiva, verificarIdentidad } from '../lib/biometria';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../lib/tipos-db';

/** Segundos en segundo plano antes de volver a pedir la huella. */
const BLOQUEO_TRAS_SEGUNDOS = 60;

interface SesionCtx {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
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
  const [bloqueado, setBloqueado] = useState(false);
  const enFondoDesde = useRef<number | null>(null);

  const cargarPerfil = useCallback(async (uid: string | undefined) => {
    if (!uid) return setPerfil(null);
    const { data } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle();
    setPerfil(data ?? null);
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
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
      const { data, error } = await supabase.from('perfiles').update(cambios).eq('id', sesion.user.id).select('*').single();
      if (error) return error.message;
      setPerfil(data);
      return null;
    },
    [sesion],
  );

  return (
    <Ctx.Provider value={{ cargando, sesion, perfil, bloqueado, desbloquear, recargarPerfil, actualizarPerfil }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return c;
}
