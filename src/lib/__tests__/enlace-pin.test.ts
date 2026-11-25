/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escucharResultadoPin, leerEnlacePin, olvidarEnlacePin, procesarEnlacePin, reiniciarEnlacePin, resultadoPin, tomarResultadoPin } from '../enlace-pin.ts';

test('lee el código, el flujo o el error del enlace de recuperar PIN', () => {
  assert.deepEqual(leerEnlacePin('ceqapp://auth/pin?code=abc-123'), { code: 'abc-123', flowId: null });
  assert.deepEqual(leerEnlacePin('ceqapp://auth/pin?sb_flow_id=f1&code=x'), { code: 'x', flowId: 'f1' });
  assert.deepEqual(leerEnlacePin('exp://192.168.0.5:8081/--/auth/pin?code=x'), { code: 'x', flowId: null });
  assert.deepEqual(leerEnlacePin('ceqapp://auth/pin#error=access_denied&error_description=Email+link+is+invalid'), { error: 'Email link is invalid' });
  assert.equal(leerEnlacePin('ceqapp://auth/restablecer?code=abc'), null);
  assert.equal(leerEnlacePin('ceqapp://auth/pinguino?code=abc'), null);
  assert.equal(leerEnlacePin(null), null);
});

test('cada código se canjea una sola vez y el resultado espera a quien lo tome', async () => {
  reiniciarEnlacePin();
  let canjes = 0;
  const canjear = async () => {
    canjes++;
    return null;
  };
  let avisos = 0;
  escucharResultadoPin(() => avisos++);
  await Promise.all([procesarEnlacePin({ code: 'a', flowId: null }, canjear), procesarEnlacePin({ code: 'a', flowId: null }, canjear)]);
  assert.equal(canjes, 1);
  assert.ok(avisos >= 2, 'avisa al empezar y al terminar');
  // Nadie lo tomó todavía (por ejemplo, la app se bloqueó): sigue guardado.
  assert.deepEqual(resultadoPin(), { tipo: 'confirmado' });
  assert.deepEqual(tomarResultadoPin(), { tipo: 'confirmado' });
  assert.equal(tomarResultadoPin(), null, 'se usa una sola vez');
});

test('mientras canjea no se toma; el error se informa', async () => {
  reiniciarEnlacePin();
  let soltar: (v: string | null) => void = () => {};
  const p = procesarEnlacePin({ code: 'b', flowId: null }, () => new Promise((ok) => (soltar = ok)));
  assert.deepEqual(tomarResultadoPin(), { tipo: 'canjeando' });
  soltar('Ese enlace es de otra cuenta.');
  await p;
  assert.deepEqual(tomarResultadoPin(), { tipo: 'error', mensaje: 'Ese enlace es de otra cuenta.' });
});

test('un enlace con error se avisa una vez y no pisa una confirmación', async () => {
  reiniciarEnlacePin();
  const canjear = async () => null;
  await procesarEnlacePin({ error: 'Email link is invalid' }, canjear);
  assert.equal(tomarResultadoPin()?.tipo, 'error');
  // El mismo enlace por el otro camino, enseguida: no se repite.
  await procesarEnlacePin({ error: 'Email link is invalid' }, canjear);
  assert.equal(tomarResultadoPin(), null);
  await procesarEnlacePin({ code: 'z', flowId: null }, canjear);
  await procesarEnlacePin({ error: 'otro' }, canjear);
  assert.deepEqual(tomarResultadoPin(), { tipo: 'confirmado' });
});

test('si el canje no responde, se avisa en vez de quedar esperando', async () => {
  reiniciarEnlacePin();
  await procesarEnlacePin({ code: 'lento', flowId: null }, () => new Promise(() => {}), 10);
  assert.equal(tomarResultadoPin()?.tipo, 'error');
});

test('el resultado vence y se olvida al salir', async () => {
  reiniciarEnlacePin();
  await procesarEnlacePin({ code: 'c', flowId: null }, async () => null);
  assert.equal(resultadoPin(Date.now() + 16 * 60_000), null);
  await procesarEnlacePin({ code: 'd', flowId: null }, async () => null);
  olvidarEnlacePin();
  assert.equal(resultadoPin(), null);
});
