/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atajos, describirCuando, leerFechaHora, partesDe, rutaSegura, validarMensaje } from '../programacion.ts';

// Sábado 22/11/2026, 14:10 (hora del celular).
const ahora = new Date(2026, 10, 22, 14, 10);

const fechaDe = (r: ReturnType<typeof leerFechaHora>) => {
  assert.ok('fecha' in r, 'error' in r ? r.error : '');
  return r.fecha;
};

test('lee fecha completa y hora', () => {
  const f = fechaDe(leerFechaHora('25/11/2026', '18:30', ahora));
  assert.deepEqual([f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes()], [2026, 10, 25, 18, 30]);
});

test('sin año usa este año o el próximo si ya pasó', () => {
  assert.equal(fechaDe(leerFechaHora('1/12', '8', ahora)).getFullYear(), 2026);
  assert.equal(fechaDe(leerFechaHora('10/2', '08:00', ahora)).getFullYear(), 2027);
});

test('acepta años de dos cifras y separadores comunes', () => {
  assert.equal(fechaDe(leerFechaHora('03-03-27', '7.15', ahora)).getMonth(), 2);
  assert.equal(fechaDe(leerFechaHora('03.03.2027', '18hs', ahora)).getHours(), 18);
});

test('rechaza fechas que no existen, pasadas o mal escritas', () => {
  assert.ok('error' in leerFechaHora('31/11/2026', '10:00', ahora));
  assert.ok('error' in leerFechaHora('29/02/2027', '10:00', ahora));
  assert.ok('error' in leerFechaHora('21/11/2026', '10:00', ahora));
  assert.ok('error' in leerFechaHora('22/11/2026', '14:00', ahora));
  assert.ok('error' in leerFechaHora('mañana', '10:00', ahora));
  assert.ok('error' in leerFechaHora('25/11/2026', '25:00', ahora));
  assert.ok('error' in leerFechaHora('25/11/2026', '', ahora));
  assert.ok('error' in leerFechaHora('25/11/2028', '10:00', ahora));
});

test('hoy un minuto atrás todavía vale (sale enseguida)', () => {
  assert.ok('fecha' in leerFechaHora('22/11/2026', '14:10', ahora));
});

test('atajos siempre en el futuro', () => {
  const a = atajos(ahora);
  assert.deepEqual(a.map((x) => x.texto), ['En 1 hora', 'Hoy 18:00', 'Mañana 08:00', 'Mañana 18:00']);
  assert.ok(a.every((x) => x.fecha > ahora));
  const tarde = new Date(2026, 10, 22, 17, 45);
  assert.ok(!atajos(tarde).some((x) => x.texto === 'Hoy 18:00'));
});

test('describe cuándo sale', () => {
  assert.equal(describirCuando(new Date(2026, 10, 22, 18, 0), ahora), 'Hoy 18:00');
  assert.equal(describirCuando(new Date(2026, 10, 23, 8, 5), ahora), 'Mañana 08:05');
  assert.equal(describirCuando(new Date(2026, 10, 21, 9, 0), ahora), 'Ayer 09:00');
  assert.equal(describirCuando(new Date(2026, 10, 24, 8, 0), ahora), 'mar 24/11 08:00');
  assert.equal(describirCuando(new Date(2027, 0, 5, 8, 0), ahora), '5/1/2027 08:00');
});

test('partes para editar', () => {
  assert.deepEqual(partesDe(new Date(2026, 0, 5, 7, 3)), { fecha: '05/01/2026', hora: '07:03' });
});

test('valida título y texto', () => {
  assert.equal(validarMensaje('Asamblea', 'Jueves 18 h'), null);
  assert.match(validarMensaje('  ', 'x') ?? '', /título/);
  assert.match(validarMensaje('Hola', '') ?? '', /texto/);
  assert.equal(validarMensaje('Hola', '', { cuerpoObligatorio: false }), null);
  assert.match(validarMensaje('x'.repeat(121), 'y') ?? '', /120/);
  assert.match(validarMensaje('x', 'y'.repeat(501)) ?? '', /500/);
  assert.equal(validarMensaje('x', 'y'.repeat(2000), { limiteCuerpo: 5000 }), null);
});

test('solo abre rutas internas', () => {
  assert.equal(rutaSegura('/aviso/123-abc'), '/aviso/123-abc');
  assert.equal(rutaSegura('/agenda'), '/agenda');
  assert.equal(rutaSegura('https://malo.com'), null);
  assert.equal(rutaSegura('//malo.com'), null);
  assert.equal(rutaSegura('/aviso?x=1'), null);
  assert.equal(rutaSegura(42), null);
});
