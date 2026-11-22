/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contenidoQr, estadoCarnet, fechaCorta, formatearCi, hoyPy, leerQr, normalizarCi, opcionesVigencia, validarSocio, type FormularioSocio } from '../carnet.ts';

test('el QR lleva solo el código, sin datos personales', () => {
  assert.equal(contenidoQr('abc123'), 'CEQ1:abc123');
  assert.equal(leerQr(' CEQ1:abc123 '), 'abc123');
  assert.equal(leerQr('ceq1:abc123'), 'abc123');
  assert.equal(leerQr('CEQ-0042'), 'CEQ-0042');
});

test('cédula con o sin puntos', () => {
  assert.equal(normalizarCi('4.555.666'), '4555666');
  assert.equal(normalizarCi(' 4 555-666 '), '4555666');
  assert.equal(formatearCi('4555666'), '4.555.666');
  assert.equal(formatearCi('123'), '123');
});

test('la fecha de hoy es la de Paraguay, no la UTC', () => {
  // 01:00 UTC del 1 de enero = 22:00 del 31 de diciembre en Asunción
  assert.equal(hoyPy(new Date('2027-01-01T01:00:00Z')), '2026-12-31');
});

test('estado del carnet', () => {
  const ahora = new Date('2026-11-22T15:00:00Z');
  assert.equal(estadoCarnet({ activo: true, vigente_hasta: '2026-12-31' }, ahora), 'vigente');
  assert.equal(estadoCarnet({ activo: true, vigente_hasta: '2026-11-22' }, ahora), 'vigente');
  assert.equal(estadoCarnet({ activo: true, vigente_hasta: '2026-11-21' }, ahora), 'vencido');
  assert.equal(estadoCarnet({ activo: true, vigente_hasta: null }, ahora), 'vigente');
  assert.equal(estadoCarnet({ activo: false, vigente_hasta: '2099-12-31' }, ahora), 'inactivo');
});

test('vigencias para elegir sin teclear fechas', () => {
  const o = opcionesVigencia(new Date('2026-11-22T15:00:00Z'));
  assert.deepEqual(o.map((x) => x.valor), ['2026-12-31', '2027-12-31', null]);
  assert.equal(fechaCorta('2026-12-31'), '31/12/2026');
});

test('validación del alta de socio', () => {
  const base: FormularioSocio = { nombre: 'Ana Giménez', ci: '5.123.456', numero_socio: '', vigente_hasta: '2026-12-31', usuario_id: 'u1', pagado_en: null, observacion: '', activo: true };
  assert.equal(validarSocio(base), null);
  assert.match(validarSocio({ ...base, nombre: 'A' }) ?? '', /nombre/);
  assert.match(validarSocio({ ...base, ci: '1.2' }) ?? '', /cédula/);
  assert.equal(validarSocio({ ...base, usuario_id: null }), null, 'se puede dar de alta sin cuenta (solo carnet físico)');
});
