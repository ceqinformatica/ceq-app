/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  coloresPorMateria, contraste, diasDeImagen, leerPreferenciasImagen, materiasDeLeyenda, PALETAS_IMAGEN, paletaPorId, textoImagen, textoSobre,
} from '../imagen-horario.ts';

const c = (materia_id: string | null, dia_semana: number, hora_inicio: string, titulo: string | null = null) =>
  ({ materia_id, titulo, dia_semana, hora_inicio, hora_fin: '23:00:00' });

test('cada materia tiene su color, en el orden de la semana', () => {
  const p = paletaPorId('vivos');
  const m = coloresPorMateria([c('b', 2, '08:00'), c('a', 1, '10:00'), c('a', 3, '07:00'), c(null, 1, '07:00', 'Tutoría')], p);
  assert.equal(m.get('t:tutoría'), p.tonos[0]);
  assert.equal(m.get('a'), p.tonos[1]);
  assert.equal(m.get('b'), p.tonos[2]);
  assert.equal(m.size, 3);
});

test('si hay más materias que tonos, se repiten en ronda', () => {
  const p = paletaPorId('ceq');
  const clases = Array.from({ length: p.tonos.length + 1 }, (_, i) => c(`m${i}`, 1, `${String(7 + i).padStart(2, '0')}:00`));
  assert.equal(coloresPorMateria(clases, p).get(`m${p.tonos.length}`), p.tonos[0]);
});

test('leyenda sin repetir', () => {
  const l = materiasDeLeyenda([c('a', 2, '08:00'), c('a', 1, '08:00'), c('b', 1, '09:00')], (x) => x.materia_id!.toUpperCase());
  assert.deepEqual(l, [{ clave: 'a', nombre: 'A' }, { clave: 'b', nombre: 'B' }]);
});

test('días: lunes a viernes, sábado y domingo solo si hay clases', () => {
  assert.deepEqual(diasDeImagen([]), [1, 2, 3, 4, 5]);
  assert.deepEqual(diasDeImagen([{ dia_semana: 6 }]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(diasDeImagen([{ dia_semana: 7 }]), [1, 2, 3, 4, 5, 7]);
});

test('el texto de los bloques siempre se lee (contraste ≥ 3)', () => {
  for (const p of PALETAS_IMAGEN) {
    for (const t of p.tonos) assert.ok(contraste(t, textoSobre(t)) >= 3, `${p.id} ${t}`);
  }
  assert.equal(textoSobre('#FFE08A'), '#14213A');
  assert.equal(textoSobre('#1E5BB0'), '#FFFFFF');
});

test('título vacío vuelve al predeterminado y se recorta', () => {
  assert.equal(textoImagen('   ', 'Mi horario'), 'Mi horario');
  assert.equal(textoImagen('  Horario   IQ  ', 'x'), 'Horario IQ');
  assert.equal(textoImagen('a'.repeat(60), 'x').length, 40);
});

test('preferencias guardadas: valores raros vuelven a lo predeterminado', () => {
  assert.deepEqual(leerPreferenciasImagen(null), { titulo: null, subtitulo: null, modo: null, paleta: 'ceq' });
  assert.deepEqual(leerPreferenciasImagen('{roto'), { titulo: null, subtitulo: null, modo: null, paleta: 'ceq' });
  assert.deepEqual(
    leerPreferenciasImagen(JSON.stringify({ titulo: 'Horario IQ', subtitulo: 3, modo: 'sepia', paleta: 'rosa' })),
    { titulo: 'Horario IQ', subtitulo: null, modo: null, paleta: 'rosa' },
  );
  assert.equal(leerPreferenciasImagen(JSON.stringify({ paleta: 'nada' })).paleta, 'ceq');
});
