import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** En el teléfono se puede sacar la foto de una vista y compartirla. */
export const puedeCompartirImagen = true;

/**
 * Saca una imagen PNG de la vista (que tiene que tener collapsable={false})
 * y abre el menú de compartir del teléfono (WhatsApp, Instagram, Galería…).
 */
export async function compartirVistaComoImagen(ref: RefObject<ComponentRef<typeof View> | null>, titulo: string): Promise<void> {
  if (!ref.current) throw new Error('No se pudo armar la imagen. Probá de nuevo.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Tu teléfono no permite compartir desde la app.');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: titulo });
}
