/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESPERA_ENLACE_MS,
  escucharResultadoPin,
  estadoAlPedir,
  hayEnlaceComprobando,
  hayQueAtender,
  leerEnlacePin,
  leerEstadoEnlace,
  olvidarEnlacePin,
  procesarEnlacePin,
  reiniciarEnlacePin,
  resultadoPin,
  tomarResultadoPin,
  type EstadoEnlace,
} from '../enlace-pin.ts';

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

/** Memoria en RAM que imita lo guardado en el celular (sobrevive a "reabrir la app"). */
function memoriaFalsa(inicial: EstadoEnlace = { pedido: null, usados: [] }) {
  let texto = JSON.stringify(inicial);
  return {
    leer: async () => leerEstadoEnlace(texto),
    guardar: async (e: EstadoEnlace) => {
      texto = JSON.stringify(e);
    },
    pedir: (ahora = Date.now()) => {
      texto = JSON.stringify(estadoAlPedir(leerEstadoEnlace(texto), ahora));
    },
    ver: () => leerEstadoEnlace(texto),
  };
}

test('al reabrir la app, el mismo enlace ya usado no se vuelve a canjear (Android lo reentrega)', async () => {
  reiniciarEnlacePin();
  const memoria = memoriaFalsa();
  memoria.pedir();
  let canjes = 0;
  const canjear = async () => {
    canjes++;
    return canjes === 1 ? null : 'Código inválido';
  };
  await procesarEnlacePin({ code: 'k1', flowId: null }, canjear, 1000, memoria);
  assert.deepEqual(tomarResultadoPin(), { tipo: 'confirmado' });
  // La app se cierra y se vuelve a abrir: se pierde lo que estaba en memoria,
  // pero Android entrega otra vez ceqapp://auth/pin?code=k1.
  for (let i = 0; i < 3; i++) {
    reiniciarEnlacePin();
    memoria.pedir(); // aun si se pide otro enlace después, el viejo no se canjea
    await procesarEnlacePin({ code: 'k1', flowId: null }, canjear, 1000, memoria);
    assert.equal(resultadoPin(), null, 'sin "código inválido"');
  }
  assert.equal(canjes, 1);
});

test('un enlace que no se pidió en este celular, o de hace más de una hora, se ignora', async () => {
  reiniciarEnlacePin();
  const memoria = memoriaFalsa();
  let canjes = 0;
  const canjear = async () => {
    canjes++;
    return null;
  };
  await procesarEnlacePin({ code: 'sin-pedir', flowId: null }, canjear, 1000, memoria);
  await procesarEnlacePin({ error: 'Email link is invalid or has expired' }, canjear, 1000, memoria);
  assert.equal(resultadoPin(), null);
  memoria.pedir(Date.now() - ESPERA_ENLACE_MS - 1000);
  await procesarEnlacePin({ code: 'viejo', flowId: null }, canjear, 1000, memoria);
  assert.equal(resultadoPin(), null);
  assert.equal(canjes, 0);
});

test('tras recuperar ya no se espera otro enlace; un error viejo tampoco se repite', async () => {
  reiniciarEnlacePin();
  const memoria = memoriaFalsa();
  memoria.pedir();
  await procesarEnlacePin({ error: 'Email link is invalid or has expired' }, async () => null, 1000, memoria);
  assert.equal(tomarResultadoPin()?.tipo, 'error');
  // Reabrir la app con el mismo enlace con error: no vuelve a aparecer.
  reiniciarEnlacePin();
  await procesarEnlacePin({ error: 'Email link is invalid or has expired' }, async () => null, 1000, memoria);
  assert.equal(resultadoPin(), null);
  // Pide otro: ese error vuelve a poder avisarse, y el enlace bueno funciona.
  memoria.pedir();
  await procesarEnlacePin({ code: 'bueno', flowId: null }, async () => null, 1000, memoria);
  assert.deepEqual(tomarResultadoPin(), { tipo: 'confirmado' });
  assert.equal(memoria.ver().pedido, null);
  await procesarEnlacePin({ code: 'otro', flowId: null }, async () => null, 1000, memoria);
  assert.equal(resultadoPin(), null, 'ya no se esperaba ningún enlace');
});

test('mientras se comprueba si el enlace es nuevo, la ruta espera', async () => {
  reiniciarEnlacePin();
  let soltar: () => void = () => {};
  const base = memoriaFalsa();
  base.pedir();
  let primera = true;
  const lenta = {
    leer: () => {
      if (!primera) return base.leer();
      primera = false;
      return new Promise<EstadoEnlace>((ok) => (soltar = () => ok(base.ver())));
    },
    guardar: base.guardar,
  };
  const p = procesarEnlacePin({ code: 'n', flowId: null }, async () => null, 1000, lenta);
  assert.equal(hayEnlaceComprobando(), true);
  assert.equal(resultadoPin(), null);
  soltar();
  await p;
  assert.equal(hayEnlaceComprobando(), false);
  assert.deepEqual(resultadoPin(), { tipo: 'confirmado' });
});

test('lo guardado roto o vacío no rompe nada', () => {
  assert.deepEqual(leerEstadoEnlace(null), { pedido: null, usados: [] });
  assert.deepEqual(leerEstadoEnlace('{roto'), { pedido: null, usados: [] });
  assert.deepEqual(leerEstadoEnlace('{"pedido":"x","usados":[1,"a"]}'), { pedido: null, usados: ['a'] });
  assert.equal(hayQueAtender({ pedido: Date.now(), usados: ['a'] }, 'a'), false);
  assert.equal(hayQueAtender({ pedido: Date.now(), usados: ['a'] }, 'b'), true);
});
