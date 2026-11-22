/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIA_TRAMITES_FCQ } from '../../datos/guia-tramites-fcq.ts';
import { aFormulario, agruparPorCategoria, esHttps, CATEGORIAS_TRAMITE, filtrarTramites, lineas, normalizar, sqlSemilla, validarTramite } from '../tramites.ts';

const migracion = readFileSync(new URL('../../../supabase/migrations/20261122190000_guia_tramites.sql', import.meta.url), 'utf8');

test('la migración está al día con la guía (correr node scripts/seed-tramites.ts)', () => {
  assert.ok(migracion.includes(sqlSemilla(GUIA_TRAMITES_FCQ)));
});

test('la guía inicial es coherente', () => {
  const claves = GUIA_TRAMITES_FCQ.map((t) => t.clave);
  assert.equal(new Set(claves).size, claves.length, 'claves repetidas');
  for (const t of GUIA_TRAMITES_FCQ) {
    assert.match(t.clave ?? '', /^[a-z0-9-]+$/, `clave inválida en ${t.nombre}`);
    assert.ok((CATEGORIAS_TRAMITE as readonly string[]).includes(t.categoria), `categoría desconocida en ${t.nombre}`);
    assert.ok(t.pasos.length > 0, `${t.nombre} sin pasos`);
    for (const u of [t.formulario_url, t.fuente_url]) if (u) assert.match(u, /^https:\/\//, `${t.nombre}: ${u}`);
    // Lo que se edita en el panel vuelve igual al guardarlo.
    const r = validarTramite(aFormulario(t), t.clave);
    assert.ok('tramite' in r, `${t.nombre}: ${'error' in r ? r.error : ''}`);
    if ('tramite' in r) assert.deepEqual(r.tramite, t);
  }
});

test('busca sin tildes ni mayúsculas y por varias palabras', () => {
  assert.equal(normalizar('  Inscripción '), 'inscripcion');
  const nombres = (q: string, c: string | null = null) => filtrarTramites(GUIA_TRAMITES_FCQ, q, c).map((t) => t.clave);
  assert.ok(nombres('inscripcion final').includes('inscripcion-finales'));
  assert.ok(nombres('CERTIFICADO').includes('certificado-estudios'));
  assert.deepEqual(nombres('palabra-que-no-existe'), []);
  assert.ok(nombres('', 'Exámenes').every((c) => GUIA_TRAMITES_FCQ.find((t) => t.clave === c)!.categoria === 'Exámenes'));
  assert.equal(nombres('').length, GUIA_TRAMITES_FCQ.length);
});

test('agrupa en el orden de las categorías', () => {
  const g = agruparPorCategoria([
    { categoria: 'Servicios' }, { categoria: 'Inventada' }, { categoria: 'Exámenes' }, { categoria: 'Servicios' },
  ]);
  assert.deepEqual(g.map((x) => [x.categoria, x.tramites.length]), [['Exámenes', 1], ['Servicios', 2], ['Inventada', 1]]);
});

test('un renglón por paso, sin viñetas ni números', () => {
  assert.deepEqual(lineas('1. Pagar\n\n- Presentar \n• Retirar\n2) Listo'), ['Pagar', 'Presentar', 'Retirar', 'Listo']);
});

test('valida el formulario del panel', () => {
  const base = aFormulario(GUIA_TRAMITES_FCQ[0]);
  assert.deepEqual(validarTramite({ ...base, nombre: 'ab' }), { error: 'Poné un nombre de al menos 3 letras.' });
  assert.ok('error' in validarTramite({ ...base, pasos: '  \n ' }));
  assert.ok('error' in validarTramite({ ...base, formulario_url: 'http://inseguro.com' }));
  assert.ok('error' in validarTramite({ ...base, fuente_url: 'javascript:alert(1)' }));
  const r = validarTramite({ ...base, costo: '   ', categoria: '' });
  assert.ok('tramite' in r);
  if ('tramite' in r) {
    assert.equal(r.tramite.costo, null);
    assert.equal(r.tramite.categoria, 'Otros');
    assert.equal(r.tramite.clave, null);
  }
});

test('el SQL escapa comillas', () => {
  const sql = sqlSemilla([{ ...GUIA_TRAMITES_FCQ[0], nombre: "D'Alessandro", pasos: ["it's"], requisitos: [] }]);
  assert.ok(sql.includes("'D''Alessandro'"));
  assert.ok(sql.includes("array['it''s']::text[]"));
  assert.ok(sql.includes("'{}'::text[]"));
  assert.ok(sql.trim().endsWith('on conflict (clave) do nothing;'));
});

test('solo abre enlaces https completos', () => {
  assert.ok(esHttps('https://www.qui.una.py/x.pdf'));
  assert.ok(esHttps(' HTTPS://tramites.una.py/ '));
  for (const u of ['http://x.com', 'javascript:alert(1)', 'https://', 'https://a b', '', null, undefined]) assert.equal(esHttps(u), false, String(u));
});
