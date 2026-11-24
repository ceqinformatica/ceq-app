import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoValido, resultadoGoogle, metodosDeCuenta, problemaClaveNueva, traducirErrorClave } from '../recuperacion.ts';

test('cuenta de Google sola: confirma con Google, no con contraseña', () => {
  const m = metodosDeCuenta({ email: 'a@gmail.com', app_metadata: { provider: 'google', providers: ['google'] } });
  assert.deepEqual(m, { google: true, clave: false, correo: 'a@gmail.com' });
});

test('cuenta con correo y contraseña', () => {
  const m = metodosDeCuenta({ email: 'b@ejemplo.com', app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }] });
  assert.deepEqual(m, { google: false, clave: true, correo: 'b@ejemplo.com' });
});

test('cuenta con las dos formas de entrar', () => {
  const m = metodosDeCuenta({ email: 'c@ejemplo.com', app_metadata: { provider: 'email', providers: ['email', 'google'] } });
  assert.equal(m.google, true);
  assert.equal(m.clave, true);
});

test('sin correo no se puede confirmar con contraseña', () => {
  assert.equal(metodosDeCuenta({ email: '', app_metadata: { provider: 'email' } }).clave, false);
  assert.deepEqual(metodosDeCuenta(null), { google: false, clave: false, correo: null });
});

test('valida la contraseña nueva', () => {
  assert.match(problemaClaveNueva('abc', 'abc')!, /al menos 6/);
  assert.match(problemaClaveNueva('      ', '      ')!, /espacios/);
  assert.match(problemaClaveNueva('clave123', 'clave124')!, /no coinciden/);
  assert.equal(problemaClaveNueva('clave123', 'clave123'), null);
});

test('reconoce correos', () => {
  assert.equal(correoValido(' nombre@ejemplo.com '), true);
  assert.equal(correoValido('nombre@ejemplo'), false);
  assert.equal(correoValido('sin arroba.com'), false);
});

test('traduce los errores de Supabase', () => {
  assert.match(traducirErrorClave('PKCE code verifier not found in storage.'), /otro dispositivo/);
  assert.match(traducirErrorClave('Email link is invalid or has expired'), /venció/);
  assert.match(traducirErrorClave('New password should be different from the old password.'), /distinta/);
  assert.match(traducirErrorClave('Password should be at least 6 characters.'), /débil/);
  assert.match(traducirErrorClave('For security purposes, you can only request this after 42 seconds.'), /Esperá/);
  assert.match(traducirErrorClave('email rate limit exceeded'), /Esperá/);
  assert.match(traducirErrorClave('Auth session missing!'), /sesión se cerró/);
  assert.match(traducirErrorClave('Invalid login credentials'), /no es correcta/);
  assert.match(traducirErrorClave('TypeError: Failed to fetch'), /conexión/);
  assert.match(traducirErrorClave(null), /Probá de nuevo/);
});

test('confirmar con Google exige la misma cuenta', () => {
  const ses = (id: string, t: string) => ({ access_token: t, user: { id } });
  assert.equal(resultadoGoogle('u1', 't0', 'SIGNED_IN', ses('u1', 't1')), 'misma');
  assert.equal(resultadoGoogle('u1', 't0', 'SIGNED_IN', ses('u2', 't1')), 'otra');
  assert.equal(resultadoGoogle(null, null, 'SIGNED_IN', ses('u2', 't1')), 'otra');
  assert.equal(resultadoGoogle('u1', 't0', 'SIGNED_IN', ses('u1', 't0')), null);
  assert.equal(resultadoGoogle('u1', 't0', 'TOKEN_REFRESHED', ses('u1', 't1')), null);
  assert.equal(resultadoGoogle('u1', 't0', 'SIGNED_IN', null), null);
});
