import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoSinConexion, claveCache, cuandoSeGuardo, deserializar, serializar } from '../cache.ts';

test('guarda y recupera Map y Set anidados', () => {
  const malla = { plan: { id: 'p' }, estados: new Map([['a', { estado: 'aprobada', notaFinal: 4 }]]), hechas: new Set(['x', 'y']), lista: [1, 2] };
  const vuelta = deserializar<typeof malla>(serializar(malla));
  assert.ok(vuelta.estados instanceof Map);
  assert.deepEqual(vuelta.estados.get('a'), { estado: 'aprobada', notaFinal: 4 });
  assert.ok(vuelta.hechas instanceof Set);
  assert.equal(vuelta.hechas.has('y'), true);
  assert.deepEqual(vuelta.lista, [1, 2]);
  assert.equal(deserializar(serializar(null)), null);
});

test('la clave lleva el usuario', () => {
  assert.equal(claveCache('u1', 'malla:p'), 'ceq.cache.v1:u1:malla:p');
});

test('cuándo se guardó', () => {
  const ahora = new Date(2026, 10, 23, 15, 0);
  assert.equal(cuandoSeGuardo(new Date(2026, 10, 23, 9, 5).getTime(), ahora), 'hoy 09:05');
  assert.equal(cuandoSeGuardo(new Date(2026, 10, 22, 21, 30).getTime(), ahora), 'ayer 21:30');
  assert.equal(cuandoSeGuardo(new Date(2026, 10, 12, 18, 0).getTime(), ahora), '12 nov 18:00');
  assert.match(avisoSinConexion(new Date(2026, 10, 23, 9, 5).getTime(), ahora), /^Sin conexión\. .*hoy 09:05\.$/);
});
