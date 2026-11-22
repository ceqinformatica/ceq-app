/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarFirma, type Evaluacion } from '../firma.ts';
import {
  REGLA_FCQ, calificacionFinal, finalNecesario, notaDesdeRendimiento, promedioGeneralFcq, puedeRecuperar, teoriaTrasRecuperar,
} from '../reglamento-fcq.ts';

const ev = (o: Partial<Evaluacion>): Evaluacion => ({ nombre: 'x', componente: 'teoria', ponderacion: 50, rendida: true, ...o });

test('firma FCQ: teoría 50, prácticos 60, asistencia 60, prácticas 100', () => {
  const r = evaluarFirma({
    regla: REGLA_FCQ,
    tieneLaboratorio: true,
    evaluaciones: [ev({ porcentaje: 52 }), ev({ porcentaje: 50 }), ev({ componente: 'laboratorio', ponderacion: 100, porcentaje: 60 })],
    asistencia: { clasesDictadas: 30, clasesAsistidas: 18 },
    asistenciaLab: { clasesDictadas: 10, clasesAsistidas: 10 },
  });
  assert.equal(r.firma, true);
  const sinPractica = evaluarFirma({
    regla: REGLA_FCQ,
    tieneLaboratorio: true,
    evaluaciones: [ev({ porcentaje: 80 }), ev({ porcentaje: 80 }), ev({ componente: 'laboratorio', ponderacion: 100, porcentaje: 90 })],
    asistencia: { clasesDictadas: 30, clasesAsistidas: 30 },
    asistenciaLab: { clasesDictadas: 10, clasesAsistidas: 9 },
  });
  assert.equal(sinPractica.firma, false);
});

test('recuperación: 30 a 49,99 y reemplaza el parcial más bajo', () => {
  assert.equal(puedeRecuperar({ actual: 45, minimo: 50 }), true);
  assert.equal(puedeRecuperar({ actual: 29, minimo: 50 }), false);
  assert.equal(puedeRecuperar({ actual: 50, minimo: 50 }), false);
  assert.equal(teoriaTrasRecuperar([{ porcentaje: 30, ponderacion: 50 }, { porcentaje: 60, ponderacion: 50 }], 70), 65);
  assert.equal(teoriaTrasRecuperar([{ porcentaje: 30, ponderacion: 50 }, { porcentaje: 60, ponderacion: 50 }], 55), 45);
});

test('PG y calificación final', () => {
  assert.equal(promedioGeneralFcq(50, 70), 60);
  assert.equal(promedioGeneralFcq(55, null), 55);
  assert.deepEqual(calificacionFinal(60, 59), { rendimiento: null, nota: 1, aprobado: false });
  assert.deepEqual(calificacionFinal(60, 60), { rendimiento: 60, nota: 2, aprobado: true });
  assert.equal(calificacionFinal(80, 95).nota, 4); // 32 + 57 = 89
  assert.equal(calificacionFinal(90, 95).nota, 5); // 36 + 57 = 93
});

test('escala con redondeo desde 0,5', () => {
  assert.equal(notaDesdeRendimiento(59.4), 1);
  assert.equal(notaDesdeRendimiento(59.5), 2);
  assert.equal(notaDesdeRendimiento(70.4), 2);
  assert.equal(notaDesdeRendimiento(70.5), 3);
  assert.equal(notaDesdeRendimiento(90.5), 5);
});

test('final necesario', () => {
  assert.equal(finalNecesario(50), 65.84); // (59,5 − 20) / 0,6
  assert.equal(finalNecesario(80), 60); // con PG alto alcanza el mínimo del final
  assert.equal(finalNecesario(60, 5), null); // (90,5 − 24) / 0,6 > 100
});
