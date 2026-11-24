import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

/**
 * En la versión web no se arma la imagen (haría falta otra librería solo
 * para el navegador): la pantalla muestra la vista previa y avisa que se
 * comparte desde la app.
 */
export const puedeCompartirImagen = false;

export async function compartirVistaComoImagen(_ref: RefObject<ComponentRef<typeof View> | null>, _titulo: string, _tamano?: { width: number; height: number }): Promise<void> {
  throw new Error('Para compartir la imagen, abrí tu horario desde la app del teléfono.');
}
