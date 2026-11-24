/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finDeSemestre, opcionesSemestre, semestreDe, sumarSemestres, textoSemestre, isoDeTexto, problemaVencimiento, sumarAnios, contenidoQr, estadoCarnet, fechaCorta, formatearCi, hoyPy, leerQr, normalizarCi, opcionesVigencia, validarSocio, type FormularioSocio } from '../carnet.ts';

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
  assert.deepEqual(o.map((x) => x.valor), ['2029-07-31', null], '6 semestres contando el actual: 2.º 2026 a 1.º 2029');
  assert.equal(o[0].texto, '6 semestres (hasta el 1.er semestre 2029)');
  assert.equal(sumarAnios('2028-02-29', 3), '2031-02-28');
  assert.equal(fechaCorta('2026-12-31'), '31/12/2026');
});

test('validación del alta de socio', () => {
  const base: FormularioSocio = { nombre: 'Ana Giménez', ci: '5.123.456', numero_socio: '', vigente_hasta: '2026-12-31', usuario_id: 'u1', pagado_en: null, observacion: '', activo: true };
  assert.equal(validarSocio(base), null);
  assert.match(validarSocio({ ...base, nombre: 'A' }) ?? '', /nombre/);
  assert.match(validarSocio({ ...base, ci: '1.2' }) ?? '', /cédula/);
  assert.equal(validarSocio({ ...base, usuario_id: null }), null, 'se puede dar de alta sin cuenta (solo carnet físico)');
});

test('vencimiento del carnet físico al validarlo', () => {
  const ahora = new Date('2026-11-22T15:00:00Z');
  assert.match(problemaVencimiento(null, ahora) ?? '', /Elegí/);
  assert.match(problemaVencimiento('2026-11-21', ahora) ?? '', /vencido/);
  assert.equal(problemaVencimiento('2026-11-22', ahora), null);
  assert.equal(problemaVencimiento('2029-11-22', ahora), null);
  assert.equal(problemaVencimiento('2030-07-31', ahora), null, 'hay diseños de carnet con otra duración: vale la fecha impresa');
  assert.equal(problemaVencimiento('2032-11-22', ahora), null, 'hasta 6 años, como la base');
  assert.match(problemaVencimiento('2032-11-23', ahora) ?? '', /no parece correcto/);
  assert.equal(isoDeTexto('5/3/2028'), '2028-03-05');
  assert.equal(isoDeTexto('31/02/2028'), null);
});

test('el carnet vence por semestre', () => {
  assert.equal(finDeSemestre({ semestre: 1, anio: 2027 }), '2027-07-31');
  assert.equal(finDeSemestre({ semestre: 2, anio: 2027 }), '2027-12-31');
  assert.deepEqual(semestreDe('2027-03-15'), { semestre: 1, anio: 2027 });
  assert.deepEqual(semestreDe('2027-08-01'), { semestre: 2, anio: 2027 });
  assert.equal(textoSemestre('2027-07-31'), '1.er semestre 2027');
  assert.equal(textoSemestre('2028-12-31'), '2.º semestre 2028');
  assert.deepEqual(sumarSemestres({ semestre: 2, anio: 2026 }, 1), { semestre: 1, anio: 2027 });
  assert.deepEqual(sumarSemestres({ semestre: 2, anio: 2026 }, 5), { semestre: 1, anio: 2029 });
  const ops = opcionesSemestre(new Date('2026-11-22T15:00:00Z'));
  assert.equal(ops[0].texto, '2.º semestre 2026');
  assert.equal(ops.length, 7, 'el actual y los 6 siguientes');
  assert.equal(ops.at(-1)!.texto, '2.º semestre 2029');
  for (const o of ops) assert.equal(problemaVencimiento(o.valor, new Date('2026-11-22T15:00:00Z')), null);
  const marzo = opcionesSemestre(new Date('2027-03-10T15:00:00Z'));
  assert.equal(marzo[0].texto, '1.er semestre 2027');
  assert.equal(marzo.at(-1)!.texto, '1.er semestre 2030');
});
