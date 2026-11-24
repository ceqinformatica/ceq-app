/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerVencimiento } from '../leer-vencimiento.ts';

const v = (...l: string[]) => leerVencimiento(l)?.iso ?? null;

test('fecha completa junto a "vence"', () => {
  assert.equal(v('CENTRO DE ESTUDIANTES DE QUÍMICA', 'Emitido: 10/03/2025', 'Vence: 10/03/2028'), '2028-03-10');
  assert.equal(v('VÁLIDO HASTA 31-12-27'), '2027-12-31');
  assert.equal(v('Vencimiento 31.07.2029'), '2029-07-31');
});

test('la palabra clave en el renglón de arriba', () => {
  assert.equal(v('SOCIO N° 0427\nVENCE\n12/2028'), '2028-12-31');
});

test('mes y año, con nombre de mes', () => {
  assert.equal(v('Vigencia: 06/2027'), '2027-06-30');
  assert.equal(v('Válido hasta diciembre de 2027'), '2027-12-31');
  assert.equal(v('VENCE DIC. 2026'), '2026-12-31');
  assert.equal(v('Vence feb/28'), '2028-02-29');
});

test('por semestre', () => {
  assert.equal(v('Vence: 2.º semestre 2027'), '2027-12-31');
  assert.equal(v('Válido hasta 1er sem. 2028'), '2028-07-31');
  assert.equal(v('VIGENCIA II SEMESTRE 2026'), '2026-12-31');
});

test('sin palabra clave elige la fecha más lejana', () => {
  assert.equal(v('Ana Giménez', 'C.I. 5.123.456', '01/03/2025', '01/03/2028'), '2028-03-01');
});

test('con palabra clave gana aunque haya otra fecha más lejana', () => {
  assert.equal(v('Nacimiento 02/05/2030', 'Vence 01/03/2028'), '2028-03-01');
});

test('errores típicos del lector (O por 0)', () => {
  assert.equal(v('Vence: 3O/O6/2O28'), '2028-06-30');
});

test('un año solo cuenta únicamente con "vence"', () => {
  assert.equal(v('Vence 2028'), '2028-12-31');
  assert.equal(v('Promoción 2028'), null);
});

test('la cédula y el número de socio no se confunden con fechas', () => {
  assert.equal(v('C.I. 5.123.456', 'Socio 0427'), null);
  assert.equal(v('C.I. 4555666 vence 12/2027'), '2027-12-31');
});

test('fechas imposibles se descartan', () => {
  assert.equal(v('Vence 31/02/2028'), null);
  assert.equal(v('Vence 13/2028'), null);
});

test('sin texto', () => {
  assert.equal(leerVencimiento([]), null);
  assert.equal(leerVencimiento(['   ']), null);
});

test('devuelve lo leído para mostrarlo', () => {
  const r = leerVencimiento(['Vence: 2.º semestre 2027']);
  assert.equal(r?.leido, '2.º semestre 2027');
  assert.equal(r?.conPalabraClave, true);
});
