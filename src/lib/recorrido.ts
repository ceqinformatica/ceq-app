/**
 * Recorrido de bienvenida: ventanitas que explican cada sección la primera
 * vez que una cuenta entra a la app. Acá solo hay datos y cálculos (sin
 * React) para poder probarlos.
 */

/** Subir este número hace que todos vuelvan a ver el recorrido (por ejemplo, si cambian mucho las secciones). */
export const VERSION_RECORRIDO = 1;

/** Clave en el celular, una por cuenta. */
export const claveRecorrido = (uid: string) => `ceq.recorrido.${uid}`;

/** Campo en los datos de la cuenta (Supabase Auth) para no repetirlo en otro celular. */
export const CAMPO_CUENTA = 'recorrido_visto';

export type Icono = 'sparkles' | 'home' | 'school' | 'calculator' | 'calendar' | 'people' | 'person-circle';

export type PasoRecorrido = {
  id: string;
  titulo: string;
  texto: string;
  icono: Icono;
  /** Pestaña que se abre y se resalta (0 = Inicio … 4 = CEQ). Sin pestaña, la ventanita va al centro. */
  pestana?: number;
  /** Ruta que se abre antes de mostrar el paso. */
  ruta?: '/' | '/carrera' | '/firma' | '/agenda' | '/ceq';
};

export const PASOS_RECORRIDO: readonly PasoRecorrido[] = [
  {
    id: 'bienvenida',
    titulo: 'Te damos la bienvenida al Portal CEQ',
    texto: 'En un minuto te mostramos cómo usar la app. Podés saltar el recorrido cuando quieras y volver a verlo desde tu perfil.',
    icono: 'sparkles',
  },
  {
    id: 'inicio',
    titulo: 'Inicio',
    texto: 'Tu resumen del día: cuánto avanzaste en la carrera, tus clases de hoy, las próximas fechas y los avisos del CEQ. Los accesos rápidos te llevan a la malla, la firma y la agenda.',
    icono: 'home',
    pestana: 0,
    ruta: '/',
  },
  {
    id: 'carrera',
    titulo: 'Mi carrera',
    texto: 'Tu malla completa. Tocá una materia para marcarla como cursando, firmada o aprobada con su nota: la app te dice qué materias se desbloquean y calcula tu progreso y tu promedio.',
    icono: 'school',
    pestana: 1,
    ruta: '/carrera',
  },
  {
    id: 'firma',
    titulo: 'Firma',
    texto: 'La calculadora de firma. Cargá las notas de tus parciales y tu asistencia, y te mostramos cuánto te falta para firmar cada materia que estás cursando.',
    icono: 'calculator',
    pestana: 2,
    ruta: '/firma',
  },
  {
    id: 'agenda',
    titulo: 'Agenda',
    texto: 'Tu horario de clases y tus parciales, finales y entregas. Te avisamos antes de cada fecha, y acá también está el calendario académico de la FCQ.',
    icono: 'calendar',
    pestana: 3,
    ruta: '/agenda',
  },
  {
    id: 'ceq',
    titulo: 'CEQ',
    texto: 'Todo lo del Centro de Estudiantes: avisos, tu carnet de socio, la guía de trámites de la facultad, encuestas y un buzón para mandarnos sugerencias.',
    icono: 'people',
    pestana: 4,
    ruta: '/ceq',
  },
  {
    id: 'perfil',
    titulo: 'Tu perfil',
    texto: 'Tocá el ícono de perfil arriba a la derecha para cambiar de carrera, elegir el modo oscuro, activar el desbloqueo con huella, manejar las notificaciones y ver este recorrido de nuevo.',
    icono: 'person-circle',
    ruta: '/',
  },
];

/**
 * ¿Ya vio el recorrido? Alcanza con que lo diga el celular o la cuenta
 * (así no se repite al entrar desde otro celular).
 */
export function yaVioRecorrido(guardadoLocal: string | null | undefined, datosCuenta: unknown): boolean {
  const local = Number(guardadoLocal);
  if (Number.isFinite(local) && local >= VERSION_RECORRIDO) return true;
  if (datosCuenta && typeof datosCuenta === 'object') {
    const v = Number((datosCuenta as Record<string, unknown>)[CAMPO_CUENTA]);
    if (Number.isFinite(v) && v >= VERSION_RECORRIDO) return true;
  }
  return false;
}

export type Rect = { x: number; y: number; ancho: number; alto: number };

/** Cantidad de pestañas de la barra. */
export const CANTIDAD_PESTANAS = 5;

/** Medidas de la barra de pestañas; deben coincidir con src/app/(tabs)/_layout.tsx. */
export const BARRA = {
  /** Alto de la barra de abajo sin el margen inferior del sistema. */
  alto: 62,
  paddingArriba: 6,
  /** Ancho de la barra lateral (tablet horizontal). */
  anchoLateral: 104,
  /** Dónde empieza la primera pestaña de la barra lateral (además del margen del sistema). */
  arribaLateral: 18,
  /** Distancia entre pestañas de la barra lateral y tamaño de cada una (medidos en la app). */
  pasoItemLateral: 72,
  altoItemLateral: 60,
  xItemLateral: 12,
  anchoItemLateral: 80,
};

/**
 * Dónde está la pestaña `i` en la pantalla, para resaltarla.
 * `abajo` es el margen inferior que usa la barra (Math.max(insets.bottom, 6/8)).
 */
export function zonaPestana(i: number, ancho: number, alto: number, opciones: { barraLateral: boolean; abajo: number; arriba: number }): Rect {
  const margen = 4;
  if (opciones.barraLateral) {
    const y = opciones.arriba + BARRA.arribaLateral + i * BARRA.pasoItemLateral;
    return { x: BARRA.xItemLateral, y, ancho: BARRA.anchoItemLateral, alto: BARRA.altoItemLateral };
  }
  const anchoPestana = ancho / CANTIDAD_PESTANAS;
  const anchoZona = Math.min(anchoPestana - margen * 2, 110);
  const altoZona = BARRA.alto - BARRA.paddingArriba;
  return {
    x: anchoPestana * i + (anchoPestana - anchoZona) / 2,
    y: alto - opciones.abajo - altoZona,
    ancho: anchoZona,
    alto: altoZona,
  };
}

/**
 * Dónde va la ventanita: arriba de la pestaña resaltada (barra de abajo), a
 * su derecha (barra lateral) o en el centro. Devuelve la esquina superior
 * izquierda y el ancho; `alto` es una estimación para no salirse de la pantalla.
 * `flecha` es la posición de la flechita que apunta a la pestaña.
 */
export function posicionVentana(
  zona: Rect | null,
  ancho: number,
  alto: number,
  opciones: { barraLateral: boolean; altoVentana: number; arriba: number },
): { x: number; y: number; ancho: number; flecha: null | { lado: 'abajo' | 'izquierda'; desplazamiento: number } } {
  const margen = 16;
  const anchoVentana = Math.min(ancho - margen * 2, 400);
  if (!zona) {
    return { x: (ancho - anchoVentana) / 2, y: Math.max(opciones.arriba + margen, (alto - opciones.altoVentana) / 2), ancho: anchoVentana, flecha: null };
  }
  if (opciones.barraLateral) {
    const x = zona.x + zona.ancho + 18;
    const centro = zona.y + zona.alto / 2;
    const y = Math.min(Math.max(opciones.arriba + margen, centro - 40), alto - opciones.altoVentana - margen);
    const anchoLado = Math.min(anchoVentana, ancho - x - margen);
    return { x, y, ancho: anchoLado, flecha: { lado: 'izquierda', desplazamiento: centro - y } };
  }
  const centro = zona.x + zona.ancho / 2;
  const x = Math.min(Math.max(margen, centro - anchoVentana / 2), ancho - anchoVentana - margen);
  const y = Math.max(opciones.arriba + margen, zona.y - 14 - opciones.altoVentana);
  return { x, y, ancho: anchoVentana, flecha: { lado: 'abajo', desplazamiento: centro - x } };
}
