// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'shots/*', 'android/*', 'ios/*', '.expo/*'],
  },
  {
    rules: {
      // Reglas pensadas para el React Compiler (la app no lo usa): quedan como aviso.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Los textos en castellano llevan comillas en el JSX a propósito.
      'react/no-unescaped-entities': 'off',
      // Falso positivo con los enums que expo-notifications exporta en tiempo de ejecución.
      'import/namespace': 'off',
    },
  },
  {
    // usarDatos es un hook con nombre en castellano ("usar" en vez de "use").
    files: ['src/datos/usarDatos.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]);
