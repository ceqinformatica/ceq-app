import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANTIDAD_PESTANAS, claveRecorrido, PASOS_RECORRIDO, posicionVentana, VERSION_RECORRIDO, yaVioRecorrido, zonaPestana } from '../recorrido.ts';

test('pasos: empieza con la bienvenida, cubre las 5 pestañas en orden y termina en el perfil', () => {
  assert.equal(PASOS_RECORRIDO[0].id, 'bienvenida');
  assert.equal(PASOS_RECORRIDO[0].pestana, undefined);
  const pestanas = PASOS_RECORRIDO.filter((p) => p.pestana != null).map((p) => p.pestana);
  assert.deepEqual(pestanas, [0, 1, 2, 3, 4]);
  assert.equal(PASOS_RECORRIDO.at(-1)?.id, 'perfil');
  assert.equal(new Set(PASOS_RECORRIDO.map((p) => p.id)).size, PASOS_RECORRIDO.length);
  for (const p of PASOS_RECORRIDO) assert.ok(p.titulo.length > 0 && p.texto.length > 0);
});

test('clave por cuenta', () => {
  assert.notEqual(claveRecorrido('a'), claveRecorrido('b'));
});

test('ya lo vio: en este celular o en la cuenta', () => {
  assert.equal(yaVioRecorrido(null, undefined), false);
  assert.equal(yaVioRecorrido(null, {}), false);
  assert.equal(yaVioRecorrido(String(VERSION_RECORRIDO), undefined), true);
  assert.equal(yaVioRecorrido(null, { recorrido_visto: VERSION_RECORRIDO }), true);
  assert.equal(yaVioRecorrido(null, { recorrido_visto: String(VERSION_RECORRIDO) }), true);
});

test('una versión vieja del recorrido o basura no cuentan como vistas', () => {
  assert.equal(yaVioRecorrido(String(VERSION_RECORRIDO - 1), { recorrido_visto: VERSION_RECORRIDO - 1 }), false);
  assert.equal(yaVioRecorrido('si', { recorrido_visto: 'si' }), false);
  assert.equal(yaVioRecorrido('', null), false);
});

test('celular: cada pestaña se resalta sobre su quinto de la barra de abajo', () => {
  const ancho = 390, alto = 844, abajo = 34;
  for (let i = 0; i < CANTIDAD_PESTANAS; i++) {
    const z = zonaPestana(i, ancho, alto, { barraLateral: false, abajo, arriba: 47 });
    const centro = z.x + z.ancho / 2;
    assert.ok(Math.abs(centro - (ancho / 5) * (i + 0.5)) < 0.01);
    assert.equal(z.y + z.alto, alto - abajo);
    assert.ok(z.ancho > 0 && z.ancho <= ancho / 5);
  }
});

test('tablet horizontal: las pestañas se resaltan en la barra lateral, una debajo de otra', () => {
  const z0 = zonaPestana(0, 1280, 800, { barraLateral: true, abajo: 8, arriba: 24 });
  const z1 = zonaPestana(1, 1280, 800, { barraLateral: true, abajo: 8, arriba: 24 });
  assert.ok(z0.x + z0.ancho <= 104);
  assert.ok(z1.y > z0.y + z0.alto - 1);
});

test('la ventanita queda dentro de la pantalla y la flecha apunta a la pestaña', () => {
  const ancho = 390, alto = 844;
  for (let i = 0; i < CANTIDAD_PESTANAS; i++) {
    const z = zonaPestana(i, ancho, alto, { barraLateral: false, abajo: 34, arriba: 47 });
    const v = posicionVentana(z, ancho, alto, { barraLateral: false, altoVentana: 250, arriba: 47 });
    assert.ok(v.x >= 16 && v.x + v.ancho <= ancho - 16);
    assert.ok(v.y + 250 <= z.y);
    assert.equal(v.flecha?.lado, 'abajo');
    assert.ok(Math.abs(v.x + (v.flecha?.desplazamiento ?? 0) - (z.x + z.ancho / 2)) < 0.01);
  }
});

test('sin pestaña la ventanita va al centro; en la tablet horizontal va a la derecha de la barra', () => {
  const c = posicionVentana(null, 390, 844, { barraLateral: false, altoVentana: 240, arriba: 47 });
  assert.equal(c.flecha, null);
  assert.ok(Math.abs(c.x + c.ancho / 2 - 195) < 0.01);

  const z = zonaPestana(4, 1280, 800, { barraLateral: true, abajo: 8, arriba: 24 });
  const v = posicionVentana(z, 1280, 800, { barraLateral: true, altoVentana: 240, arriba: 24 });
  assert.equal(v.flecha?.lado, 'izquierda');
  assert.ok(v.x > z.x + z.ancho);
  assert.ok(v.y >= 24 && v.y + 240 <= 800);
});
