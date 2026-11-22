/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intentosDe, notaAprobada, promedios, type IntentoFinal } from '../finales.ts';
import type { EstadoEstudiante } from '../progreso.ts';

const materias = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('1 en el primer llamado y 5 en el segundo', () => {
  const intentos: IntentoFinal[] = [
    { materiaId: 'a', nota: 1, llamado: 1, periodo: '2025-1' },
    { materiaId: 'a', nota: 5, llamado: 2, periodo: '2025-1' },
    { materiaId: 'b', nota: 3, llamado: 1, periodo: '2025-1' },
  ];
  assert.equal(notaAprobada('a', intentos), 5);
  assert.deepEqual(intentosDe('a', intentos).map((i) => i.nota), [1, 5]);
  const p = promedios(materias, new Map(), intentos);
  assert.equal(p.sinAplazos, 4); // (5 + 3) / 2
  assert.equal(p.conAplazos, 3); // (1 + 5 + 3) / 3
  assert.equal(p.aplazos, 1);
});

test('materias aprobadas en bloque sin intentos cuentan su nota una vez', () => {
  const estados = new Map<string, EstadoEstudiante>([
    ['c', { estado: 'aprobada', notaFinal: 4 }],
    ['b', { estado: 'aprobada', notaFinal: null }],
  ]);
  const p = promedios(materias, estados, [{ materiaId: 'a', nota: 1 }]);
  assert.equal(p.sinAplazos, 4);
  assert.equal(p.conAplazos, 2.5); // (1 + 4) / 2
});

test('sin notas no hay promedio', () => {
  assert.deepEqual(promedios(materias, new Map(), []), { sinAplazos: null, conAplazos: null, aplazos: 0 });
});
