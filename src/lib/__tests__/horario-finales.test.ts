/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { textoDePdfGeneral } from '../pdf-texto.ts';
import { leerHorarioFinales, mismaMateria, normalizar, textoLlamado } from '../horario-finales.ts';

const MATERIAS = [
  'Química General I', 'Química General II', 'Matemática I', 'Química Orgánica I', 'Química Orgánica II',
  'Fisicoquímica II', 'Análisis Instrumental', 'Microbiología', 'Física I', 'Introducción a la Bioquímica Clínica',
];
const REF = new Date(2026, 10, 23);
const fixture = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const resumen = (r: ReturnType<typeof leerHorarioFinales>) => r.filas.map((f) => `${f.materia}|${f.llamado}|${f.fecha}|${f.hora}`);

test('PDF de LibreOffice: tabla con una columna por llamado', () => {
  const texto = textoDePdfGeneral(fixture('finales-columnas.pdf'));
  assert.match(texto, /CARRERA: BIOQUÍMICA/);
  const r = leerHorarioFinales(texto, MATERIAS, REF);
  const filas = resumen(r);
  assert.ok(filas.includes('Química General I|1|2026-12-01|08:00'));
  assert.ok(filas.includes('Química General I|3|2027-02-05|08:00'));
  assert.ok(filas.includes('Química Orgánica II|2|2026-12-19|08:00'), '"8:00 hs"');
  assert.ok(filas.includes('Fisicoquímica II|1|2026-12-07|14:00'), '"14 hs"');
  // "Química Orgánica I" no se confunde con la II
  assert.equal(r.filas.filter((f) => f.materia === 'Química Orgánica I').length, 3);
  assert.equal(r.filas.filter((f) => f.materia === 'Química Orgánica II').length, 3);
  // La materia que no está en la malla queda para revisar
  assert.equal(r.filas.filter((f) => f.materia == null).length, 3);
  assert.equal(r.sinUsar.length, 1);
  assert.equal(r.filas.length, 21);
});

test('PDF de Chrome: secciones por llamado, fechas sin año, aula', () => {
  const texto = textoDePdfGeneral(fixture('finales-secciones.pdf'));
  const r = leerHorarioFinales(texto, MATERIAS, REF);
  assert.deepEqual(resumen(r), [
    'Análisis Instrumental|1|2026-11-30|07:30',
    'Microbiología|1|2026-12-01|13:00',
    'Análisis Instrumental|2|2026-12-14|07:30',
    'Microbiología|2|2026-12-15|13:00',
  ]);
  assert.equal(r.filas[0].aula, 'Aula 12');
  assert.equal(r.filas[1].aula, 'Aula 3');
});

test('texto: fechas largas, abreviaturas, mayúsculas y nombre en dos renglones', () => {
  const texto = [
    'SEGUNDO LLAMADO',
    'QCA. ORGANICA 2   lunes 7 de diciembre   8.00 hs',
    'Introducción a la Bioquímica',
    'Clínica   9 de diciembre de 2026   14h30',
    'Fisica 1   10-12-26   13:00',
  ].join('\n');
  const r = leerHorarioFinales(texto, MATERIAS, REF);
  assert.deepEqual(resumen(r), [
    'Química Orgánica II|2|2026-12-07|08:00',
    'Introducción a la Bioquímica Clínica|2|2026-12-09|14:30',
    'Física I|2|2026-12-10|13:00',
  ]);
});

test('fechas de febrero sin año pasan al año siguiente', () => {
  const r = leerHorarioFinales('1er llamado\nMicrobiología 08/02 08:00', MATERIAS, REF);
  assert.equal(r.filas[0].fecha, '2027-02-08');
});

test('ignora fechas imposibles y horas sueltas sin "hs"', () => {
  const r = leerHorarioFinales('Microbiología 31/02/2027 8', MATERIAS, REF);
  assert.equal(r.filas.length, 0);
  const r2 = leerHorarioFinales('Microbiología 03/12/2026 Aula 8', MATERIAS, REF);
  assert.equal(r2.filas[0].hora, null);
});

test('mismaMateria compara sin tildes ni mayúsculas', () => {
  assert.ok(mismaMateria('QUÍMICA ORGÁNICA II', 'Química Orgánica II'));
  assert.ok(!mismaMateria('Química Orgánica I', 'Química Orgánica II'));
  assert.equal(normalizar('Análisis07:30hAula'), 'analisis 07:30 haula');
  assert.equal(textoLlamado(1), '1.er llamado');
  assert.equal(textoLlamado(2), '2.º llamado');
});

/** PDF 1.5 con objetos comprimidos (ObjStm) y fuente Identity-H con ToUnicode, como los de Word. */
function pdfEstiloWord(): Uint8Array {
  const latin = (b: Buffer) => b.toString('latin1');
  // Glifos 0001..0005 → "Micro"; 0006 → espacio; 0007..000A → "0", "8", "/", "1"
  const cmap = [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    '2 beginbfchar <0001> <004D> <0006> <0020> endbfchar',
    '2 beginbfrange <0002> <0005> [<0069> <0063> <0072> <006F>] <0007> <0007> <0030> endbfrange',
    '3 beginbfchar <0008> <0038> <0009> <002F> <000A> <0031> endbfchar',
    'endcmap CMapName currentdict /CMap defineresource pop end end',
  ].join('\n');
  // "Micro" + " " + "08/01" → en dos TJ en la misma línea, con cm que escala.
  const contenido = 'q 0.75 0 0 0.75 0 0 cm BT /F1 12 Tf 1 0 0 1 100 700 Tm [<00010002>-20<000300040005>] TJ ET BT /F1 12 Tf 1 0 0 1 400 700 Tm <0007000800090007000A> Tj ET Q';
  const z = (s: string) => latin(deflateSync(Buffer.from(s, 'latin1')));
  const objs = ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'];
  // ObjStm con los objetos 2 y 3
  let cuerpo = '';
  const offs: number[] = [];
  for (const o of objs) {
    offs.push(cuerpo.length);
    cuerpo += o + '\n';
  }
  const cab = `2 ${offs[0]} 3 ${offs[1]} `;
  const objstm = z(cab + cuerpo);
  const cont = z(contenido);
  const cm = z(cmap);
  const partes = [
    '%PDF-1.5\n',
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${cont.length} /Filter /FlateDecode >>\nstream\n${cont}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /Calibri /Encoding /Identity-H /ToUnicode 6 0 R >>\nendobj\n',
    `6 0 obj\n<< /Length ${cm.length} /Filter /FlateDecode >>\nstream\n${cm}\nendstream\nendobj\n`,
    `7 0 obj\n<< /Type /ObjStm /N 2 /First ${cab.length} /Length ${objstm.length} /Filter /FlateDecode >>\nstream\n${objstm}\nendstream\nendobj\n`,
    '%%EOF',
  ];
  return new Uint8Array(Buffer.from(partes.join(''), 'latin1'));
}

test('lee PDF con objetos comprimidos y fuentes de 2 bytes', () => {
  const texto = textoDePdfGeneral(pdfEstiloWord());
  assert.equal(texto, 'Micro   08/01');
});

test('PDF sin texto (escaneado) o que no es PDF', () => {
  assert.equal(textoDePdfGeneral(new Uint8Array(Buffer.from('hola'))), '');
  const soloImagen = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 20 >>\nstream\nq 600 0 0 800 0 0 cm\nendstream\nendobj\n%%EOF';
  assert.equal(textoDePdfGeneral(new Uint8Array(Buffer.from(soloImagen, 'latin1'))), '');
});
