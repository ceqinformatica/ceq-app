import { Stack } from 'expo-router';
import { colores } from '../../tema';

export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colores.fondo }, animation: 'slide_from_right' }} />;
}
