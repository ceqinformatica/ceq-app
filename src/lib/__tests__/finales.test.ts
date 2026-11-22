/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intentosDe, notaAprobada, notaDelLlamado, periodoDe, promedios, type IntentoFinal } from '../finales.ts';
import { calificacionFinal } from '../reglamento-fcq.ts';
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

test('periodo académico de una fecha', () => {
  assert.equal(periodoDe(new Date(2026, 1, 10)), '2026-1');
  assert.equal(periodoDe(new Date(2026, 6, 31)), '2026-1');
  assert.equal(periodoDe(new Date(2026, 10, 22)), '2026-2');
  assert.equal(periodoDe(new Date(2027, 0, 15)), '2026-2');
});

test('nota de cada llamado: 40 % firma + 60 % final, o nota directa', () => {
  // Firma 70 %, final 90 % → 0,4·70 + 0,6·90 = 82 → 4.
  assert.equal(notaDelLlamado(70, 90, null, calificacionFinal), 4);
  // Final por debajo de 60 %: aplazo.
  assert.equal(notaDelLlamado(95, 55, null, calificacionFinal), 1);
  // Sin firma guardada: vale la nota que cargó.
  assert.equal(notaDelLlamado(null, 90, 3, calificacionFinal), 3);
  // Llamado vacío.
  assert.equal(notaDelLlamado(70, null, null, calificacionFinal), null);
});

test('ejemplos de Josie: llamados vacíos no cuentan, los aplazos sí', () => {
  const materias = [{ id: 'a' }, { id: 'b' }];
  const intentos = [
    { materiaId: 'a', llamado: 2, nota: 5 },
    { materiaId: 'b', llamado: 1, nota: 1 },
    { materiaId: 'b', llamado: 3, nota: 2 },
  ];
  const p = promedios(materias, new Map(), intentos);
  assert.equal(p.sinAplazos, 3.5); // (5 + 2) / 2
  assert.equal(p.conAplazos, 2.67); // (5 + 1 + 2) / 3
  assert.equal(p.aplazos, 1);
});
