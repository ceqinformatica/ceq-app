import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { avisoSinConexion } from '../lib/cache';
import { esErrorDeRed, textoError } from '../lib/errores';
import { guardarCache, leerCache } from './cache';

/**
 * Carga datos al enfocar la pantalla (y al volver a ella), con estado de
 * carga, error y recarga manual (tirar para actualizar).
 *
 * Con `cache` (una clave), lo último que se cargó queda guardado en el
 * celular: al abrir la pantalla se muestra enseguida y, si no hay internet,
 * se sigue mostrando con un aviso de cuándo se guardó.
 */
export function usarDatos<T>(cargar: () => Promise<T>, deps: unknown[], opciones?: { cache?: string | null }) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** true mientras lo que se ve viene de lo guardado y no se pudo actualizar. */
  const [sinConexion, setSinConexion] = useState(false);
  const ultimo = useRef(0);
  const clave = opciones?.cache ?? null;
  const claveRef = useRef(clave);
  claveRef.current = clave;
  /** Cuándo se cargó o guardó lo que se está mostrando. */
  const guardadoEl = useRef<number | null>(null);
  /** Para no volver a guardar lo que se acaba de leer de lo guardado. */
  const desdeCache = useRef(false);
  /** Qué clave ya se leyó, para leer lo guardado una sola vez por clave. */
  const leida = useRef<string | null>(null);
  /** De qué clave son los datos en pantalla: nunca se guardan bajo otra. */
  const claveDeDatos = useRef<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(async (manual = false) => {
    const id = ++ultimo.current;
    const k = claveRef.current;
    if (manual) setRefrescando(true);
    // Cambió la clave (por ejemplo, otro plan): lo de antes no sirve.
    if (k && claveDeDatos.current && claveDeDatos.current !== k) {
      claveDeDatos.current = null;
      guardadoEl.current = null;
      desdeCache.current = false;
      setDatos(null);
      setError(null);
      setSinConexion(false);
      setCargando(true);
    }
    // Primero lo guardado, para no esperar a la red.
    if (k && leida.current !== k) {
      leida.current = k;
      const g = await leerCache<T>(k);
      if (g && id === ultimo.current) {
        desdeCache.current = true;
        claveDeDatos.current = k;
        guardadoEl.current = g.guardado;
        setDatos(g.valor);
        setCargando(false);
      }
    }
    try {
      const d = await cargar();
      if (id !== ultimo.current) return;
      desdeCache.current = false;
      claveDeDatos.current = k;
      guardadoEl.current = Date.now();
      setDatos(d);
      setError(null);
      setSinConexion(false);
    } catch (e) {
      if (id !== ultimo.current) return;
      const red = esErrorDeRed(e);
      if (red && guardadoEl.current != null) {
        setSinConexion(true);
        setError(avisoSinConexion(guardadoEl.current));
      } else {
        setSinConexion(red);
        setError(textoError(e, 'No se pudieron cargar los datos.'));
      }
    } finally {
      if (id === ultimo.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
  }, deps);

  // Lo cargado (y lo que la pantalla cambia con setDatos) se guarda.
  useEffect(() => {
    if (desdeCache.current) {
      desdeCache.current = false;
      return;
    }
    if (clave && datos != null && claveDeDatos.current === clave) guardarCache(clave, datos);
  }, [datos, clave]);

  /** Para que la pantalla cambie lo que muestra (y quede guardado). */
  const cambiarDatos = useCallback((v: T | null | ((actual: T | null) => T | null)) => {
    claveDeDatos.current = claveRef.current;
    setDatos(v);
  }, []);

  useFocusEffect(
    useCallback(() => {
      ejecutar();
    }, [ejecutar]),
  );

  return { datos, setDatos: cambiarDatos, cargando, refrescando, error, sinConexion, recargar: () => ejecutar(true) };
}
