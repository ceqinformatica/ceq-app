/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detalleFinSemestre, fechaLarga, isoDesdeTexto, semestreTerminado, textoDesdeIso } from '../fin-semestre.ts';

test('el último día de clases todavía cuenta; termina al día siguiente', () => {
  assert.equal(semestreTerminado('2026-12-05', '2026-12-05'), false);
  assert.equal(semestreTerminado('2026-12-05', '2026-12-06'), true);
  assert.equal(semestreTerminado(null, '2030-01-01'), false);
  assert.equal(semestreTerminado(undefined, '2030-01-01'), false);
});

test('fechas del selector a la base y de vuelta', () => {
  assert.equal(isoDesdeTexto('12/07/2027'), '2027-07-12');
  assert.equal(isoDesdeTexto('1/3/2027'), '2027-03-01');
  assert.equal(isoDesdeTexto('31/02/2027'), null);
  assert.equal(isoDesdeTexto('12/07'), null);
  assert.equal(textoDesdeIso('2027-07-12'), '12/07/2027');
  assert.equal(fechaLarga('2027-07-12'), '12 de julio');
});

test('texto de la opción según la fecha', () => {
  assert.match(detalleFinSemestre(null, '2026-11-24'), /Elegí tu último día de clases/);
  assert.equal(detalleFinSemestre('2026-12-05', '2026-11-24'), 'Último día de clases: 5 de diciembre. Al día siguiente se vacía tu horario.');
  assert.match(detalleFinSemestre('2026-12-05', '2026-12-06'), /^Terminó el 5 de diciembre/);
});
