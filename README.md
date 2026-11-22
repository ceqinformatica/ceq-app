# App CEQ

App del Centro de Estudiantes de la FCQ para la vida académica: malla con
prerrequisitos, calculadora de firma, progreso de carrera, agenda y módulos del
CEQ. Es un proyecto independiente: no se conecta con los sistemas de reservas
ni de guardias.

- **App:** Expo (React Native) con TypeScript y Expo Router.
- **Servidor:** un proyecto propio de Supabase (base de datos, login, archivos y funciones).
- **Arquitectura completa:** ver el documento "Arquitectura app CEQ".

## Estado

Etapa 1 (base): login con Google o correo, desbloqueo con huella o rostro,
perfil con carrera y plan, esquema completo de la base con seguridad por fila, y
el cálculo de firma y de progreso con pruebas. Las pestañas Mi carrera, Firma,
Agenda y CEQ muestran lo que viene en las próximas etapas.

## Estructura

```
src/app/          pantallas (Expo Router)
  (tabs)/         Inicio, Mi carrera, Firma, Agenda, CEQ
  login.tsx       entrar con Google o correo
  onboarding.tsx  elegir carrera y plan la primera vez
  perfil.tsx      datos, cambiar carrera, huella, cerrar sesión
src/components/   sistema de diseño (ui, gráficos, carnet, malla) y bloqueo
src/datos/        lectura y escritura en Supabase para las pantallas, y modo demo
src/context/      sesión, perfil y bloqueo biométrico
src/lib/          Supabase, login, biometría, cálculo de firma y progreso
supabase/migrations/  tablas, seguridad por fila y funciones
```

## Puesta en marcha

### 1. Supabase (proyecto nuevo, separado de reservas)

1. Crear un proyecto en [supabase.com](https://supabase.com) llamado `ceq-app`.
2. En **SQL Editor**, pegar y ejecutar, en orden, los archivos de `supabase/migrations/`:
   `20261122000000_esquema_inicial.sql` y después `20261122010000_ajustes_seguridad.sql`.
   El segundo se puede volver a ejecutar sin problema.
3. Copiar `.env.example` a `.env` y completar la URL y la clave `anon` (Project Settings > API).
4. Después de entrar por primera vez a la app, nombrarse admin desde el SQL Editor:
   ```sql
   update perfiles set rol = 'admin' where id = (select id from auth.users where email = 'tu-correo@gmail.com');
   ```

### 2. Entrar con Google

1. En [Google Cloud Console](https://console.cloud.google.com), crear un proyecto del CEQ.
2. Configurar la pantalla de consentimiento (tipo externo, nombre "CEQ").
3. Crear credenciales **ID de cliente de OAuth** de tipo **Aplicación web**.
   En "URI de redireccionamiento autorizados" poner la que muestra Supabase en
   Authentication > Sign In / Providers > Google (termina en `/auth/v1/callback`).
4. En Supabase, activar el proveedor Google y pegar el ID y el secreto del cliente.
5. En Supabase, Authentication > URL Configuration > Redirect URLs, agregar:
   - `ceqapp://auth/callback` (la app instalada)
   - `exp://**` (solo para probar con Expo en desarrollo; sacarla antes de
     repartir la app a todos los estudiantes)

### Ver la interfaz sin Supabase (modo demostración)

```bash
EXPO_PUBLIC_DEMO=1 npx expo start
```

Arranca con una sesión y datos de ejemplo guardados en memoria (malla, firma,
agenda, carnet y avisos inventados) para revisar el diseño. Nunca se usa en
las compilaciones de EAS.

### 3. Correr la app

```bash
npm install
npm start          # abre Expo; escanear el QR con un build de desarrollo
npm test           # pruebas del cálculo de firma y progreso
npm run typecheck  # revisión de tipos
```

Cada PR corre además el workflow **Verificar** en GitHub: tipos, pruebas de
la lógica y pruebas de seguridad de la base (`supabase/tests/politicas.sql`),
que arma la base desde cero en un Postgres temporal y comprueba que ningún
estudiante pueda ver ni cambiar datos de otro.

La huella y Google necesitan un build de desarrollo (no Expo Go):

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```

### 4. Generar el APK para repartir

```bash
npx eas-cli@latest build --profile preview --platform android
```

EAS devuelve un enlace para descargar el APK. Para Play Store se usa
`--profile production` (genera un .aab).

## Estilo visual

La app usa la identidad de la página web del CEQ: tipografía **Inter**, azul
marino `#173874` para títulos, botones e íconos, tarjetas celestes `#EFF7FE`,
títulos en mayúsculas y el logo hexagonal. Todo está centralizado en
`src/tema.ts`. Los íconos son Ionicons de línea, en marino.

El logo disponible es de 192 px; para el ícono de la app conviene reemplazar
`assets/logo-ceq.png` por una versión de al menos 1024 px.

## Reglas de firma

El cálculo vive en `src/lib/firma.ts` y lee los mínimos de la tabla
`reglas_firma` (una regla general por plan y excepciones por materia). Los
valores por defecto (60 % teoría, 75 % asistencia) son provisorios hasta
tener las reglas reales de la FCQ.
