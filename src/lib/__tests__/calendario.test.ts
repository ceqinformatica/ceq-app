import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CALENDARIO_FCQ_2026 } from '../../datos/calendario-fcq.ts';
import { CATEGORIAS_CALENDARIO, cuando, destacados, filtrar, hoyPy, momento, porMes, problemaEvento, rango, type EventoCalendario } from '../calendario.ts';
import { sqlCalendario } from '../../../scripts/seed-calendario.ts';

const ev = (id: string, desde: string, hasta = desde, categoria: EventoCalendario['categoria'] = 'examenes'): EventoCalendario =>
  ({ id, anio: 2026, semestre: 2, categoria, titulo: id, desde, hasta, detalle: null });

test('momento y cuándo', () => {
  const hoy = '2026-11-23';
  assert.equal(momento(ev('a', '2026-11-19', '2026-12-03'), hoy), 'ahora');
  assert.equal(momento(ev('a', '2026-11-24'), hoy), 'proximo');
  assert.equal(momento(ev('a', '2026-11-01', '2026-11-22'), hoy), 'pasado');
  assert.equal(cuando(ev('a', '2026-11-19', '2026-12-03'), hoy), 'Hasta el 3 dic');
  assert.equal(cuando(ev('a', '2026-11-19', '2026-11-23'), hoy), 'Termina hoy');
  assert.equal(cuando(ev('a', '2026-11-23'), hoy), 'Hoy');
  assert.equal(cuando(ev('a', '2026-11-24'), hoy), 'Mañana');
  assert.equal(cuando(ev('a', '2026-12-08'), hoy), 'En 15 días');
  assert.equal(cuando(ev('a', '2027-02-01'), hoy), 'El 1 feb');
});

test('rango de fechas', () => {
  assert.equal(rango('2026-11-23', '2026-11-23'), '23 nov');
  assert.equal(rango('2026-11-23', '2026-11-27'), '23 al 27 nov');
  assert.equal(rango('2026-11-19', '2026-12-03'), '19 nov al 3 dic');
  assert.equal(rango('2026-12-28', '2027-01-02'), '28 dic 2026 al 2 ene 2027');
});

test('hoy en Paraguay', () => {
  // 01:00 UTC del 24 es todavía el 23 en Paraguay.
  assert.equal(hoyPy(new Date('2026-11-24T01:00:00Z')), '2026-11-23');
  assert.equal(hoyPy(new Date('2026-11-24T04:00:00Z')), '2026-11-24');
});

test('destacados: lo en curso y lo próximo, sin clases ni pasados', () => {
  const hoy = '2026-11-23';
  const lista = [ev('pasado', '2026-11-01'), ev('clases', '2026-08-03', '2026-12-30', 'clases'), ev('lejos', '2026-12-25', '2026-12-25', 'feriado'), ev('insc', '2026-11-19', '2026-12-03'), ev('finales', '2026-11-23', '2026-12-05'), ev('cuota', '2026-11-30', '2026-11-30', 'aranceles')];
  assert.deepEqual(destacados(lista, hoy).map((e) => e.id), ['cuota', 'insc', 'finales']);
});

test('por mes y filtros', () => {
  const lista = [ev('b', '2026-12-07'), ev('a', '2026-11-19', '2026-12-03'), ev('c', '2026-12-25', '2026-12-25', 'feriado')];
  const meses = porMes(lista);
  assert.deepEqual(meses.map((m) => m.titulo), ['Noviembre 2026', 'Diciembre 2026']);
  assert.deepEqual(meses[1].eventos.map((e) => e.id), ['b', 'c']);
  assert.deepEqual(filtrar(lista, '2026-12-10', null, false).map((e) => e.id), ['c']);
  assert.deepEqual(filtrar(lista, '2026-12-10', 'feriado', true).map((e) => e.id), ['c']);
  assert.equal(filtrar(lista, '2026-12-10', null, true).length, 3);
});

test('validación de una fila', () => {
  assert.equal(problemaEvento({ titulo: 'Finales', desde: '2026-12-01', hasta: '2026-12-05' }), null);
  assert.match(problemaEvento({ titulo: 'Fi', desde: '2026-12-01', hasta: '2026-12-05' })!, /3 letras/);
  assert.match(problemaEvento({ titulo: 'Finales', desde: '2026-12-05', hasta: '2026-12-01' })!, /antes/);
});

test('la carga 2026 es coherente', () => {
  const claves = new Set(CALENDARIO_FCQ_2026.map((f) => f.clave));
  assert.equal(claves.size, CALENDARIO_FCQ_2026.length, 'claves repetidas');
  for (const f of CALENDARIO_FCQ_2026) {
    assert.equal(problemaEvento(f), null, f.clave);
    assert.ok((CATEGORIAS_CALENDARIO as readonly string[]).includes(f.categoria), f.clave);
  }
  assert.ok(CALENDARIO_FCQ_2026.length > 60);
});

test('la migración es la que genera el script', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/20261123120000_calendario_academico.sql', import.meta.url), 'utf8');
  assert.equal(sql, sqlCalendario(), 'Corré: node scripts/seed-calendario.ts > supabase/migrations/20261123120000_calendario_academico.sql');
});
