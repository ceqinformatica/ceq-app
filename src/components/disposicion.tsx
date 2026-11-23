import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, type ReactNode } from 'react';
import { Dimensions, Platform, useWindowDimensions, View } from 'react-native';
import { calcularDisposicion, LADO_CORTO_TABLET, type Disposicion } from '../lib/disposicion';
import { espacio } from '../tema';

/** Disposición actual; se actualiza al girar la tablet o cambiar el tamaño de la ventana. */
export function useDisposicion(): Disposicion {
  const { width, height } = useWindowDimensions();
  return calcularDisposicion(width, height);
}

/**
 * En celulares la app queda vertical; en tablets puede girar.
 * (Android 16 ya ignora el bloqueo en pantallas grandes: por eso las tablets
 * tienen que verse bien en horizontal.)
 */
export function useOrientacionPorDispositivo() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const { width, height } = Dimensions.get('screen');
    const esTablet = Math.min(width, height) >= LADO_CORTO_TABLET;
    (esTablet ? ScreenOrientation.unlockAsync() : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)).catch(() => {});
  }, []);
}

/**
 * Dos columnas en tablet (y pantallas anchas); una debajo de la otra en el
 * celular, en el mismo orden.
 */
export function Columnas({ izquierda, derecha, proporcion = 1 }: { izquierda: ReactNode; derecha: ReactNode; proporcion?: number }) {
  const { dosColumnas } = useDisposicion();
  if (!dosColumnas) return <>{izquierda}{derecha}</>;
  return (
    <View style={{ flexDirection: 'row', gap: espacio.xl, alignItems: 'flex-start' }}>
      <View style={{ flex: proporcion, minWidth: 0 }}>{izquierda}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{derecha}</View>
    </View>
  );
}

/** Grilla de tarjetas: 1 columna en el celular, 2 (o más) en tablet. */
export function Grilla({ children, columnas }: { children: ReactNode[]; columnas?: number }) {
  const d = useDisposicion();
  const n = columnas ?? (d.dosColumnas ? 2 : 1);
  if (n === 1) return <>{children}</>;
  const filas: ReactNode[][] = [];
  children.filter((c) => c != null && c !== false).forEach((c, i) => {
    if (i % n === 0) filas.push([]);
    filas[filas.length - 1].push(c);
  });
  return (
    <>
      {filas.map((f, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: espacio.m, alignItems: 'stretch' }}>
          {f.map((c, j) => <View key={j} style={{ flex: 1, minWidth: 0 }}>{c}</View>)}
          {Array.from({ length: n - f.length }, (_, j) => <View key={`v${j}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </>
  );
}
