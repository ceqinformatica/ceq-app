import { Stack } from 'expo-router';
import { colores, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

export default function AdminLayout() {
  useTema();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: fondos.fondo }, animation: 'slide_from_right' }} />;
}
