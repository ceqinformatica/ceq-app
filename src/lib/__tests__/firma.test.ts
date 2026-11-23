/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarAsistencia, evaluarComponente, evaluarFirma, pesosIguales, porcentajeEvaluacion, promedioFirma, promedioPonderado, type Evaluacion, type ReglaFirma } from '../firma.ts';

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

test('datos mal cargados (NaN) no rompen el cálculo', () => {
  assert.equal(porcentajeEvaluacion({ porcentaje: Number('abc') }), null);
  assert.equal(porcentajeEvaluacion({ puntajeObtenido: 10, puntajeTotal: Number('') || Number.NaN }), null);
  const r = evaluarComponente([ev({ ponderacion: Number.NaN, porcentaje: 90 }), ev({ ponderacion: 100, porcentaje: 70 })], 60);
  assert.equal(r.actual, 70);
  assert.equal(r.semaforo, 'verde');
  assert.equal(promedioPonderado([ev({ ponderacion: 50, porcentaje: Number.NaN }), ev({ ponderacion: 50, porcentaje: 80 })]), 80);
});

test('combinado sin notas de laboratorio: el lab queda pendiente', () => {
  // Teoría 70 con lab al 30 % sin cargar: no puede estar firmada todavía.
  const r = evaluarFirma({
    regla: { ...regla, modoLaboratorio: 'combinado', pesoLaboratorio: 30, minimoAsistenciaLab: null }, tieneLaboratorio: true,
    evaluaciones: [ev({ ponderacion: 100, porcentaje: 70 })],
    asistencia: { clasesDictadas: 10, clasesAsistidas: 10 },
  });
  assert.equal(r.teoria.actual, 70);
  // (60·100 − 70·70) / 30 = 36.67 en el laboratorio
  assert.equal(r.teoria.necesario, 36.67);
  assert.equal(r.firma, false);
});

test('combinado: peso de laboratorio fuera de rango se limita a 0–100', () => {
  const r = evaluarFirma({
    regla: { ...regla, modoLaboratorio: 'combinado', pesoLaboratorio: 150, minimoAsistenciaLab: null }, tieneLaboratorio: true,
    evaluaciones: [ev({ ponderacion: 100, porcentaje: 10 }), ev({ componente: 'laboratorio', ponderacion: 100, porcentaje: 80 })],
    asistencia: { clasesDictadas: 10, clasesAsistidas: 10 },
  });
  assert.equal(r.teoria.actual, 80);
  assert.equal(r.firma, true);
});

test('asistencia: sin clases dictadas no hay datos; límite exacto cuenta como cumplido', () => {
  assert.equal(evaluarAsistencia({ clasesDictadas: 0, clasesAsistidas: 0 }, 75).semaforo, 'sin_datos');
  assert.equal(evaluarAsistencia(null, 75).porcentaje, null);
  // 75 % justo: 3 de 4
  const justo = evaluarFirma({ regla: { ...regla, minimoAsistenciaLab: null }, tieneLaboratorio: false, evaluaciones: [ev({ ponderacion: 1, porcentaje: 60 })], asistencia: { clasesDictadas: 4, clasesAsistidas: 3 } });
  assert.equal(justo.firma, true);
  // 32 clases al 75 %: con 8 faltas todavía firma, con 9 ya no
  assert.equal(evaluarAsistencia({ clasesDictadas: 32, clasesAsistidas: 24, clasesTotales: 32 }, 75).faltasDisponibles, 0);
  assert.equal(evaluarAsistencia({ clasesDictadas: 32, clasesAsistidas: 23, clasesTotales: 32 }, 75).semaforo, 'rojo');
});

test('nota mínima exacta y todo rendido', () => {
  const r = evaluarComponente([ev({ ponderacion: 40, porcentaje: 60 }), ev({ ponderacion: 60, porcentaje: 60 })], 60);
  assert.equal(r.asegurado, true);
  assert.equal(r.necesario, null);
  const bajo = evaluarComponente([ev({ ponderacion: 40, porcentaje: 59.99 }), ev({ ponderacion: 60, porcentaje: 60 })], 60);
  assert.equal(bajo.semaforo, 'rojo');
});

test('pesos automáticos: tres parciales valen un tercio cada uno', () => {
  const evals: Evaluacion[] = [
    { nombre: '1P', componente: 'teoria', ponderacion: 70, porcentaje: 40, rendida: true },
    { nombre: '2P', componente: 'teoria', ponderacion: 20, porcentaje: 60, rendida: true },
    { nombre: '3P', componente: 'teoria', ponderacion: 10, porcentaje: 80, rendida: true },
  ];
  assert.equal(promedioPonderado(pesosIguales(evals)), 60);
});

test('promedio de firma: (teoría + laboratorio) / 2 si los dos habilitan', () => {
  const regla = { minimoTeoria: 50, minimoLaboratorio: 60, minimoAsistencia: 60, modoLaboratorio: 'separado' as const };
  const e = (componente: 'teoria' | 'laboratorio', porcentaje: number, rendida = true): Evaluacion => ({ nombre: 'x', componente, ponderacion: 1, porcentaje, rendida });
  const firma = (evals: Evaluacion[], tieneLaboratorio = true) => evaluarFirma({ regla, tieneLaboratorio, evaluaciones: evals });
  // Teoría 60 (50, 70), laboratorio 80 → 70.
  assert.equal(promedioFirma(firma([e('teoria', 50), e('teoria', 70), e('laboratorio', 80)])), 70);
  // Laboratorio por debajo de 60: todavía no hay firma.
  assert.equal(promedioFirma(firma([e('teoria', 90), e('laboratorio', 55)])), null);
  // Teoría por debajo de 50.
  assert.equal(promedioFirma(firma([e('teoria', 45), e('laboratorio', 90)])), null);
  // Sin laboratorio: solo teoría. 66,5 se redondea a 67 (desde 0,5 va para arriba).
  assert.equal(promedioFirma(firma([e('teoria', 62), e('teoria', 71)], false)), 67);
  // 90,5 → 91; 90,4 → 90.
  assert.equal(promedioFirma(firma([e('teoria', 90), e('teoria', 91)], false)), 91);
  assert.equal(promedioFirma(firma([e('teoria', 90), e('teoria', 90.8)], false)), 90);
  // Firma asegurada pero con un parcial pendiente: el promedio todavía no es el final.
  assert.equal(promedioFirma(firma([e('teoria', 100), e('teoria', 100), e('teoria', 0, false)], false)), null);
  // Con un parcial pendiente que todavía puede bajarla, no se da por cerrada.
  assert.equal(promedioFirma(firma([e('teoria', 55), e('teoria', 0, false), e('laboratorio', 80)])), null);
});
