import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MODO_DEMO } from '../datos/demo';
import { CAMPO_CUENTA, claveRecorrido, PASOS_RECORRIDO, VERSION_RECORRIDO, yaVioRecorrido } from '../lib/recorrido';
import { supabase } from '../lib/supabase';
import { useSesion } from './SesionProvider';

type ValorRecorrido = {
  /** true mientras se muestran las ventanitas. */
  activo: boolean;
  paso: number;
  /** Abre el recorrido desde el principio (por ejemplo, desde el perfil). */
  iniciar: () => void;
  siguiente: () => void;
  anterior: () => void;
  /** Cierra el recorrido (terminado o salteado) y recuerda que ya se vio. */
  terminar: () => void;
};

const Ctx = createContext<ValorRecorrido>({
  activo: false, paso: 0, iniciar: () => {}, siguiente: () => {}, anterior: () => {}, terminar: () => {},
});

/** Espera antes de abrir el recorrido solo, para que se dibuje el inicio detrás. */
const ESPERA_INICIAL_MS = 700;

/**
 * La primera vez que una cuenta entra a la app (ya con su carrera elegida)
 * abre el recorrido de bienvenida. Se recuerda en el celular y en la cuenta.
 */
export function RecorridoProvider({ children }: { children: ReactNode }) {
  const { sesion, perfil, bloqueado } = useSesion();
  const uid = sesion?.user.id ?? null;
  const listo = Boolean(uid && perfil?.plan_id && !bloqueado);
  // Se lee con una ref: el objeto cambia en cada renovación de la sesión y no debe reabrir nada.
  const metadatos = sesion?.user.user_metadata;
  const datosCuenta = useRef<unknown>(null);
  useEffect(() => {
    datosCuenta.current = metadatos;
  }, [metadatos]);
  // Cuenta para la que está abierto el recorrido (al cambiar de cuenta se cierra solo).
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  // Cuentas ya revisadas en esta apertura de la app (para no reabrirlo).
  const revisado = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      revisado.current = null;
      setAbiertoPara(null);
      setPaso(0);
      return;
    }
    if (!listo || revisado.current === uid) return;
    revisado.current = uid;
    let vigente = true;
    let decidido = false;
    let espera: ReturnType<typeof setTimeout> | undefined;
    AsyncStorage.getItem(claveRecorrido(uid))
      .catch(() => null)
      .then((local) => {
        if (!vigente) return;
        decidido = true;
        if (yaVioRecorrido(local, datosCuenta.current)) {
          // Lo vio en otro celular: se anota acá para no consultarlo de nuevo.
          if (!local) AsyncStorage.setItem(claveRecorrido(uid), String(VERSION_RECORRIDO)).catch(() => {});
          return;
        }
        espera = setTimeout(() => {
          espera = undefined;
          setPaso(0);
          setAbiertoPara(uid);
        }, ESPERA_INICIAL_MS);
      });
    return () => {
      vigente = false;
      // Si se canceló antes de abrirlo (por ejemplo, se bloqueó la app), se vuelve a revisar.
      if (espera) clearTimeout(espera);
      if ((!decidido || espera) && revisado.current === uid) revisado.current = null;
    };
  }, [uid, listo]);

  // Si se bloquea la app o se cierra la sesión en medio del recorrido, se oculta (y se retoma al volver).
  const visible = abiertoPara !== null && abiertoPara === uid && listo;

  const irA = useCallback((n: number) => {
    const p = PASOS_RECORRIDO[n];
    if (!p) return;
    setPaso(n);
    if (p.ruta) {
      try {
        // Si hay una pantalla encima de las pestañas (por ejemplo un aviso abierto
        // desde una notificación), se vuelve a ellas en vez de apilar otras pestañas.
        if (router.canDismiss()) router.dismissAll();
        router.navigate(p.ruta);
      } catch {
        // La navegación todavía no está lista: el paso se muestra igual.
      }
    }
  }, []);

  // Al volver del bloqueo la app se rearma en Inicio: se reabre la pestaña del paso actual.
  const estabaVisible = useRef(false);
  useEffect(() => {
    if (visible && !estabaVisible.current && paso > 0) irA(paso);
    estabaVisible.current = visible;
  }, [visible, paso, irA]);

  const terminar = useCallback(() => {
    setAbiertoPara(null);
    setPaso(0);
    if (!uid) return;
    AsyncStorage.setItem(claveRecorrido(uid), String(VERSION_RECORRIDO)).catch(() => {});
    if (!MODO_DEMO) {
      supabase.auth.updateUser({ data: { [CAMPO_CUENTA]: VERSION_RECORRIDO } }).catch(() => {});
    }
  }, [uid]);

  const siguiente = useCallback(() => {
    if (paso >= PASOS_RECORRIDO.length - 1) terminar();
    else irA(paso + 1);
  }, [paso, irA, terminar]);

  const anterior = useCallback(() => {
    if (paso > 0) irA(paso - 1);
  }, [paso, irA]);

  const iniciar = useCallback(() => {
    setPaso(0);
    setAbiertoPara(uid);
  }, [uid]);

  const valor = useMemo(() => ({ activo: visible, paso, iniciar, siguiente, anterior, terminar }), [visible, paso, iniciar, siguiente, anterior, terminar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRecorrido() {
  return useContext(Ctx);
}
