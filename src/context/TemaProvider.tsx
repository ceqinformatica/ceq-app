import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { fijarEsquema, fondos, type Esquema } from '../tema';

/** Lo que elige la persona en Perfil: seguir al celular o forzar un tema. */
export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'ceq.tema';

type ValorTema = {
  esquema: Esquema;
  oscuro: boolean;
  preferencia: PreferenciaTema;
  cambiarPreferencia: (p: PreferenciaTema) => void;
};

const TemaContexto = createContext<ValorTema>({
  esquema: 'claro',
  oscuro: false,
  preferencia: 'sistema',
  cambiarPreferencia: () => {},
});

function esPreferencia(v: unknown): v is PreferenciaTema {
  return v === 'sistema' || v === 'claro' || v === 'oscuro';
}

/** Lee la preferencia guardada; mientras tanto no dibuja nada (es instantáneo). */
export function useCargarPreferenciaTema() {
  const [lista, setLista] = useState(false);
  const [inicial, setInicial] = useState<PreferenciaTema>('sistema');
  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((v) => { if (esPreferencia(v)) setInicial(v); })
      .catch(() => {})
      .finally(() => setLista(true));
  }, []);
  return { lista, inicial };
}

/**
 * Decide el tema (sistema, claro u oscuro), lo fija para `colores`/`fondos`
 * antes de dibujar a los hijos y avisa a las pantallas (que llaman useTema)
 * para que se vuelvan a dibujar.
 */
export function TemaProvider({ inicial = 'sistema', children }: { inicial?: PreferenciaTema; children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(inicial);
  const sistema = useColorScheme();

  // Los componentes nativos (selector de fecha, alertas, teclado) siguen al
  // tema elegido. En web no hay forma de forzarlo: solo cambian los colores.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(preferencia === 'sistema' ? 'unspecified' : preferencia === 'oscuro' ? 'dark' : 'light');
    } catch {
      // Versión de React Native sin soporte: se ignora.
    }
  }, [preferencia]);

  const esquema: Esquema = preferencia === 'sistema' ? (sistema === 'dark' ? 'oscuro' : 'claro') : preferencia;
  // Se fija durante el render para que los hijos ya se dibujen con el tema nuevo.
  fijarEsquema(esquema);

  useEffect(() => {
    // Color de la ventana detrás de la app (se ve al rotar o abrir el teclado).
    SystemUI.setBackgroundColorAsync(fondos.fondo).catch(() => {});
  }, [esquema]);

  const cambiarPreferencia = useCallback((p: PreferenciaTema) => {
    setPreferencia(p);
    AsyncStorage.setItem(CLAVE, p).catch(() => {});
  }, []);

  const valor = useMemo(() => ({ esquema, oscuro: esquema === 'oscuro', preferencia, cambiarPreferencia }), [esquema, preferencia, cambiarPreferencia]);
  return <TemaContexto.Provider value={valor}>{children}</TemaContexto.Provider>;
}

/**
 * Tema activo. Cada pantalla lo llama (aunque no use el resultado) para
 * volver a dibujarse cuando cambia el tema.
 */
export function useTema() {
  return useContext(TemaContexto);
}
