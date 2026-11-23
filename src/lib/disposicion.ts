/**
 * Cómo se acomoda la app según el tamaño de la pantalla.
 *
 * - Celular: una columna, como siempre, y solo vertical.
 * - Tablet (lado corto ≥ 600): puede girar. Con ≥ 720 de ancho el contenido
 *   se centra y las pantallas principales se parten en dos columnas.
 * - Pantalla ancha (≥ 900, tablet horizontal): las pestañas pasan a una
 *   barra lateral a la izquierda.
 */
export const LADO_CORTO_TABLET = 600;
export const ANCHO_DOS_COLUMNAS = 720;
export const ANCHO_BARRA_LATERAL = 900;

export type Disposicion = {
  /** El dispositivo es una tablet (o una ventana grande en web). */
  tablet: boolean;
  /** La pantalla está más ancha que alta. */
  horizontal: boolean;
  /** Las pantallas principales se muestran en dos columnas. */
  dosColumnas: boolean;
  /** Las pestañas van en una barra lateral. */
  barraLateral: boolean;
  /** Ancho máximo del contenido (centrado); undefined = todo el ancho. */
  anchoMaximo: number | undefined;
};

export function calcularDisposicion(ancho: number, alto: number): Disposicion {
  const tablet = Math.min(ancho, alto) >= LADO_CORTO_TABLET;
  const dosColumnas = ancho >= ANCHO_DOS_COLUMNAS;
  const barraLateral = ancho >= ANCHO_BARRA_LATERAL;
  return {
    tablet,
    horizontal: ancho > alto,
    dosColumnas,
    barraLateral,
    anchoMaximo: dosColumnas ? 1100 : ancho >= 560 ? 640 : undefined,
  };
}
