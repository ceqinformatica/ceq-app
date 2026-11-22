/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emparejar, leerExtracto, parecido, planDeImportacion } from '../extracto-ealu.ts';

const texto = readFileSync(new URL('./fixtures/extracto-ealu.txt', import.meta.url), 'utf8');

test('lee carrera, plan, filas y promedio', () => {
  const e = leerExtracto(texto);
  assert.equal(e.carrera, 'INGENIERIA QUIMICA');
  assert.equal(e.plan, 2018);
  assert.equal(e.promedio, 4.28);
  assert.equal(e.filas.length, 10);
  const fq = e.filas.find((f) => f.nombre === 'Fisicoquimica')!;
  assert.deepEqual(
    { fecha: fq.fecha, acta: fq.acta, puntaje: fq.puntaje, nota: fq.nota, bloque: fq.bloque },
    { fecha: '2026-06-16', acta: '62042', puntaje: 65, nota: 3, bloque: 'QUINTO NIVEL' },
  );
  const sem = e.filas.find((f) => f.nombre === 'Seminario I')!;
  assert.equal(sem.nota, null);
  const opt = e.filas.find((f) => f.numero === 27)!;
  assert.equal(opt.nombre, 'Recursos Naturales del Paraguay');
  assert.equal(opt.optativa, true);
  const ext = e.filas.find((f) => f.numero === 28)!;
  assert.equal(ext.fecha, '2026-11-09');
  assert.equal(ext.acta, null);
});

test('parecido ignora tildes y respeta los números', () => {
  assert.equal(parecido('Quimica Inorganica', 'Química Inorgánica'), 1);
  assert.equal(parecido('Fisica I', 'Física II'), 0);
  assert.equal(parecido('Calculo I', 'Cálculo 1'), 1);
});

test('empareja con las materias del plan', () => {
  const materias = [
    { id: 'qg', nombre: 'Química General' },
    { id: 'f1', nombre: 'Física I' },
    { id: 'f2', nombre: 'Física II' },
    { id: 'mic', nombre: 'Metodología de la Investigación Científica' },
  ];
  const r = emparejar(leerExtracto(texto).filas, materias);
  const de = (n: string) => r.find((c) => c.fila.nombre === n)!;
  assert.equal(de('Quimica General').materia?.id, 'qg');
  assert.equal(de('Fisica I').materia?.id, 'f1');
  assert.equal(de('Metodologia de la Investigacion Cientifica').confianza, 1);
  assert.equal(de('Fisicoquimica').materia, null);
});

test('prefiere la coincidencia exacta aunque venga después', () => {
  const filas = leerExtracto('1)  Bioquimica   01/07/2025   1   4   (CUATRO)\n').filas;
  const r = emparejar(filas, [
    { id: 'ib', nombre: 'Ingeniería Bioquímica' },
    { id: 'bq', nombre: 'Bioquímica' },
  ]);
  assert.equal(r[0].materia?.id, 'bq');
  assert.equal(r[0].confianza, 1);
});

test('plan de importación: intentos, aprobadas sin nota y repetidas', () => {
  const r = emparejar(leerExtracto(texto).filas, [
    { id: 'qg', nombre: 'Química General' },
    { id: 'f1', nombre: 'Física I' },
    { id: 's1', nombre: 'Seminario I' },
  ]);
  const qg = r.find((c) => c.materia?.id === 'qg')!;
  const plan = planDeImportacion(r, [{ materia_id: qg.materia!.id, fecha: qg.fila.fecha, nota: qg.fila.nota! }], new Set());
  assert.deepEqual(plan.intentos.map((i) => i.materia_id), ['f1']);
  assert.deepEqual(plan.aprobadasSinNota, ['s1']);
  assert.equal(plan.repetidas, 1);
  // Ya aprobada a mano: no se vuelve a marcar.
  assert.deepEqual(planDeImportacion(r, [], new Set(['s1'])).aprobadasSinNota, []);
});
