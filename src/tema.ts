import { Platform, StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Identidad visual del CEQ, tomada de la página web (ceq-una.com) y del
 * sistema de reservas: tipografía Inter, azul marino #173874, celestes y el
 * hexágono del logo. Cambiar algo acá lo cambia en toda la app.
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
  marino: '#173874',        // color principal de la web: títulos, botones, íconos
  marinoOscuro: '#1F3B68',  // texto secundario fuerte
  marinoProfundo: '#0E2552', // fondos de cabecera y carnet
  azul: '#3873CE',          // acentos y enlaces
  azulHover: '#2D62B5',
  cielo: '#D6E6FA',         // fondos destacados
  celeste: '#CBE2FA',
  celesteVivo: '#7FB2F0',   // detalles sobre fondo marino
  tarjeta: '#EFF7FE',       // fondo de tarjetas (igual que la web)

  // Superficies y texto
  fondo: '#F5F8FC',
  fondoSuave: '#F5FAFF',
  superficieBlanca: '#FFFFFF',
  texto: '#1E1E1E',
  textoSuave: '#5A6B85',
  textoTenue: '#8A97AB',
  linea: '#C9DBF3',
  lineaSuave: '#E3ECF7',
  blanco: '#FFFFFF',

  // Estados (semáforo de firma, avisos)
  verde: '#1D7A47',
  verdeFondo: '#E3F4EA',
  amarillo: '#A86A00',
  amarilloFondo: '#FFF3D6',
  rojo: '#B2392F',
  rojoFondo: '#FBE3E1',
  gris: '#6B778A',
  grisFondo: '#EEF1F5',

  // Alias usados por las pantallas
  primario: '#173874',
  primarioSuave: '#EFF7FE',
  superficie: '#EFF7FE',
  borde: '#C9DBF3',

  // Marino de marca que no cambia con el tema (texto sobre fondos blancos fijos: logo, QR, botón claro)
  marinoFijo: '#173874',
};

type Paleta = { [K in keyof typeof claro]: string };

/** Tinta del tema oscuro: textos claros, celestes para la marca. */
const tintaOscura: Paleta = {
  marino: '#A9C7F2',
  marinoOscuro: '#C2D5EF',
  marinoProfundo: '#D3E2F7',
  azul: '#7DAEF0',
  azulHover: '#94BCF3',
  cielo: '#D6E6FA',
  celeste: '#CBE2FA',
  celesteVivo: '#7FB2F0',
  tarjeta: '#18243A',

  fondo: '#0B1220',
  fondoSuave: '#0E1627',
  superficieBlanca: '#131D30',
  texto: '#E4E9F1',
  textoSuave: '#A2B0C5',
  textoTenue: '#7A889E',
  linea: '#2A3A55',
  lineaSuave: '#1E2B42',
  blanco: '#FFFFFF',

  verde: '#63CB8F',
  verdeFondo: '#12301F',
  amarillo: '#EDBA55',
  amarilloFondo: '#33270C',
  rojo: '#F08A80',
  rojoFondo: '#3B1B19',
  gris: '#9AA5B6',
  grisFondo: '#1C2535',

  primario: '#A9C7F2',
  primarioSuave: '#18243A',
  superficie: '#18243A',
  borde: '#2A3A55',
  marinoFijo: '#173874',
};

/** Fondos del tema oscuro: el marino sigue siendo marino (botones, cabeceras). */
const fondoOscuro: Paleta = {
  ...tintaOscura,
  marino: '#21468A',
  marinoOscuro: '#1B3A70',
  marinoProfundo: '#132D5E',
  azul: '#2F64B8',
  azulHover: '#2A579F',
  cielo: '#1D3357',
  celeste: '#22406D',
  celesteVivo: '#3B6FB3',
  texto: '#E4E9F1',
  verde: '#2E8A57',
  amarillo: '#B07A12',
  rojo: '#B4453B',
  gris: '#4A5568',
  primario: '#21468A',
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

/** Sombras suaves teñidas de marino (iOS/web) y elevación (Android). */
function sombra(altura: number, opacidad: number, desenfoque: number, elevacion: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: elevacion, shadowColor: '#0E2552' },
    web: { boxShadow: `0px ${altura}px ${desenfoque}px rgba(14, 37, 82, ${opacidad})` } as ViewStyle,
    default: {
      shadowColor: '#0E2552',
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
  aprobada: { get fondo() { return fondos.verdeFondo; }, get borde() { return oscuro() ? '#2F6B4A' : '#9FD3B4'; }, get texto() { return colores.verde; }, nombre: 'Aprobada', icono: 'checkmark-circle' },
  firmada: { get fondo() { return fondos.cielo; }, get borde() { return oscuro() ? '#3B5F93' : '#8DB6EA'; }, get texto() { return oscuro() ? colores.azulHover : '#2D62B5'; }, nombre: 'Firmada', icono: 'create' },
  cursando: { get fondo() { return fondos.amarilloFondo; }, get borde() { return oscuro() ? '#6B5418' : '#F0CF86'; }, get texto() { return colores.amarillo; }, nombre: 'Cursando', icono: 'time' },
  pendiente: { get fondo() { return fondos.superficieBlanca; }, get borde() { return colores.linea; }, get texto() { return colores.marino; }, nombre: 'Por cursar', icono: 'ellipse-outline' },
  bloqueada: { get fondo() { return fondos.grisFondo; }, get borde() { return oscuro() ? '#2E3848' : '#D7DDE6'; }, get texto() { return colores.gris; }, nombre: 'Bloqueada', icono: 'lock-closed' },
} as const;

/** Colores del semáforo de firma (se leen con el tema activo). */
export const coloresSemaforo = {
  verde: { get fondo() { return fondos.verdeFondo; }, get texto() { return colores.verde; }, nombre: 'Vas bien' },
  amarillo: { get fondo() { return fondos.amarilloFondo; }, get texto() { return colores.amarillo; }, nombre: 'En riesgo' },
  rojo: { get fondo() { return fondos.rojoFondo; }, get texto() { return colores.rojo; }, nombre: 'No alcanza' },
  sin_datos: { get fondo() { return fondos.grisFondo; }, get texto() { return colores.gris; }, nombre: 'Sin datos' },
} as const;
