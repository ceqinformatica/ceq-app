import { Platform, StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Identidad visual del CEQ con el estilo de las apps de Apple: fondo gris
 * agrupado, fichas blancas sin bordes, títulos grandes en negro, el azul
 * del CEQ solo para lo que se toca (botones, enlaces, íconos) y separadores
 * finitos. Tipografía Inter con la escala de iOS. Sin verdes ni naranjas:
 * los estados se distinguen con tonos de azul y gris. Cambiar algo acá lo
 * cambia en toda la app.
 *
 * Hay dos temas (claro y oscuro). Cada color tiene dos usos:
 * - `colores.x` para texto, íconos y bordes (la "tinta").
 * - `fondos.x` para fondos y rellenos.
 * En el tema claro son idénticos; en el oscuro, por ejemplo, `colores.marino`
 * es un celeste legible sobre fondo oscuro y `fondos.marino` sigue siendo un
 * azul marino para botones y cabeceras con texto blanco.
 *
 * Los estilos se crean con `crearEstilos(() => ({ ... }))` (no con
 * StyleSheet.create) para que se recalculen al cambiar de tema.
 */
const claro = {
  // Marca
  marino: '#1B4B9B',        // color principal de la web: títulos, botones, íconos
  marinoOscuro: '#1F3F73',  // texto secundario fuerte
  marinoProfundo: '#123C88', // fondos de cabecera y carnet
  azul: '#2563C4',          // acentos y enlaces
  azulHover: '#1D55AE',
  cielo: '#DCE8F8',         // fondos destacados
  celeste: '#CFE0F6',
  celesteVivo: '#8DB8EE',   // detalles sobre fondo marino
  tarjeta: '#EAF1FA',       // relleno teñido de azul (íconos, avisos suaves)

  // Superficies y texto
  fondo: '#F3F7FC',         // fondo agrupado, apenas celeste
  fondoSuave: '#F7F7FA',
  superficieBlanca: '#FFFFFF',
  texto: '#0B0B0F',
  textoSuave: '#6C6C72',
  textoTenue: '#8E8E93',
  linea: '#D1D1D6',         // separadores
  lineaSuave: '#E5E5EA',
  blanco: '#FFFFFF',

  // Estados (semáforo de firma, avisos)
  verde: '#2563C4',
  verdeFondo: '#E3EDFB',
  amarillo: '#3F5168',
  amarilloFondo: '#E9EEF4',
  rojo: '#B23A3A',
  rojoFondo: '#FBE6E6',
  gris: '#6B7886',
  grisFondo: '#EEF2F5',

  // Alias usados por las pantallas
  primario: '#1B4B9B',
  primarioSuave: '#EAF1FA',
  superficie: '#EAF1FA',
  borde: '#D1D1D6',

  // Marino de marca que no cambia con el tema (texto sobre fondos blancos fijos: logo, QR, botón claro)
  marinoFijo: '#1B4B9B',

  // Celeste del CEQ: cabeceras y carnet (con texto blanco grande)
  celesteMarca: '#1E5BB0',

  // Franja superior de las pantallas (barra "Portal CEQ") y burbuja decorativa del título
  franja: '#C8DBF0',
  burbuja: '#E4EEF9',

  // Rellenos neutros al estilo iOS: pista de controles segmentados, chips, buscador
  relleno: '#E9E9EE',
  // Segmento elegido / superficie elevada
  seleccion: '#FFFFFF',
  // Barra de pestañas (material casi opaco)
  barra: 'rgba(249, 249, 251, 0.94)',

  // Pantallas de acceso (portada, iniciar sesión, crear cuenta): cabecera celeste claro y marcas de regla
  cabeceraAcceso: '#C6E3F7',
  regla: '#8FBAD7',
};

type Paleta = { [K in keyof typeof claro]: string };

/** Tinta del tema oscuro: textos claros, celestes para la marca. */
const tintaOscura: Paleta = {
  marino: '#9DBFF2',
  marinoOscuro: '#BDD3F4',
  marinoProfundo: '#D3E2F8',
  azul: '#86B0F0',
  azulHover: '#A0C1F3',
  cielo: '#D9EFFB',
  celeste: '#C6E6F8',
  celesteVivo: '#8FD0F3',
  tarjeta: '#15243A',

  fondo: '#000000',
  fondoSuave: '#0A0A0C',
  superficieBlanca: '#1C1C1E',
  texto: '#F5F5F7',
  textoSuave: '#A1A1A8',
  textoTenue: '#7C7C83',
  linea: '#38383A',
  lineaSuave: '#2C2C2E',
  blanco: '#FFFFFF',

  verde: '#86B0F0',
  verdeFondo: '#142846',
  amarillo: '#B7C3D2',
  amarilloFondo: '#1E2A37',
  rojo: '#F08A80',
  rojoFondo: '#3B1B19',
  gris: '#9AA8B5',
  grisFondo: '#2C2C2E',

  primario: '#9DBFF2',
  primarioSuave: '#15243A',
  superficie: '#15243A',
  borde: '#38383A',
  marinoFijo: '#1B4B9B',
  celesteMarca: '#8CCDF2',
  franja: '#000000',
  burbuja: '#16263F',
  relleno: '#2C2C2E',
  seleccion: '#5A5A5F',
  barra: 'rgba(22, 22, 24, 0.94)',
  cabeceraAcceso: '#1A2D52',
  regla: '#3A5A85',
};

/** Fondos del tema oscuro: el marino sigue siendo marino (botones, cabeceras). */
const fondoOscuro: Paleta = {
  ...tintaOscura,
  marino: '#24519E',
  marinoOscuro: '#1D4486',
  marinoProfundo: '#173A75',
  azul: '#2A62BE',
  azulHover: '#2556A8',
  cielo: '#1A2D52',
  celeste: '#203862',
  celesteVivo: '#3467B8',
  texto: '#E4E9F1',
  verde: '#2A62BE',
  amarillo: '#4A5A6E',
  rojo: '#B4453B',
  gris: '#4A5866',
  primario: '#24519E',
  celesteMarca: '#1A4A92',
};

export type Esquema = 'claro' | 'oscuro';
let esquema: Esquema = 'claro';

/** Tema con el que se están dibujando las pantallas. Lo fija TemaProvider. */
export function esquemaActual(): Esquema {
  return esquema;
}

/** Solo para TemaProvider (y pruebas): cambia el tema activo. */
export function fijarEsquema(e: Esquema) {
  esquema = e;
}

/** Objeto con un getter por color que devuelve el valor del tema activo. */
function vista(elegir: () => Paleta): Readonly<Paleta> {
  const o = {} as Paleta;
  for (const k of Object.keys(claro) as (keyof Paleta)[]) {
    Object.defineProperty(o, k, { enumerable: true, get: () => elegir()[k] });
  }
  return o;
}

/** Colores para texto, íconos y bordes. */
export const colores = vista(() => (esquema === 'oscuro' ? tintaOscura : claro));
/** Colores para fondos y rellenos. */
export const fondos = vista(() => (esquema === 'oscuro' ? fondoOscuro : claro));

/**
 * Como StyleSheet.create, pero los estilos se arman de nuevo (una vez por
 * tema) cuando cambia el tema. Uso: `const s = crearEstilos(() => ({ ... }))`.
 */
type Estilos = { [nombre: string]: ViewStyle | TextStyle | ImageStyle };

export function crearEstilos<T extends Estilos>(fabrica: () => T & Estilos): Readonly<T> {
  const cache: Partial<Record<Esquema, T>> = {};
  const actual = (): T => (cache[esquema] ??= StyleSheet.create(fabrica()));
  return new Proxy({} as T, {
    get: (_, k) => actual()[k as keyof T],
    has: (_, k) => k in actual(),
    ownKeys: () => Reflect.ownKeys(actual()),
    getOwnPropertyDescriptor: (_, k) => {
      const d = Reflect.getOwnPropertyDescriptor(actual(), k);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}


/** Familias de Inter cargadas en _layout.tsx (una por peso). */
export const fuentes = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

/**
 * Escala tipográfica con las proporciones de iOS (Large Title, Title,
 * Headline, Body, Footnote...). El espaciado entre letras depende del
 * tamaño: negativo en los títulos grandes y casi cero en el texto corrido.
 */
export const texto = {
  display: { fontFamily: fuentes.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.9 },
  titulo: { fontFamily: fuentes.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.45 },
  subtitulo: { fontFamily: fuentes.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  cuerpo: { fontFamily: fuentes.regular, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  cuerpoFuerte: { fontFamily: fuentes.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.25 },
  chico: { fontFamily: fuentes.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.05 },
  etiqueta: { fontFamily: fuentes.medium, fontSize: 12.5, lineHeight: 16, letterSpacing: 0.1, textTransform: 'uppercase' as const },
  numero: { fontFamily: fuentes.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
};

export const espacio = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radio = { s: 8, m: 12, l: 14, xl: 20, pill: 9999 };

/** Sombras neutras y muy suaves, como en iOS (en las listas agrupadas casi no se ven). */
function sombra(altura: number, opacidad: number, desenfoque: number, elevacion: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: elevacion, shadowColor: '#000000' },
    web: { boxShadow: `0px ${altura}px ${desenfoque}px rgba(0, 0, 0, ${opacidad})` } as ViewStyle,
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: altura },
      shadowOpacity: opacidad,
      shadowRadius: desenfoque / 2,
    },
  })!;
}

export const sombras = {
  suave: sombra(1, 0.04, 6, 1),
  media: sombra(6, 0.08, 24, 4),
  fuerte: sombra(14, 0.16, 40, 10),
};

const oscuro = () => esquema === 'oscuro';

/** Colores por estado de materia en la malla (se leen con el tema activo). */
export const coloresEstado = {
  aprobada: { get fondo() { return oscuro() ? '#173560' : '#E1ECFB'; }, get borde() { return oscuro() ? '#2E5A99' : '#A9C6EF'; }, get texto() { return oscuro() ? '#A8C8F5' : '#1B4B9B'; }, nombre: 'Aprobada', icono: 'checkmark-circle' },
  firmada: { get fondo() { return fondos.superficieBlanca; }, get borde() { return oscuro() ? '#4F84D2' : '#3B78D6'; }, get texto() { return oscuro() ? '#9DBFF2' : '#2563C4'; }, nombre: 'Firmada', icono: 'create' },
  cursando: { get fondo() { return oscuro() ? '#1A2436' : '#EEF2F7'; }, get borde() { return oscuro() ? '#8C9BAA' : '#3F5168'; }, get texto() { return oscuro() ? '#C9D3DC' : '#2E3F52'; }, nombre: 'Cursando', icono: 'time' },
  pendiente: { get fondo() { return fondos.superficieBlanca; }, get borde() { return colores.linea; }, get texto() { return colores.marino; }, nombre: 'Pendiente', icono: 'ellipse-outline' },
  bloqueada: { get fondo() { return fondos.grisFondo; }, get borde() { return oscuro() ? '#2A3642' : '#D5DEE5'; }, get texto() { return colores.gris; }, nombre: 'Bloqueada', icono: 'lock-closed' },
} as const;

/** Colores del semáforo de firma (se leen con el tema activo). */
export const coloresSemaforo = {
  verde: { get fondo() { return fondos.verdeFondo; }, get texto() { return colores.verde; }, nombre: 'Vas bien' },
  amarillo: { get fondo() { return fondos.amarilloFondo; }, get texto() { return colores.amarillo; }, nombre: 'En riesgo' },
  rojo: { get fondo() { return fondos.rojoFondo; }, get texto() { return colores.rojo; }, nombre: 'No alcanza' },
  sin_datos: { get fondo() { return fondos.grisFondo; }, get texto() { return colores.gris; }, nombre: 'Sin datos' },
} as const;
