/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularProgreso, estaDesbloqueada, promedioGeneral, seDesbloquean, type EstadoEstudiante, type Materia, type Prerrequisito } from '../progreso.ts';

const materias: Materia[] = [
  { id: 'a', nombre: 'Química General', semestre: 1, horas: 90 },
  { id: 'b', nombre: 'Química Orgánica I', semestre: 2, horas: 90 },
  { id: 'c', nombre: 'Química Orgánica II', semestre: 3, horas: 60 },
  { id: 'o1', nombre: 'Optativa 1', semestre: 8, horas: 30, grupoOptativaId: 'g' },
  { id: 'o2', nombre: 'Optativa 2', semestre: 8, horas: 30, grupoOptativaId: 'g' },
  { id: 'o3', nombre: 'Optativa 3', semestre: 8, horas: 30, grupoOptativaId: 'g' },
];
const grupos = [{ id: 'g', nombre: 'Optativas', cantidadExigida: 2 }];
const prer: Prerrequisito[] = [
  { materiaId: 'b', requiereId: 'a', tipo: 'firmada' },
  { materiaId: 'c', requiereId: 'b', tipo: 'aprobada' },
];
const est = (o: Record<string, EstadoEstudiante>) => new Map(Object.entries(o));

test('desbloqueo por prerrequisitos', () => {
  const e = est({ a: { estado: 'firmada' } });
  assert.equal(estaDesbloqueada('b', prer, e), true);
  assert.equal(estaDesbloqueada('c', prer, e), false);
  assert.deepEqual(seDesbloquean('b', 'aprobada', prer, est({ a: { estado: 'aprobada' }, b: { estado: 'firmada' } })), ['c']);
});

test('progreso por materias con optativas', () => {
  // 3 obligatorias + 2 optativas exigidas = 5; aprobadas: a, o1, o2, o3 (solo cuentan 2) -> 3/5
  const p = calcularProgreso(materias, grupos, est({ a: { estado: 'aprobada' }, o1: { estado: 'aprobada' }, o2: { estado: 'aprobada' }, o3: { estado: 'aprobada' } }));
  assert.equal(p.total, 5);
  assert.equal(p.aprobado, 3);
  assert.equal(p.porcentaje, 60);
  assert.equal(p.optativas[0].aprobadas, 3);
});

test('progreso por horas', () => {
  const p = calcularProgreso(materias, grupos, est({ a: { estado: 'aprobada' } }), 'horas');
  assert.equal(p.total, 300);
  assert.equal(p.porcentaje, 30);
});

test('promedio general', () => {
  const e = est({ a: { estado: 'aprobada', notaFinal: 5 }, b: { estado: 'aprobada', notaFinal: 3 }, c: { estado: 'firmada' } });
  assert.equal(promedioGeneral(materias, e), 4);
  assert.equal(promedioGeneral(materias, e, 'horas'), 4);
});
