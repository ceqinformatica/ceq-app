import { Image, View } from 'react-native';
import { esquemaActual } from '../tema';
import { logoCeq } from './ui';

/** Logo del CEQ para acceso y bloqueo; en el tema oscuro va sobre un círculo blanco para que se vea. */
export function LogoAcceso({ tamano }: { tamano: number }) {
  const logo = <Image source={logoCeq} style={{ width: tamano, height: tamano }} accessibilityLabel="Logo del CEQ" />;
  if (esquemaActual() !== 'oscuro') return logo;
  const lado = Math.round(tamano * 1.3);
  return <View style={{ width: lado, height: lado, borderRadius: lado / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{logo}</View>;
}
