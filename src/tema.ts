import { Platform, type ViewStyle } from 'react-native';

/**
 * Identidad visual del CEQ, tomada de la página web (ceq-una.com) y del
 * sistema de reservas: tipografía Inter, azul marino #173874, celestes y el
 * hexágono del logo. Cambiar algo acá lo cambia en toda la app.
 */
export const colores = {
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
};

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
    android: { elevation: elevacion, shadowColor: colores.marinoProfundo },
    web: { boxShadow: `0px ${altura}px ${desenfoque}px rgba(14, 37, 82, ${opacidad})` } as ViewStyle,
    default: {
      shadowColor: colores.marinoProfundo,
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

/** Colores por estado de materia en la malla. */
export const coloresEstado = {
  aprobada: { fondo: colores.verdeFondo, borde: '#9FD3B4', texto: colores.verde, nombre: 'Aprobada', icono: 'checkmark-circle' },
  firmada: { fondo: colores.cielo, borde: '#8DB6EA', texto: colores.azulHover, nombre: 'Firmada', icono: 'create' },
  cursando: { fondo: colores.amarilloFondo, borde: '#F0CF86', texto: colores.amarillo, nombre: 'Cursando', icono: 'time' },
  pendiente: { fondo: colores.superficieBlanca, borde: colores.linea, texto: colores.marino, nombre: 'Por cursar', icono: 'ellipse-outline' },
  bloqueada: { fondo: colores.grisFondo, borde: '#D7DDE6', texto: colores.gris, nombre: 'Bloqueada', icono: 'lock-closed' },
} as const;

/** Colores del semáforo de firma. */
export const coloresSemaforo = {
  verde: { fondo: colores.verdeFondo, texto: colores.verde, nombre: 'Vas bien' },
  amarillo: { fondo: colores.amarilloFondo, texto: colores.amarillo, nombre: 'En riesgo' },
  rojo: { fondo: colores.rojoFondo, texto: colores.rojo, nombre: 'No alcanza' },
  sin_datos: { fondo: colores.grisFondo, texto: colores.gris, nombre: 'Sin datos' },
} as const;
