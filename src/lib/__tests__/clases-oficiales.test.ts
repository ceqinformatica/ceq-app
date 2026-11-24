/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesDeMisMaterias, seccionSugerida, type ClaseOficial } from '../clases-oficiales.ts';

const c = (materia: string, dia: number, inicio: string, seccion: string | null = null): ClaseOficial => ({
  materia, nivel: 3, seccion, dia_semana: dia, hora_inicio: inicio, hora_fin: '23:00', aula: null, tipo_clase: null,
});

test('agrupa por materia y sección, y marca lo que ya está en la agenda', () => {
  const oficiales = [
    c('QUÍMICA ANALÍTICA I', 1, '07:30', 'A'), c('Química Analítica I', 3, '13:30', 'A'),
    c('Química Analítica I', 2, '07:30', 'B'), c('Fisicoquímica I', 1, '10:00'), c('Bioquímica', 2, '08:00'),
  ];
  const mias = [{ id: 'qa1', nombre: 'Química Analítica I' }, { id: 'fq1', nombre: 'Fisicoquímica I' }, { id: 'mic', nombre: 'Microbiología' }];
  const agenda = [{ materia_id: 'fq1', dia_semana: 1, hora_inicio: '10:00:00' }];
  const r = clasesDeMisMaterias(oficiales, mias, agenda);
  assert.deepEqual(r.faltan, ['Microbiología']);
  assert.equal(r.materias.length, 2);
  const qa = r.materias[0];
  assert.deepEqual(qa.secciones.map((s) => [s.seccion, s.clases.length]), [['A', 2], ['B', 1]]);
  assert.equal(seccionSugerida(qa), 'A');
  const fq = r.materias[1];
  assert.equal(fq.secciones[0].seccion, null);
  assert.equal(fq.secciones[0].clases[0].yaEsta, true);
});

test('sugiere la sección que ya tenés cargada', () => {
  const r = clasesDeMisMaterias([c('Física II', 1, '07:00', 'A'), c('Física II', 2, '09:00', 'B')], [{ id: 'f2', nombre: 'Física II' }], [{ materia_id: 'f2', dia_semana: 2, hora_inicio: '09:00' }]);
  assert.equal(seccionSugerida(r.materias[0]), 'B');
});
