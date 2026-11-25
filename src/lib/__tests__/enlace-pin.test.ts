/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entregarEnlacePin, escucharEnlacePin, hayEnlacePinPendiente, leerEnlacePin, reiniciarEnlacePin, type EnlacePin } from '../enlace-pin.ts';

test('lee el código o el error del enlace de recuperar PIN', () => {
  assert.deepEqual(leerEnlacePin('ceqapp://auth/pin?code=abc-123'), { code: 'abc-123' });
  assert.deepEqual(leerEnlacePin('exp://192.168.0.5:8081/--/auth/pin?code=x'), { code: 'x' });
  assert.deepEqual(leerEnlacePin('ceqapp://auth/pin#error=access_denied&error_description=Email+link+is+invalid'), { error: 'Email link is invalid' });
  assert.equal(leerEnlacePin('ceqapp://auth/restablecer?code=abc'), null);
  assert.equal(leerEnlacePin('ceqapp://auth/pinguino?code=abc'), null);
  assert.equal(leerEnlacePin(null), null);
});

test('cada código se entrega una sola vez, aunque llegue por dos caminos', () => {
  reiniciarEnlacePin();
  const recibidos: EnlacePin[] = [];
  const dejar = escucharEnlacePin((e) => recibidos.push(e));
  entregarEnlacePin({ code: 'a' });
  entregarEnlacePin({ code: 'a' });
  assert.deepEqual(recibidos, [{ code: 'a' }]);
  dejar();
});

test('si nadie espera, el enlace queda guardado hasta que alguien escuche', () => {
  reiniciarEnlacePin();
  entregarEnlacePin({ code: 'b' });
  assert.equal(hayEnlacePinPendiente(), true);
  const recibidos: EnlacePin[] = [];
  escucharEnlacePin((e) => recibidos.push(e));
  assert.deepEqual(recibidos, [{ code: 'b' }]);
  assert.equal(hayEnlacePinPendiente(), false);
});
