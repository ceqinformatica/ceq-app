import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esErrorDeRed, lanzar, SIN_CONEXION, textoError } from '../errores.ts';

test('los fallos de red se muestran como sin conexión', () => {
  assert.equal(textoError(new Error('TypeError: Network request failed')), SIN_CONEXION);
  assert.equal(textoError({ message: 'TypeError: Failed to fetch' }), SIN_CONEXION);
  assert.equal(esErrorDeRed(new Error('Load failed')), true);
  assert.equal(esErrorDeRed(new Error('Tu carnet está vencido.')), false);
});

test('los errores técnicos en inglés se traducen', () => {
  assert.match(textoError({ message: 'new row violates row-level security policy for table "eventos"' }), /permiso/);
  assert.match(textoError({ message: 'JWT expired' }), /sesión venció/);
  assert.equal(textoError({ message: 'duplicate key value violates unique constraint "x"' }), 'Eso ya estaba cargado.');
});

test('los mensajes propios en castellano quedan igual', () => {
  assert.equal(textoError(new Error('Ese código no es de un carnet del CEQ.')), 'Ese código no es de un carnet del CEQ.');
  assert.equal(textoError(null, 'Por defecto'), 'Por defecto');
  assert.equal(textoError(42), 'Algo salió mal. Probá de nuevo.');
});

test('lanzar no hace nada sin error y lanza el texto claro con error', () => {
  lanzar(null);
  assert.throws(() => lanzar({ message: 'TypeError: Network request failed' }), { message: SIN_CONEXION });
});
