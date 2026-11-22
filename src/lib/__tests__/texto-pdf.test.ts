/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDePdf } from '../texto-pdf.ts';
import { leerExtracto } from '../extracto-ealu.ts';

/** Arma un PDF mínimo al estilo jsPDF: un BT ... Td (texto) Tj ET por celda. */
function pdfDe(celdas: [number, number, string][], extra = ''): Uint8Array {
  const flujo = celdas
    .map(([x, y, t]) => `BT\n/F1 9 Tf\n10.35 TL\n0 g\n${x} ${y} Td\n(${t}) Tj\nET`)
    .join('\n');
  const texto =
    '%PDF-1.3\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    extra +
    `3 0 obj\n<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream\nendobj\n%%EOF`;
  return new Uint8Array([...texto].map((c) => c.charCodeAt(0)));
}

test('arma las filas del extracto con columnas y tildes', () => {
  const pdf = pdfDe([
    [56.69, 760, 'CARRERA: INGENIERIA QUIMICA - PLAN 2018'],
    [198.43, 720, 'PRIMER NIVEL \\(COMPLETO\\)'],
    // columnas fuera de orden a propósito
    [425.2, 702.99, '48616'],
    [56.69, 702.99, '10\\)'],
    [76.54, 702.99, 'Qu\\355mica Inorg\\341nica'],
    [368.5, 702.99, '07/12/2024'],
    [510.24, 702.99, '4'],
    [524.41, 702.99, '\\(CUATRO\\)'],
    [56.69, 688.82, '2\\)'],
    [76.54, 688.82, 'Seminario I'],
    [368.5, 688.82, '25/06/2024'],
    [425.2, 688.82, '47448'],
    [510.24, 688.82, 'APR\\(APROBADO\\)'],
    [56.69, 600, 'PROMEDIO: 4.28'],
  ]);
  const e = leerExtracto(textoDePdf(pdf));
  assert.equal(e.carrera, 'INGENIERIA QUIMICA');
  assert.equal(e.promedio, 4.28);
  assert.deepEqual(
    e.filas.map((f) => [f.numero, f.nombre, f.fecha, f.acta, f.nota, f.bloque]),
    [
      [10, 'Química Inorgánica', '2024-12-07', '48616', 4, 'PRIMER NIVEL'],
      [2, 'Seminario I', '2024-06-25', '47448', null, 'PRIMER NIVEL'],
    ],
  );
});

test('ignora imágenes y flujos comprimidos', () => {
  const imagen = '4 0 obj\n<< /Subtype /Image /Length 9 >>\nstream\n(x) Tj ET\nendstream\nendobj\n';
  const comprimido = '5 0 obj\n<< /Filter /FlateDecode /Length 9 >>\nstream\nBT (y) Tj\nendstream\nendobj\n';
  assert.equal(textoDePdf(pdfDe([[10, 10, 'hola']], imagen + comprimido)), 'hola');
});

test('devuelve vacío si no es un PDF o no tiene texto', () => {
  assert.equal(textoDePdf(new Uint8Array([1, 2, 3])), '');
  assert.equal(textoDePdf(pdfDe([])), '');
});
