import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { textoError } from '../lib/errores';

/**
 * Carga datos al enfocar la pantalla (y al volver a ella), con estado de
 * carga, error y recarga manual (tirar para actualizar).
 */
export function usarDatos<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultimo = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(async (manual = false) => {
    const id = ++ultimo.current;
    if (manual) setRefrescando(true);
    try {
      const d = await cargar();
      if (id !== ultimo.current) return;
      setDatos(d);
      setError(null);
    } catch (e) {
      if (id !== ultimo.current) return;
      setError(textoError(e, 'No se pudieron cargar los datos.'));
    } finally {
      if (id === ultimo.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, deps);

  useFocusEffect(
    useCallback(() => {
      ejecutar();
    }, [ejecutar]),
  );

  return { datos, setDatos, cargando, refrescando, error, recargar: () => ejecutar(true) };
}
