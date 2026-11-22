/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarAsistencia, evaluarComponente, evaluarFirma, porcentajeEvaluacion, promedioPonderado, type Evaluacion, type ReglaFirma } from '../firma.ts';

const ev = (o: Partial<Evaluacion>): Evaluacion => ({ nombre: 'x', componente: 'teoria', ponderacion: 0, rendida: true, ...o });

test('porcentaje directo o por puntaje', () => {
  assert.equal(porcentajeEvaluacion({ porcentaje: 72 }), 72);
  assert.equal(porcentajeEvaluacion({ puntajeObtenido: 18, puntajeTotal: 25 }), 72);
  assert.equal(porcentajeEvaluacion({ puntajeObtenido: 30, puntajeTotal: 25 }), 100);
  assert.equal(porcentajeEvaluacion({}), null);
});

test('promedio ponderado', () => {
  const evals = [ev({ ponderacion: 30, porcentaje: 80 }), ev({ ponderacion: 70, porcentaje: 50 })];
  assert.equal(promedioPonderado(evals), 59);
});

test('cuánto falta: necesario en lo pendiente', () => {
  // 1P 30% con 50, faltan 70% de peso, mínimo 60 -> (60*100 - 1500)/70 = 64.29
  const r = evaluarComponente([ev({ ponderacion: 30, porcentaje: 50 }), ev({ ponderacion: 70, rendida: false })], 60);
  assert.equal(r.actual, 50);
  assert.equal(r.necesario, 64.29);
  assert.equal(r.asegurado, false);
  assert.equal(r.imposible, false);
});

test('asegurado e imposible', () => {
  const ok = evaluarComponente([ev({ ponderacion: 80, porcentaje: 90 }), ev({ ponderacion: 20, rendida: false })], 60);
  assert.equal(ok.asegurado, true);
  assert.equal(ok.necesario, 0);
  assert.equal(ok.semaforo, 'verde');
  const no = evaluarComponente([ev({ ponderacion: 70, porcentaje: 20 }), ev({ ponderacion: 30, rendida: false })], 60);
  assert.equal(no.imposible, true);
  assert.equal(no.semaforo, 'rojo');
});

test('asistencia con faltas disponibles', () => {
  // 32 clases totales, 75% -> 24 mínimas, 8 faltas permitidas; lleva 3 faltas -> 5 disponibles
  const a = evaluarAsistencia({ clasesDictadas: 16, clasesAsistidas: 13, clasesTotales: 32 }, 75);
  assert.equal(a.porcentaje, 81.25);
  assert.equal(a.faltasDisponibles, 5);
  assert.equal(a.semaforo, 'verde');
  assert.equal(evaluarAsistencia({ clasesDictadas: 10, clasesAsistidas: 7 }, 75).semaforo, 'rojo');
});

const regla: ReglaFirma = { minimoTeoria: 60, minimoLaboratorio: 70, minimoAsistencia: 75, minimoAsistenciaLab: 100, modoLaboratorio: 'separado' };

test('firma con laboratorio separado', () => {
  const r = evaluarFirma({
    regla, tieneLaboratorio: true,
    evaluaciones: [ev({ ponderacion: 100, porcentaje: 65 }), ev({ componente: 'laboratorio', ponderacion: 100, porcentaje: 80 })],
    asistencia: { clasesDictadas: 20, clasesAsistidas: 18 },
    asistenciaLab: { clasesDictadas: 8, clasesAsistidas: 8 },
  });
  assert.equal(r.firma, true);
  const sinLab = evaluarFirma({
    regla, tieneLaboratorio: true,
    evaluaciones: [ev({ ponderacion: 100, porcentaje: 65 }), ev({ componente: 'laboratorio', ponderacion: 100, porcentaje: 60 })],
    asistencia: { clasesDictadas: 20, clasesAsistidas: 18 },
    asistenciaLab: { clasesDictadas: 8, clasesAsistidas: 8 },
  });
  assert.equal(sinLab.firma, false);
  assert.equal(sinLab.laboratorio?.semaforo, 'rojo');
});

test('firma con laboratorio combinado al 30%', () => {
  // teoría 50, lab 90 -> 0.7*50 + 0.3*90 = 62 >= 60
  const r = evaluarFirma({
    regla: { ...regla, modoLaboratorio: 'combinado', pesoLaboratorio: 30, minimoAsistenciaLab: null }, tieneLaboratorio: true,
    evaluaciones: [ev({ ponderacion: 50, porcentaje: 50 }), ev({ ponderacion: 50, porcentaje: 50 }), ev({ componente: 'laboratorio', ponderacion: 10, porcentaje: 90 })],
    asistencia: { clasesDictadas: 10, clasesAsistidas: 10 },
  });
  assert.equal(r.teoria.actual, 62);
  assert.equal(r.laboratorio, null);
  assert.equal(r.firma, true);
});
