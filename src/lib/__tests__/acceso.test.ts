import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modoInicial, resultadoRegistro } from '../acceso.ts';

test('la primera vez se ve Crear cuenta', () => {
  assert.equal(modoInicial(null), 'registro');
  assert.equal(modoInicial(undefined), 'registro');
  assert.equal(modoInicial(''), 'registro');
});

test('si ya se entró en este celular, se ve Iniciar sesión', () => {
  assert.equal(modoInicial('1'), 'entrar');
});

test('cuenta creada con sesión: entra directo', () => {
  assert.equal(resultadoRegistro({ session: { access_token: 'x' }, user: { identities: [{}] } }), 'adentro');
});

test('cuenta creada sin sesión: hay que confirmar el correo', () => {
  assert.equal(resultadoRegistro({ session: null, user: { identities: [{ provider: 'email' }] } }), 'confirmar');
  assert.equal(resultadoRegistro({ session: null, user: null }), 'confirmar');
});

test('correo que ya tenía cuenta (Supabase lo disimula sin identidades)', () => {
  assert.equal(resultadoRegistro({ session: null, user: { identities: [] } }), 'ya-existe');
});
