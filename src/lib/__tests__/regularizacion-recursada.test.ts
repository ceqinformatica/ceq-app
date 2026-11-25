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

test('vigencia de la firma: la app pide confirmarla, nunca la da por vencida (Art. 49 y 62)', async () => {
  const { vigenciaPorConfirmar, semestreOpuesto } = await import('../finales.ts');
  const f = (periodo: string, nota: number | null, tipo = 'final') => ({ periodo, nota, tipo });
  // Un periodo con aplazos: nada que revisar.
  assert.equal(vigenciaPorConfirmar([f('2026-1', 1), f('2026-1', 1)], '2026-1'), null);
  assert.equal(vigenciaPorConfirmar([f('2026-1', 1)], '2026-2'), null);
  // Dos periodos usados: nada mientras mira el segundo; en el siguiente, pide confirmar.
  assert.equal(vigenciaPorConfirmar([f('2026-1', 1), f('2026-2', 1)], '2026-2'), null);
  assert.deepEqual(vigenciaPorConfirmar([f('2026-1', 1), f('2026-2', 1)], '2027-1'), { periodos: ['2026-1', '2026-2'] });
  // Caso de la auditoría: dos ausencias en periodos distintos solo piden confirmar.
  assert.deepEqual(vigenciaPorConfirmar([f('2026-1', null, 'ausente'), f('2026-2', null, 'ausente')], '2027-1'), { periodos: ['2026-1', '2026-2'] });
  // ... y no bloquean el semestre opuesto ni obligan a recursar.
  assert.equal(semestreOpuesto({ finales: [{ ...f('2026-1', null, 'ausente'), llamado: 1 }, { ...f('2026-2', null, 'ausente'), llamado: 1 }], periodoActual: '2027-1' }).puede, true);
  // Si aprobó, nada.
  assert.equal(vigenciaPorConfirmar([f('2026-1', 1), f('2026-2', 3)], '2027-1'), null);
  // Al recursar, lo anterior no cuenta.
  assert.equal(vigenciaPorConfirmar([{ ...f('2025-1', 1), cursada_anterior: true }, { ...f('2025-2', 1), cursada_anterior: true }, f('2026-1', 1)], '2026-2'), null);
});

test('importados sin ubicar: el saldo de finales queda sin calcular', async () => {
  const { llamadosRestantes, finalesSinUbicar, semestreOpuesto } = await import('../finales.ts');
  // Caso de la auditoría: dos notas 1 importadas (sin llamado) no dejan "3 disponibles".
  const importados = [{ llamado: null, nota: 1, tipo: 'final', periodo: null }, { llamado: null, nota: 1, tipo: 'final', periodo: null }];
  assert.equal(finalesSinUbicar(importados).length, 2);
  assert.equal(llamadosRestantes(importados), null);
  assert.equal(semestreOpuesto({ finales: importados, periodoActual: '2026-2' }).motivo, 'sinUbicar');
  // Ubicados en esta cursada: queda uno.
  const ubicados = [{ llamado: 1, nota: 1, tipo: 'final', periodo: '2026-1' }, { llamado: 2, nota: 1, tipo: 'final', periodo: '2026-1' }];
  assert.equal(llamadosRestantes(ubicados), 1);
  // Tres aplazos importados sin ubicar no obligan a recursar (pueden ser de otra cursada).
  const { aplazosDeLaCursada } = await import('../finales.ts');
  assert.deepEqual(aplazosDeLaCursada([...importados, { ...importados[0] }]), { aplazos: 0, debeRecursar: false });
  // Uno pasado a una cursada anterior ya no cuenta.
  assert.equal(llamadosRestantes([ubicados[0], { ...importados[0], cursada_anterior: true }]), 2);
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
