import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularDisposicion } from '../disposicion.ts';

test('celular vertical: una columna, pestañas abajo, todo el ancho', () => {
  const d = calcularDisposicion(390, 844);
  assert.equal(d.tablet, false);
  assert.equal(d.dosColumnas, false);
  assert.equal(d.barraLateral, false);
  assert.equal(d.anchoMaximo, undefined);
});

test('celular acostado no se trata como tablet', () => {
  const d = calcularDisposicion(844, 390);
  assert.equal(d.tablet, false);
  assert.equal(d.horizontal, true);
});

test('tablet vertical: dos columnas, pestañas abajo', () => {
  const d = calcularDisposicion(800, 1280);
  assert.equal(d.tablet, true);
  assert.equal(d.dosColumnas, true);
  assert.equal(d.barraLateral, false);
});

test('tablet horizontal: dos columnas y barra lateral, contenido limitado', () => {
  const d = calcularDisposicion(1280, 800);
  assert.equal(d.tablet, true);
  assert.equal(d.horizontal, true);
  assert.equal(d.barraLateral, true);
  assert.equal(d.anchoMaximo, 1100);
});

test('tablet chica vertical: una columna centrada', () => {
  const d = calcularDisposicion(600, 960);
  assert.equal(d.tablet, true);
  assert.equal(d.dosColumnas, false);
  assert.equal(d.anchoMaximo, 640);
});
