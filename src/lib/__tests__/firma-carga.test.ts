/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASISTENCIA_CUMPLIDA, conParcialesMinimos, esAsistenciaContada, esAsistenciaCumplida, esPredefinida, idPredefinido } from '../firma-carga.ts';
import { periodosParaFinales, promedios, recuReguDespuesDeFinal } from '../finales.ts';
import { evaluarAsistencia } from '../firma.ts';
import type { EstadoEstudiante } from '../progreso.ts';

type E = { id: string; nombre: string; componente: string; rendida: boolean };
const crear = (nombre: string, orden: number): E => ({ id: idPredefinido(orden), nombre, componente: 'teoria', rendida: false });

test('sin parciales aparecen el primero y el segundo, pendientes', () => {
  const r = conParcialesMinimos<E>([], crear);
  assert.deepEqual(r.map((e) => e.nombre), ['Primer parcial', 'Segundo parcial']);
  assert.ok(r.every((e) => esPredefinida(e) && !e.rendida));
});

test('con un parcial se agrega solo el segundo, antes del laboratorio', () => {
  const r = conParcialesMinimos<E>([
    { id: 'a', nombre: 'Parcial 1', componente: 'teoria', rendida: true },
    { id: 'l', nombre: 'Laboratorio', componente: 'laboratorio', rendida: true },
  ], crear);
  assert.deepEqual(r.map((e) => e.nombre), ['Parcial 1', 'Segundo parcial', 'Laboratorio']);
});

test('con dos parciales (o más) no se agrega nada; el recuperatorio no cuenta como parcial', () => {
  const dos: E[] = [
    { id: 'a', nombre: 'P1', componente: 'teoria', rendida: true },
    { id: 'b', nombre: 'P2', componente: 'teoria', rendida: false },
  ];
  assert.equal(conParcialesMinimos(dos, crear), dos);
  const r = conParcialesMinimos<E>([{ id: 'r', nombre: 'Recuperatorio', componente: 'teoria', rendida: true }], crear);
  assert.deepEqual(r.map((e) => e.nombre), ['Primer parcial', 'Segundo parcial', 'Recuperatorio']);
});

test('la casilla de asistencia cumple el mínimo y no se confunde con la contada', () => {
  assert.ok(esAsistenciaCumplida(ASISTENCIA_CUMPLIDA));
  assert.ok(!esAsistenciaContada(ASISTENCIA_CUMPLIDA));
  assert.ok(!esAsistenciaCumplida({ clases_dictadas: 1, clases_asistidas: 1, clases_totales: null }));
  assert.ok(esAsistenciaContada({ clases_dictadas: 1, clases_asistidas: 1, clases_totales: null }));
  const r = evaluarAsistencia({ clasesDictadas: 1, clasesAsistidas: 1, clasesTotales: 0 }, 75);
  assert.equal(r.porcentaje, 100);
  assert.equal(r.faltasDisponibles, null);
  assert.equal(r.semaforo, 'verde');
});

test('Regu después de rendir un final no vale (ejemplo de Josie)', () => {
  const final1 = { periodo: '2026-2', llamado: 1, tipo: 'final', nota: 4 };
  const regu2 = { periodo: '2026-2', llamado: 2, tipo: 'regularizacion', nota: null };
  assert.equal(recuReguDespuesDeFinal([regu2, final1]), regu2);
  // Al revés sí: regularizó en el 1.º y rindió el final en el 2.º.
  assert.equal(recuReguDespuesDeFinal([{ ...regu2, llamado: 1 }, { ...final1, llamado: 2 }]), null);
  // También entre semestres: final en el anterior, Regu en este.
  assert.ok(recuReguDespuesDeFinal([{ ...final1, periodo: '2026-1', nota: 1 }, { ...regu2, llamado: 1 }]));
});

test('semestres para cargar finales: desde la firma hasta hoy', () => {
  assert.deepEqual(periodosParaFinales('2026-2', '2026-2'), ['2026-2']);
  // Firmó en el 1.º: el 2.º es el semestre opuesto.
  assert.deepEqual(periodosParaFinales('2026-1', '2026-2'), ['2026-2', '2026-1']);
  // Sin saber cuándo firmó: este y el anterior.
  assert.deepEqual(periodosParaFinales(null, '2026-2'), ['2026-2', '2026-1']);
  // Como mucho cuatro desde la firma, más los que tienen finales.
  assert.deepEqual(periodosParaFinales('2023-1', '2026-2', ['2022-2']), ['2026-2', '2024-2', '2024-1', '2023-2', '2023-1', '2022-2']);
});

test('un final aprobado no cuenta si la materia volvió a firmada', () => {
  const estados = new Map<string, EstadoEstudiante>([['a', { estado: 'firmada' }], ['b', { estado: 'aprobada', notaFinal: 4 }]]);
  const p = promedios([{ id: 'a' }, { id: 'b' }], estados, [
    { materiaId: 'a', nota: 5 },
    { materiaId: 'a', nota: 1 },
    { materiaId: 'b', nota: 4 },
  ]);
  assert.equal(p.sinAplazos, 4);
  assert.equal(p.conAplazos, 2.5); // (1 + 4) / 2
});
