/**
 * Identidad visual del CEQ, tomada de la página web (ceq-una.com) y del
 * sistema de reservas: tipografía Inter, azul marino #173874 y celestes.
 * Cambiar algo acá lo cambia en toda la app.
 */
export const colores = {
  marino: '#173874',        // títulos, botones principales, íconos (web: color principal)
  marinoOscuro: '#1F3B68',  // texto secundario fuerte
  azul: '#3873CE',          // acentos y enlaces
  azulHover: '#2D62B5',
  cielo: '#D6E6FA',         // fondos destacados
  celeste: '#CBE2FA',
  tarjeta: '#EFF7FE',       // fondo de tarjetas (igual que la web)
  fondo: '#FFFFFF',
  fondoSuave: '#F5FAFF',
  texto: '#1E1E1E',
  textoSuave: '#5A6B85',
  linea: '#C9DBF3',
  blanco: '#FFFFFF',
  verde: '#1D7A47',
  verdeFondo: '#E3F4EA',
  amarillo: '#A86A00',
  amarilloFondo: '#FFF3D6',
  rojo: '#B2392F',
  rojoFondo: '#FBE3E1',
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

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radio = { s: 8, m: 10, l: 16, pill: 9999 };
