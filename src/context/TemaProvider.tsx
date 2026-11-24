import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Appearance, Easing, Platform, StyleSheet, View, useColorScheme } from 'react-native';
import { fijarEsquema, fondos, type Esquema } from '../tema';

/** Lo que elige la persona en Perfil: seguir al celular o forzar un tema. */
export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'ceq.tema';

type ValorTema = {
  esquema: Esquema;
  oscuro: boolean;
  preferencia: PreferenciaTema;
  cambiarPreferencia: (p: PreferenciaTema) => void;
  /** Las pantallas de acceso y bloqueo van siempre en claro (como la maqueta aprobada). */
  fijarSoloClaro: (activo: boolean) => void;
};

const TemaContexto = createContext<ValorTema>({
  esquema: 'claro',
  oscuro: false,
  preferencia: 'sistema',
  cambiarPreferencia: () => {},
  fijarSoloClaro: () => {},
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

  const [soloClaro, setSoloClaro] = useState(false);
  const elegido: Esquema = preferencia === 'sistema' ? (sistema === 'dark' ? 'oscuro' : 'claro') : preferencia;
  const esquema: Esquema = soloClaro ? 'claro' : elegido;
  // Entrar o salir del acceso cambia el tema sin el fundido (si no, se vería un velo oscuro al abrir la app).
  const previoSoloClaro = useRef(soloClaro);
  const cambioAcceso = previoSoloClaro.current !== soloClaro;

  // Transición al cambiar de tema: un velo del color de fondo anterior se
  // desvanece sobre la app ya dibujada con el tema nuevo (fundido suave).
  const anterior = useRef<{ esquema: Esquema; fondo: string } | null>(null);
  const velo = useRef(new Animated.Value(0)).current;
  const [colorVelo, setColorVelo] = useState<string | null>(null);
  // En el primer cuadro con el tema nuevo el efecto todavía no corrió: el velo ya tiene que taparlo.
  const cambiando = !cambioAcceso && anterior.current != null && anterior.current.esquema !== esquema;
  if (cambiando) velo.setValue(1);
  const colorMostrado = colorVelo ?? (cambiando ? anterior.current!.fondo : null);

  // Se fija durante el render para que los hijos ya se dibujen con el tema nuevo.
  fijarEsquema(esquema);

  useEffect(() => {
    const previo = anterior.current;
    anterior.current = { esquema, fondo: fondos.fondo };
    const porAcceso = previoSoloClaro.current !== soloClaro;
    previoSoloClaro.current = soloClaro;
    if (porAcceso) {
      // Si había un fundido en curso, se corta para que el velo no quede tapando el acceso.
      velo.setValue(0);
      setColorVelo(null);
      return;
    }
    if (!previo || previo.esquema === esquema) return;
    let vivo = true;
    setColorVelo(previo.fondo);
    velo.setValue(1);
    AccessibilityInfo.isReduceMotionEnabled?.()
      .catch(() => false)
      .then((reducido) => {
        if (!vivo) return;
        if (reducido) { velo.setValue(0); setColorVelo(null); return; }
        Animated.timing(velo, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' })
          .start(({ finished }) => { if (finished && vivo) setColorVelo(null); });
      });
    return () => { vivo = false; };
  }, [esquema, soloClaro, velo]);

  useEffect(() => {
    // Color de la ventana detrás de la app (se ve al rotar o abrir el teclado).
    SystemUI.setBackgroundColorAsync(fondos.fondo).catch(() => {});
  }, [esquema]);

  const cambiarPreferencia = useCallback((p: PreferenciaTema) => {
    setPreferencia(p);
    AsyncStorage.setItem(CLAVE, p).catch(() => {});
  }, []);

  const fijarSoloClaro = useCallback((activo: boolean) => setSoloClaro(activo), []);

  const valor = useMemo(
    () => ({ esquema, oscuro: esquema === 'oscuro', preferencia, cambiarPreferencia, fijarSoloClaro }),
    [esquema, preferencia, cambiarPreferencia, fijarSoloClaro],
  );
  return (
    <TemaContexto.Provider value={valor}>
      <View style={{ flex: 1 }}>
        {children}
        {colorMostrado ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colorMostrado, opacity: velo }]} />
        ) : null}
      </View>
    </TemaContexto.Provider>
  );
}

/**
 * Tema activo. Cada pantalla lo llama (aunque no use el resultado) para
 * volver a dibujarse cuando cambia el tema.
 */
export function useTema() {
  return useContext(TemaContexto);
}
