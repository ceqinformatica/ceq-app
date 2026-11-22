import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { almacenSeguro } from './almacenSeguro';
import type { Database } from './tipos-db';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const claveAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && claveAnon);

// Si faltan las variables, la app muestra un aviso en vez de cerrarse.
export const supabase = createClient<Database>(url || 'https://sin-configurar.supabase.co', claveAnon || 'sin-configurar', {
  auth: {
    storage: almacenSeguro,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Refresca el token solo con la app en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
