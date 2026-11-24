import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modoInicial, problemaRegistro, proveedoresVisibles, resultadoRegistro } from '../acceso.ts';

test('la primera vez se ve la portada', () => {
  assert.equal(modoInicial(null), 'portada');
  assert.equal(modoInicial(undefined), 'portada');
  assert.equal(modoInicial(''), 'portada');
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

test('Microsoft aparece solo cuando está habilitado en Supabase', () => {
  assert.deepEqual(proveedoresVisibles({ external: { google: true, azure: true } }), ['google', 'microsoft']);
  assert.deepEqual(proveedoresVisibles({ external: { google: true, azure: false } }), ['google']);
  assert.deepEqual(proveedoresVisibles(null), ['google']);
});

test('valida los datos de Creá tu cuenta', () => {
  const ok = { nombre: 'Ana', apellido: 'Pérez', correoOk: true, clave: 'clave123', repetida: 'clave123' };
  assert.equal(problemaRegistro(ok, 6), null);
  assert.match(problemaRegistro({ ...ok, apellido: ' ' }, 6)!, /apellido/);
  assert.match(problemaRegistro({ ...ok, correoOk: false }, 6)!, /correo/);
  assert.match(problemaRegistro({ ...ok, clave: 'abc', repetida: 'abc' }, 6)!, /al menos 6/);
  assert.match(problemaRegistro({ ...ok, repetida: 'clave124' }, 6)!, /no coinciden/);
});
