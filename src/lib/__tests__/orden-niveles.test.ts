import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararPorNivel, nivelesPorMateria } from '../orden-niveles.ts';

const fichas = [
  { nombre: 'Química Analítica I', plan: 2018, nivel: 3, orden: 15 },
  { nombre: 'Álgebra', plan: 2018, nivel: 1, orden: 2 },
  { nombre: 'Cálculo I', plan: 2018, nivel: 1, orden: 1 },
  { nombre: 'Física II', plan: 2018, nivel: 2, orden: 9 },
  { nombre: 'Física II', plan: 2026, nivel: 3, orden: 12 },
];

test('ordena por nivel y por el orden de la malla, no alfabéticamente', () => {
  const n = nivelesPorMateria(fichas);
  const lista = ['Química Analítica I', 'Álgebra', 'Física II', 'Cálculo I', 'Desconocida'].sort((a, b) => compararPorNivel(n, a, b));
  assert.deepEqual(lista, ['Cálculo I', 'Álgebra', 'Física II', 'Química Analítica I', 'Desconocida']);
});

test('con un plan elegido manda el nivel de ese plan', () => {
  assert.equal(nivelesPorMateria(fichas, 2026).get('Física II')?.nivel, 3);
  assert.equal(nivelesPorMateria(fichas, 2018).get('Física II')?.nivel, 2);
  assert.equal(nivelesPorMateria(fichas).get('Física II')?.nivel, 2);
});
