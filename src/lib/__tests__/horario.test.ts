/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abreviar, acomodarDia, chocan, choquesCon, horaParaBase, minutos, rangoSemana, textoAviso, textoMinutos } from '../horario.ts';

const c = (id: string, dia: number, ini: string, fin: string) => ({ id, dia_semana: dia, hora_inicio: ini, hora_fin: fin });

test('minutos y vuelta', () => {
  assert.equal(minutos('07:30:00'), 450);
  assert.equal(minutos('13:05'), 785);
  assert.equal(textoMinutos(450), '07:30');
});

test('hora del selector a la base', () => {
  assert.equal(horaParaBase('7:30'), '07:30:00');
  assert.equal(horaParaBase('18:45'), '18:45:00');
  assert.equal(horaParaBase(''), null);
  assert.equal(horaParaBase('25:00'), null);
});

test('choques: mismo día y horas que se pisan', () => {
  assert.ok(chocan(c('a', 1, '07:30', '09:30'), c('b', 1, '09:00', '10:00')));
  assert.ok(!chocan(c('a', 1, '07:30', '09:30'), c('b', 1, '09:30', '10:00')), 'tocarse en el borde no es choque');
  assert.ok(!chocan(c('a', 1, '07:30', '09:30'), c('b', 2, '08:00', '09:00')), 'otro día');
  assert.ok(chocan(c('a', 3, '13:00', '17:00'), c('b', 3, '14:00', '15:00')), 'una dentro de la otra');
});

test('al editar, una clase no choca consigo misma', () => {
  const lista = [c('a', 1, '07:30', '09:30'), c('b', 1, '09:00', '10:00')];
  assert.deepEqual(choquesCon(c('a', 1, '07:30', '09:00'), lista).map((x) => x.id), []);
  assert.deepEqual(choquesCon(c('a', 1, '07:30', '09:45'), lista).map((x) => x.id), ['b']);
});

test('rango de la grilla en horas enteras', () => {
  assert.deepEqual(rangoSemana([]), { desde: 420, hasta: 780 });
  assert.deepEqual(rangoSemana([c('a', 1, '07:30', '09:30'), c('b', 4, '14:00', '17:45')]), { desde: 420, hasta: 1080 });
});

test('acomoda lado a lado las que se pisan', () => {
  const r = acomodarDia([c('a', 1, '07:30', '09:30'), c('b', 1, '08:00', '09:00'), c('d', 1, '10:00', '12:00'), c('e', 1, '09:00', '10:00')]);
  const de = (id: string) => r.find((x) => x.clase.id === id)!;
  assert.deepEqual([de('a').columna, de('a').columnas], [0, 2]);
  assert.deepEqual([de('b').columna, de('b').columnas], [1, 2]);
  // "e" empieza cuando termina "b" pero "a" sigue: va a la columna libre (la de b).
  assert.deepEqual([de('e').columna, de('e').columnas], [1, 2]);
  // "d" empieza cuando ya terminaron todas: grupo nuevo, ancho completo.
  assert.deepEqual([de('d').columna, de('d').columnas], [0, 1]);
});

test('textos del aviso', () => {
  assert.equal(textoAviso(null), 'Sin aviso');
  assert.equal(textoAviso(15), '15 min antes');
  assert.equal(textoAviso(60), '1 hora antes');
  assert.equal(textoAviso(120), '2 horas antes');
});

test('abrevia palabras largas para la grilla', () => {
  assert.equal(abreviar('Fisicoquímica I'), 'Fisico. I');
  assert.equal(abreviar('Bioquímica'), 'Bioquí.');
  assert.equal(abreviar('Química Analítica I'), 'Química Analít. I');
  assert.equal(abreviar('Tutoría de Física'), 'Tutoría de Física');
});
