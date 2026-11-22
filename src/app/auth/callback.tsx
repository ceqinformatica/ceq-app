import { Redirect } from 'expo-router';

// Google vuelve a ceqapp://auth/callback. El canje del código lo hace
// entrarConGoogle(); esta ruta solo evita la pantalla de "no encontrado".
export default function Callback() {
  return <Redirect href="/" />;
}
