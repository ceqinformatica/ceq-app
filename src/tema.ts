import { Platform, StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Identidad visual del CEQ: el celeste del centro de estudiantes, con un
 * celeste profundo para textos y botones (los nombres `marino*` se
 * mantienen por compatibilidad) y tipografía Inter. Sin verdes ni naranjas:
 * los estados se distinguen con tonos de celeste y gris. Cambiar algo acá lo cambia en toda la app.
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
  marino: '#0F5F94',        // color principal de la web: títulos, botones, íconos
  marinoOscuro: '#1E4A66',  // texto secundario fuerte
  marinoProfundo: '#0E4A73', // fondos de cabecera y carnet
  azul: '#1677B0',          // acentos y enlaces
  azulHover: '#0F6FA8',
  cielo: '#D9EFFB',         // fondos destacados
  celeste: '#C6E6F8',
  celesteVivo: '#8FD0F3',   // detalles sobre fondo marino
  tarjeta: '#EEF7FC',       // fondo de tarjetas (igual que la web)

  // Superficies y texto
  fondo: '#F5F9FB',
  fondoSuave: '#F3F9FD',
  superficieBlanca: '#FFFFFF',
  texto: '#18232D',
  textoSuave: '#55687A',
  textoTenue: '#8797A6',
  linea: '#D3E5F0',
  lineaSuave: '#E6F0F6',
  blanco: '#FFFFFF',

  // Estados (semáforo de firma, avisos)
  verde: '#1677B0',
  verdeFondo: '#E1F2FC',
  amarillo: '#3F5168',
  amarilloFondo: '#E9EEF4',
  rojo: '#B23A3A',
  rojoFondo: '#FBE6E6',
  gris: '#6B7886',
  grisFondo: '#EEF2F5',

  // Alias usados por las pantallas
  primario: '#0F5F94',
  primarioSuave: '#EEF7FC',
  superficie: '#EEF7FC',
  borde: '#D3E5F0',

  // Marino de marca que no cambia con el tema (texto sobre fondos blancos fijos: logo, QR, botón claro)
  marinoFijo: '#0F5F94',

  // Celeste claro del CEQ: cabeceras, carnet, login (con texto oscuro encima)
  celesteMarca: '#CFEAFA',
  sobreCeleste: '#0C3A57',
  sobreCelesteSuave: '#2C5D7C',
};

type Paleta = { [K in keyof typeof claro]: string };

/** Tinta del tema oscuro: textos claros, celestes para la marca. */
const tintaOscura: Paleta = {
  marino: '#8CCDF2',
  marinoOscuro: '#B5DDF4',
  marinoProfundo: '#CDE8F8',
  azul: '#7CC4EE',
  azulHover: '#98D2F2',
  cielo: '#D9EFFB',
  celeste: '#C6E6F8',
  celesteVivo: '#8FD0F3',
  tarjeta: '#15242F',

  fondo: '#0B141B',
  fondoSuave: '#0E1821',
  superficieBlanca: '#121E28',
  texto: '#E3ECF2',
  textoSuave: '#A1B2C0',
  textoTenue: '#748696',
  linea: '#24394A',
  lineaSuave: '#1B2C39',
  blanco: '#FFFFFF',

  verde: '#7CC4EE',
  verdeFondo: '#11283A',
  amarillo: '#B7C3D2',
  amarilloFondo: '#1E2A37',
  rojo: '#F08A80',
  rojoFondo: '#3B1B19',
  gris: '#9AA8B5',
  grisFondo: '#18232D',

  primario: '#8CCDF2',
  primarioSuave: '#15242F',
  superficie: '#15242F',
  borde: '#24394A',
  marinoFijo: '#0F5F94',
  celesteMarca: '#8CCDF2',
  sobreCeleste: '#FFFFFF',
  sobreCelesteSuave: '#E3F2FB',
};

/** Fondos del tema claro: botones y bloques en un celeste algo más claro que el texto. */
const fondoClaro: Paleta = { ...claro, marino: '#1677B0', primario: '#1677B0' };

/** Fondos del tema oscuro: el marino sigue siendo marino (botones, cabeceras). */
const fondoOscuro: Paleta = {
  ...tintaOscura,
  marino: '#1B6A9C',
  marinoOscuro: '#175B86',
  marinoProfundo: '#124B70',
  azul: '#1E74A8',
  azulHover: '#1A6797',
  cielo: '#173A52',
  celeste: '#1D4A68',
  celesteVivo: '#2E7FB0',
  texto: '#E4E9F1',
  verde: '#1E74A8',
  amarillo: '#4A5A6E',
  rojo: '#B4453B',
  gris: '#4A5866',
  primario: '#1B6A9C',
  celesteMarca: '#1A6A9A',
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
export const fondos = vista(() => (esquema === 'oscuro' ? fondoOscuro : fondoClaro));

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

/** Escala tipográfica. Los títulos van en mayúsculas, como en la web. */
export const texto = {
  display: { fontFamily: fuentes.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  titulo: { fontFamily: fuentes.semibold, fontSize: 22, lineHeight: 28, letterSpacing: 0.2 },
  subtitulo: { fontFamily: fuentes.semibold, fontSize: 17, lineHeight: 23 },
  cuerpo: { fontFamily: fuentes.regular, fontSize: 15, lineHeight: 22 },
  cuerpoFuerte: { fontFamily: fuentes.semibold, fontSize: 15, lineHeight: 22 },
  chico: { fontFamily: fuentes.regular, fontSize: 13, lineHeight: 18 },
  etiqueta: { fontFamily: fuentes.semibold, fontSize: 11.5, lineHeight: 15, letterSpacing: 0.9, textTransform: 'uppercase' as const },
  numero: { fontFamily: fuentes.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
};

export const espacio = { xxs: 2, xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radio = { s: 8, m: 12, l: 16, xl: 22, pill: 9999 };

/** Sombras suaves teñidas de celeste profundo (iOS/web) y elevación (Android). */
function sombra(altura: number, opacidad: number, desenfoque: number, elevacion: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: elevacion, shadowColor: '#0E3A55' },
    web: { boxShadow: `0px ${altura}px ${desenfoque}px rgba(14, 58, 85, ${opacidad})` } as ViewStyle,
    default: {
      shadowColor: '#0E3A55',
      shadowOffset: { width: 0, height: altura },
      shadowOpacity: opacidad,
      shadowRadius: desenfoque / 2,
    },
  })!;
}

export const sombras = {
  suave: sombra(2, 0.06, 10, 2),
  media: sombra(6, 0.1, 20, 5),
  fuerte: sombra(12, 0.18, 32, 10),
};

const oscuro = () => esquema === 'oscuro';

/** Colores por estado de materia en la malla (se leen con el tema activo). */
export const coloresEstado = {
  aprobada: { get fondo() { return oscuro() ? '#173F5A' : '#CFEAF9'; }, get borde() { return oscuro() ? '#2E6E96' : '#86C6EC'; }, get texto() { return oscuro() ? '#9AD5F5' : '#0F5F94'; }, nombre: 'Aprobada', icono: 'checkmark-circle' },
  firmada: { get fondo() { return fondos.superficieBlanca; }, get borde() { return oscuro() ? '#4A9DD0' : '#2A8FCC'; }, get texto() { return oscuro() ? '#8CCDF2' : '#1677B0'; }, nombre: 'Firmada', icono: 'create' },
  cursando: { get fondo() { return oscuro() ? '#1A2631' : '#EEF2F6'; }, get borde() { return oscuro() ? '#8C9BAA' : '#3F5168'; }, get texto() { return oscuro() ? '#C9D3DC' : '#2E3F52'; }, nombre: 'Cursando', icono: 'time' },
  pendiente: { get fondo() { return fondos.superficieBlanca; }, get borde() { return colores.linea; }, get texto() { return colores.marino; }, nombre: 'Por cursar', icono: 'ellipse-outline' },
  bloqueada: { get fondo() { return fondos.grisFondo; }, get borde() { return oscuro() ? '#2A3642' : '#D5DEE5'; }, get texto() { return colores.gris; }, nombre: 'Bloqueada', icono: 'lock-closed' },
} as const;

/** Colores del semáforo de firma (se leen con el tema activo). */
export const coloresSemaforo = {
  verde: { get fondo() { return fondos.verdeFondo; }, get texto() { return colores.verde; }, nombre: 'Vas bien' },
  amarillo: { get fondo() { return fondos.amarilloFondo; }, get texto() { return colores.amarillo; }, nombre: 'En riesgo' },
  rojo: { get fondo() { return fondos.rojoFondo; }, get texto() { return colores.rojo; }, nombre: 'No alcanza' },
  sin_datos: { get fondo() { return fondos.grisFondo; }, get texto() { return colores.gris; }, nombre: 'Sin datos' },
} as const;
