/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesPorDia, infoTipoClase, nombreConTipo, TIPOS_CLASE } from '../tipo-clase.ts';

test('los tres tipos, en el orden del formulario', () => {
  assert.deepEqual(TIPOS_CLASE.map((t) => t.valor), ['teoria', 'rp', 'laboratorio']);
  assert.deepEqual(TIPOS_CLASE.map((t) => t.texto), ['Teoría', 'RP', 'Laboratorio']);
});

test('clases sin tipo o con un valor desconocido no muestran nada', () => {
  assert.equal(infoTipoClase(null), null);
  assert.equal(infoTipoClase(undefined), null);
  assert.equal(infoTipoClase('taller'), null);
  assert.equal(infoTipoClase('laboratorio')?.corto, 'Lab');
});

test('nombre con el tipo entre paréntesis', () => {
  assert.equal(nombreConTipo('Química Analítica I', 'laboratorio'), 'Química Analítica I (Laboratorio)');
  assert.equal(nombreConTipo('Física I', 'rp'), 'Física I (RP)');
  assert.equal(nombreConTipo('Tutoría', null), 'Tutoría');
});

test('agrupa por día y ordena por hora', () => {
  const c = (id: string, dia: number, ini: string, fin = '23:00:00') => ({ id, dia_semana: dia, hora_inicio: ini, hora_fin: fin });
  const res = clasesPorDia([c('a', 3, '10:00:00'), c('b', 1, '13:30:00'), c('c', 1, '07:30:00'), c('d', 3, '10:00:00', '11:00:00')]);
  assert.deepEqual(res.map((d) => d.dia), [1, 3]);
  assert.deepEqual(res[0].clases.map((x) => x.id), ['c', 'b']);
  assert.deepEqual(res[1].clases.map((x) => x.id), ['d', 'a']);
  assert.deepEqual(clasesPorDia([]), []);
});
