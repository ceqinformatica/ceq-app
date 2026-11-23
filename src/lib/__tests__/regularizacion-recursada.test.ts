/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplazosDeLaCursada, esSeminario, notaAprobada, periodoAlCambiar, promedios, type IntentoFinal } from '../finales.ts';
import { pesosIguales, evaluarFirma, type Evaluacion } from '../firma.ts';
import { REGLA_FCQ, aplicarRecuperatorio, aplicarRegularizacion } from '../reglamento-fcq.ts';
import { promedioGeneral, type EstadoEstudiante } from '../progreso.ts';

const ev = (o: Partial<Evaluacion>): Evaluacion => ({ nombre: 'Parcial', componente: 'teoria', ponderacion: 1, rendida: true, ...o });

test('regularización ocupa el lugar del único parcial faltado', () => {
  const r = aplicarRegularizacion([
    ev({ nombre: '1.er parcial', porcentaje: 70 }),
    ev({ nombre: '2.º parcial', rendida: false }),
    ev({ nombre: '3.er parcial', porcentaje: 50 }),
    ev({ nombre: 'Regularización', porcentaje: 66 }),
  ]);
  assert.equal(r.regularizado, true);
  assert.equal(r.evaluaciones.length, 3);
  assert.deepEqual(r.evaluaciones.map((e) => e.porcentaje), [70, 66, 50]);
  assert.ok(r.evaluaciones.every((e) => e.rendida));
  // Con la regularización la teoría da 62: firma.
  const f = evaluarFirma({ regla: REGLA_FCQ, tieneLaboratorio: false, evaluaciones: pesosIguales(r.evaluaciones), asistencia: null, asistenciaLab: null });
  assert.equal(f.teoria.actual, 62);
  assert.equal(f.teoria.necesario, null);
});

test('con dos parciales faltados no se puede regularizar', () => {
  const r = aplicarRegularizacion([
    ev({ porcentaje: 80 }),
    ev({ rendida: false }),
    ev({ rendida: false }),
    ev({ nombre: 'regularizacion', porcentaje: 90 }),
  ]);
  assert.equal(r.regularizado, false);
  assert.equal(r.motivo, 'dos-faltas');
  assert.equal(r.evaluaciones.length, 3);
});

test('regularización sin parcial faltado o sin nota no cuenta', () => {
  const sinFalta = aplicarRegularizacion([ev({ porcentaje: 80 }), ev({ nombre: 'Regularización', porcentaje: 30 })]);
  assert.equal(sinFalta.motivo, 'sin-falta');
  assert.deepEqual(sinFalta.evaluaciones.map((e) => e.porcentaje), [80]);
  const sinNota = aplicarRegularizacion([ev({ rendida: false }), ev({ nombre: 'Regularización', rendida: false })]);
  assert.equal(sinNota.motivo, 'sin-nota');
  assert.equal(sinNota.evaluaciones.length, 1);
});

test('sin regularización las evaluaciones no cambian', () => {
  const evals = [ev({ porcentaje: 80 }), ev({ nombre: 'Laboratorio', componente: 'laboratorio', porcentaje: 70 })];
  const r = aplicarRegularizacion(evals);
  assert.equal(r.evaluaciones, evals);
  assert.equal(r.motivo, null);
});

test('regularización y después recuperatorio', () => {
  const reg = aplicarRegularizacion([
    ev({ porcentaje: 30 }),
    ev({ rendida: false }),
    ev({ nombre: 'Regularización', porcentaje: 40 }),
    ev({ nombre: 'Recuperatorio', porcentaje: 70 }),
  ]);
  const rec = aplicarRecuperatorio(reg.evaluaciones);
  assert.equal(rec.recuperado, true);
  assert.deepEqual(rec.evaluaciones.map((e) => e.porcentaje), [70, 40]);
});

test('los seminarios se reconocen por el nombre', () => {
  assert.equal(esSeminario('Seminario I'), true);
  assert.equal(esSeminario('Seminario de Orientación Profesional'), true);
  assert.equal(esSeminario('Química General'), false);
});

test('los seminarios no entran en el promedio', () => {
  const estados = new Map<string, EstadoEstudiante>([
    ['sem', { estado: 'aprobada', notaFinal: 5 }],
    ['q', { estado: 'aprobada', notaFinal: 3 }],
  ]);
  const p = promedios([{ id: 'sem', nombre: 'Seminario I' }, { id: 'q', nombre: 'Química' }], estados, []);
  assert.equal(p.sinAplazos, 3);
  const g = promedioGeneral([{ id: 'sem', nombre: 'Seminario I', semestre: 1 }, { id: 'q', nombre: 'Química', semestre: 1 }], estados);
  assert.equal(g, 3);
});

test('un llamado usado para regularizar no cuenta como final', () => {
  const intentos: IntentoFinal[] = [
    { materiaId: 'a', nota: 1, llamado: 1, periodo: '2025-1', tipo: 'regularizacion' },
    { materiaId: 'a', nota: 4, llamado: 2, periodo: '2025-1' },
  ];
  const p = promedios([{ id: 'a' }], new Map(), intentos);
  assert.equal(p.aplazos, 0);
  assert.equal(p.conAplazos, 4);
  assert.equal(notaAprobada('a', [{ materiaId: 'a', nota: 5, tipo: 'regularizacion' }]), null);
});

test('tres aplazos en la cursada: hay que recursar', () => {
  const f = (nota: number | null, extra: object = {}) => ({ nota, created_at: '2026-01-01T00:00:00Z', ...extra });
  assert.deepEqual(aplazosDeLaCursada([f(1), f(1), f(1)]), { aplazos: 3, debeRecursar: true });
  assert.deepEqual(aplazosDeLaCursada([f(1), f(1)]), { aplazos: 2, debeRecursar: false });
  // La regularización no es un aplazo.
  assert.deepEqual(aplazosDeLaCursada([f(1), f(1), f(null, { tipo: 'regularizacion' })]), { aplazos: 2, debeRecursar: false });
  // Si aprobó, no recursa.
  assert.equal(aplazosDeLaCursada([f(1), f(1), f(1), f(3)]).debeRecursar, false);
  // Los de la cursada anterior no cuentan para los tres llamados.
  assert.deepEqual(
    aplazosDeLaCursada([f(1, { cursada_anterior: true }), f(1, { cursada_anterior: true }), f(1, { cursada_anterior: true }), f(1)]),
    { aplazos: 1, debeRecursar: false },
  );
});

test('la firma vence después de dos periodos sin aprobar (Art. 49 y 62)', async () => {
  const { firmaVencida } = await import('../finales.ts');
  const f = (periodo: string, nota: number | null, tipo = 'final') => ({ periodo, nota, tipo });
  // Un periodo con aplazos: sigue vigente.
  assert.equal(firmaVencida([f('2026-1', 1), f('2026-1', 1)], '2026-1'), false);
  assert.equal(firmaVencida([f('2026-1', 1)], '2026-2'), false);
  // Dos periodos usados: vigente mientras mira el segundo, vencida en el siguiente.
  assert.equal(firmaVencida([f('2026-1', 1), f('2026-2', 1)], '2026-2'), false);
  assert.equal(firmaVencida([f('2026-1', 1), f('2026-2', 1)], '2027-1'), true);
  // La regularización también usa el periodo (Art. 50).
  assert.equal(firmaVencida([f('2026-1', null, 'regularizacion'), f('2026-2', 1)], '2027-1'), true);
  // Si aprobó, no vence nada.
  assert.equal(firmaVencida([f('2026-1', 1), f('2026-2', 3)], '2027-1'), false);
  // Al recursar, lo anterior no cuenta.
  assert.equal(firmaVencida([{ ...f('2025-1', 1), cursada_anterior: true }, { ...f('2025-2', 1), cursada_anterior: true }, f('2026-1', 1)], '2026-2'), false);
});

test('periodoAlCambiar: el semestre de la firma para la agenda', () => {
  // Al firmar o aprobar desde la materia: este semestre.
  assert.equal(periodoAlCambiar('cursando', null, 'firmada', '2026-2'), '2026-2');
  assert.equal(periodoAlCambiar(null, null, 'aprobada', '2026-2'), '2026-2');
  // Sin cambio de estado, o de firmada a aprobada: se conserva.
  assert.equal(periodoAlCambiar('firmada', '2026-1', 'firmada', '2026-2'), '2026-1');
  assert.equal(periodoAlCambiar('firmada', '2026-2', 'aprobada', '2027-1'), '2026-2');
  // Volver a cursando o pendiente lo borra.
  assert.equal(periodoAlCambiar('firmada', '2026-2', 'cursando', '2026-2'), null);
});
