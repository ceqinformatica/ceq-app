/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstadisticas, etiquetaPeriodo, notasAprobadas } from '../estadisticas.ts';
import type { IntentoFinal } from '../finales.ts';
import type { EstadoEstudiante, Materia } from '../progreso.ts';

const materias: Materia[] = [
  { id: 'a', nombre: 'Química General', semestre: 1, creditos: 6 },
  { id: 'b', nombre: 'Matemática I', semestre: 1, creditos: 4 },
  { id: 'c', nombre: 'Química Orgánica I', semestre: 2, creditos: 6 },
  { id: 'd', nombre: 'Física I', semestre: 2, creditos: 4 },
  { id: 's', nombre: 'Seminario de Ética', semestre: 2, creditos: 2 },
  { id: 'e', nombre: 'Química Analítica', semestre: 3, creditos: 6 },
  { id: 'o1', nombre: 'Optativa 1', semestre: 4, creditos: 3, grupoOptativaId: 'g' },
  { id: 'o2', nombre: 'Optativa 2', semestre: 4, creditos: 3, grupoOptativaId: 'g' },
];
const grupos = [{ id: 'g', nombre: 'Optativas', cantidadExigida: 1 }];
const est = (o: Record<string, EstadoEstudiante>) => new Map(Object.entries(o));

const estados = est({
  a: { estado: 'aprobada', notaFinal: 4, promedioFirma: 80 },
  b: { estado: 'aprobada', notaFinal: 2, promedioFirma: 61 },
  c: { estado: 'aprobada', notaFinal: null },
  s: { estado: 'aprobada', notaFinal: null },
  d: { estado: 'firmada' },
  e: { estado: 'cursando' },
});
const intentos: IntentoFinal[] = [
  { materiaId: 'a', nota: 4, periodo: '2025-1', llamado: 1 },
  { materiaId: 'b', nota: 1, periodo: '2025-1', llamado: 1 },
  { materiaId: 'b', nota: 2, periodo: '2025-2', llamado: 1 },
  { materiaId: 'c', nota: 5, periodo: '2025-2', llamado: 2 },
  { materiaId: 'd', nota: 1, periodo: '2025-2', llamado: 1 },
];

test('etiqueta del periodo', () => {
  assert.equal(etiquetaPeriodo('2026-1'), '1.er sem. 2026');
  assert.equal(etiquetaPeriodo('2025-2'), '2.º sem. 2025');
  assert.equal(etiquetaPeriodo('raro'), 'raro');
});

test('notas aprobadas: mejor final, o la nota cargada; sin seminarios', () => {
  const n = notasAprobadas(materias, estados, intentos);
  assert.deepEqual(Object.fromEntries(n), { a: 4, b: 2, c: 5 });
});

test('estadísticas generales', () => {
  const e = calcularEstadisticas(materias, grupos, estados, intentos);
  assert.equal(e.promedio, 3.67); // (4 + 2 + 5) / 3
  assert.equal(e.promedioConAplazos, 2.6); // (4 + 1 + 2 + 5 + 1) / 5
  assert.equal(e.aplazos, 2);
  assert.equal(e.promedioPonderado, null);
  assert.equal(e.promedioFirma, 70.5);
  assert.equal(e.aprobadas, 4); // a, b, c y el seminario
  assert.equal(e.firmadas, 1);
  assert.equal(e.cursando, 1);
  assert.equal(e.exigidas, 7); // 6 obligatorias + 1 optativa
  assert.equal(e.faltan, 3); // d, e y una optativa
  assert.deepEqual(e.nivelesPendientes, [2, 3]);
  assert.deepEqual(e.distribucion, [
    { nota: 2, cantidad: 1 },
    { nota: 3, cantidad: 0 },
    { nota: 4, cantidad: 1 },
    { nota: 5, cantidad: 1 },
  ]);
  assert.equal(e.finalesRendidos, 5);
  assert.equal(e.finalesAprobados, 3);
  assert.equal(e.efectividad, 60);
});

test('notas por nivel', () => {
  const e = calcularEstadisticas(materias, grupos, estados, intentos);
  assert.deepEqual(e.porNivel, [
    { nivel: 1, total: 2, aprobadas: 2, promedio: 3 },
    { nivel: 2, total: 3, aprobadas: 2, promedio: 5 },
    { nivel: 3, total: 1, aprobadas: 0, promedio: null },
  ]);
});

test('evolución por semestre con promedio acumulado', () => {
  const e = calcularEstadisticas(materias, grupos, estados, intentos);
  assert.deepEqual(e.porPeriodo, [
    { periodo: '2025-1', etiqueta: '1.er sem. 2025', aprobados: 1, aplazos: 1, promedio: 4, acumulado: 4 },
    { periodo: '2025-2', etiqueta: '2.º sem. 2025', aprobados: 2, aplazos: 1, promedio: 3.5, acumulado: 3.67 },
  ]);
});

test('promedio ponderado por créditos', () => {
  const e = calcularEstadisticas(materias, grupos, estados, intentos, 'creditos');
  // (4·6 + 2·4 + 5·6) / 16 = 62 / 16
  assert.equal(e.promedioPonderado, 3.88);
});

test('sin nada cargado', () => {
  const e = calcularEstadisticas(materias, grupos, new Map(), []);
  assert.equal(e.promedio, null);
  assert.equal(e.efectividad, null);
  assert.equal(e.faltan, 7);
  assert.deepEqual(e.porPeriodo, []);
  assert.equal(e.progreso.porcentaje, 0);
});

test('aprobar más optativas de las exigidas no da "faltan" negativo', () => {
  const todo = est(Object.fromEntries(materias.map((m) => [m.id, { estado: 'aprobada' as const, notaFinal: 3 }])));
  const e = calcularEstadisticas(materias, grupos, todo, []);
  assert.equal(e.faltan, 0);
  assert.deepEqual(e.nivelesPendientes, []);
});

test('una nota de aprobación fuera de 2 a 5 no entra en ningún promedio', () => {
  const raro = est({ a: { estado: 'aprobada', notaFinal: 1.5 }, b: { estado: 'aprobada', notaFinal: 4 } });
  const e = calcularEstadisticas(materias, grupos, raro, []);
  assert.equal(e.promedio, 4);
  assert.equal(e.distribucion.reduce((s, d) => s + d.cantidad, 0), 1);
});

test('optativas debajo de los niveles', () => {
  const sinOpt = calcularEstadisticas(materias, grupos, estados, intentos);
  assert.deepEqual(sinOpt.optativas, { aprobadas: 0, total: 1, promedio: null });
  const conOpt = calcularEstadisticas(materias, grupos, new Map([...estados, ['o1', { estado: 'aprobada', notaFinal: 4 }], ['o2', { estado: 'aprobada', notaFinal: 5 }]]), intentos);
  // Exige 1: cuenta 1 de 1, pero el promedio usa las dos aprobadas.
  assert.deepEqual(conOpt.optativas, { aprobadas: 1, total: 1, promedio: 4.5 });
  assert.equal(calcularEstadisticas(materias.filter((m) => !m.grupoOptativaId), [], estados, intentos).optativas, null);
});

test('una materia devuelta a firmada no cuenta su aprobado en ningún dato', () => {
  const ms: Materia[] = [
    { id: 'x', nombre: 'Química General', semestre: 1, creditos: 6 },
    { id: 'y', nombre: 'Matemática I', semestre: 1, creditos: 6 },
  ];
  const es = est({ x: { estado: 'firmada' }, y: { estado: 'aprobada', notaFinal: 4 } });
  const is: IntentoFinal[] = [
    { materiaId: 'x', nota: 5, periodo: '2025-1', llamado: 1 },
    { materiaId: 'y', nota: 4, periodo: '2025-1', llamado: 1 },
  ];
  const r = calcularEstadisticas(ms, [], es, is, 'creditos');
  assert.equal(r.promedio, 4);
  assert.equal(r.promedioConAplazos, 4);
  assert.equal(r.promedioPonderado, 4);
  assert.deepEqual(r.distribucion.find((d) => d.nota === 5)?.cantidad, 0);
  assert.equal(r.porNivel[0].promedio, 4);
  assert.equal(r.finalesAprobados, 1);
  assert.equal(r.porPeriodo[0].promedio, 4);
  assert.equal(notasAprobadas(ms, es, is).has('x'), false);
});
