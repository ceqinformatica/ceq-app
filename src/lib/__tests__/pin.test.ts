import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  clavesPin, crearRegistroPin, esperaTrasFallos, FALLOS_LIBRES, leerPinGuardado, nuevaSal, pinCoincide, problemaPin, segundosRestantes, sha256,
} from '../pin.ts';

test('sha256 coincide con el de Node', () => {
  for (const t of ['', 'abc', 'PIN 1234 ñandú 🙂', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(200)]) {
    assert.equal(sha256(t), createHash('sha256').update(t, 'utf8').digest('hex'), t.slice(0, 10));
  }
});

test('valida el formato del PIN', () => {
  assert.equal(problemaPin('2580'), null);
  assert.equal(problemaPin('190573'), null);
  assert.match(problemaPin('12a4')!, /números/);
  assert.match(problemaPin('123')!, /entre 4 y 6/);
  assert.match(problemaPin('1234567')!, /entre 4 y 6/);
  assert.match(problemaPin('0000')!, /repetir/);
  assert.match(problemaPin('1234')!, /escalera/);
  assert.match(problemaPin('9876')!, /escalera/);
  assert.match(problemaPin('7890')!, /escalera/);
  assert.equal(problemaPin('1357'), null);
});

test('el PIN guardado no contiene el PIN y se comprueba bien', () => {
  const sal = nuevaSal();
  assert.equal(sal.length, 32);
  assert.notEqual(sal, nuevaSal());
  const reg = crearRegistroPin('2580', sal, 50);
  assert.equal(reg.largo, 4);
  assert.ok(!JSON.stringify(reg).includes('2580'));
  assert.equal(pinCoincide('2580', reg), true);
  assert.equal(pinCoincide('2581', reg), false);
  assert.equal(pinCoincide('25800', reg), false);
  // Misma clave con otra sal da otro resumen.
  assert.notEqual(crearRegistroPin('2580', nuevaSal(), 50).resumen, reg.resumen);
});

test('lee lo guardado y descarta datos rotos', () => {
  const reg = crearRegistroPin('4826', 'ab', 3);
  assert.deepEqual(leerPinGuardado(JSON.stringify(reg)), reg);
  assert.equal(leerPinGuardado(null), null);
  assert.equal(leerPinGuardado('{roto'), null);
  assert.equal(leerPinGuardado('{"v":2}'), null);
});

test('espera creciente tras muchos fallos', () => {
  assert.equal(esperaTrasFallos(0), 0);
  assert.equal(esperaTrasFallos(FALLOS_LIBRES - 1), 0);
  assert.equal(esperaTrasFallos(FALLOS_LIBRES), 30);
  assert.equal(esperaTrasFallos(FALLOS_LIBRES + 1), 60);
  assert.equal(esperaTrasFallos(40), 15 * 60);
  const ahora = 1_000_000;
  assert.equal(segundosRestantes(FALLOS_LIBRES, ahora - 10_000, ahora), 20);
  assert.equal(segundosRestantes(FALLOS_LIBRES, ahora - 40_000, ahora), 0);
  assert.equal(segundosRestantes(2, ahora, ahora), 0);
  assert.equal(segundosRestantes(9, null, ahora), 0);
});

test('el PIN se guarda aparte para cada cuenta (y sin cuenta no hay PIN)', () => {
  assert.equal(clavesPin(null), null);
  assert.equal(clavesPin(''), null);
  const a = clavesPin('8f14e45f-ceea-467a-9575-1a2b3c4d5e6f');
  assert.deepEqual(a, {
    pin: 'ceq_pin.8f14e45f-ceea-467a-9575-1a2b3c4d5e6f',
    intentos: 'ceq_pin_intentos.8f14e45f-ceea-467a-9575-1a2b3c4d5e6f',
    biometria: 'ceq_biometria_activa.8f14e45f-ceea-467a-9575-1a2b3c4d5e6f',
  });
  assert.notEqual(clavesPin('otra')?.pin, a?.pin);
  // La huella también es de cada cuenta: otra cuenta del celular no la hereda.
  assert.notEqual(clavesPin('otra')?.biometria, a?.biometria);
  assert.match(clavesPin('a/b c@d')!.biometria, /^[A-Za-z0-9._-]+$/);
  // SecureStore solo acepta letras, números, '.', '-' y '_'.
  assert.match(clavesPin('a/b c@d')!.pin, /^[A-Za-z0-9._-]+$/);
});
