/// <reference types="node" />
/**
 * Lectura de PDF escaneados: las palabras que devuelve el OCR (fixtures
 * ocr-*.json, sacadas de PDF escaneados de prueba con firmas, sellos y la
 * hoja un poco torcida) pasan a renglones y de ahí a fechas y clases.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { celdasDeRenglon, filasDeOcr, renglones, textoDeOcr, ubicar, type PaginaOcr, type PalabraOcr, type RenglonOcr } from '../ocr/documento.ts';
const textoDeRenglon = (r: RenglonOcr) => celdasDeRenglon(r).map((c) => c.texto).join('   ');
import { categoriaDe, leerCalendarioPdf } from '../calendario-pdf.ts';
import { detectarPlan, fechasCortasEn, leerHorarioFinales, romanosOcr } from '../horario-finales.ts';
import { HTML_OCR, URLS_OCR } from '../ocr/pagina-ocr.ts';
import { diaDe, leerHorarioClases, limpiarNombre, nivelEn, planesDeHojas, planesEn, rangoEn, seccionEn, tipoEn } from '../horario-clases.ts';
import type { FilaDoc } from '../ocr/documento.ts';

const ocr = (n: string): PaginaOcr[] => JSON.parse(readFileSync(new URL(`./fixtures/ocr-${n}.json`, import.meta.url), 'utf8'));
const B2018: string[] = JSON.parse(readFileSync(new URL('../../../supabase/datos-fcq/B-2018.json', import.meta.url), 'utf8')).materias.map((m: unknown[]) => m[1]);
const REF = new Date(2026, 10, 24);

const w = (t: string, x0: number, y0: number, x1: number, y1: number, c = 95): PalabraOcr => ({ t, x0, y0, x1, y1, c });

test('renglones: hoja torcida, tildes y celdas corridas quedan en su fila', () => {
  const pagina: PaginaOcr = {
    ancho: 1000, alto: 1000,
    palabras: [
      // la hoja baja 1 px cada 50 px hacia la derecha
      w('Química', 10, 100, 120, 130), w('General', 130, 101, 240, 131), w('01/12/2026', 500, 108, 650, 138),
      w('MIÉRCOLES', 700, 104, 860, 140), // tilde: más alta
      w('Física', 10, 200, 100, 230), w('|', 110, 200, 116, 230), w('03/12/2026', 500, 208, 650, 238),
      // celda centrada en vertical: la materia quedó un poco más abajo que sus fechas
      w('09/12/2026', 500, 300, 650, 330), w('Anatomía', 10, 318, 140, 348), w('Humana', 150, 318, 260, 348),
      w('—', 300, 400, 900, 404, 20), // resto de un borde de tabla
    ],
  };
  const r = renglones(pagina).map(textoDeRenglon);
  assert.deepEqual(r, ['Química General   01/12/2026   MIÉRCOLES', 'Física I   03/12/2026', 'Anatomía Humana   09/12/2026']);
});

test('renglones: corrige "ler." y las letras dentro de fechas', () => {
  const pagina: PaginaOcr = { ancho: 1000, alto: 500, palabras: [w('ler.', 10, 10, 60, 40), w('LLAMADO', 70, 10, 200, 40), w('O7/12/2O26', 400, 10, 560, 40), w('13/1', 620, 10, 680, 40), w('1/2027', 688, 10, 780, 40)] };
  assert.equal(textoDeRenglon(renglones(pagina)[0]), '1er. LLAMADO   07/12/2026   13/11/2027');
});

test('finales escaneados: reconoce carrera, plan, las 13 materias y sus 3 llamados', () => {
  const texto = textoDeOcr(ocr('finales'));
  assert.match(texto, /BIOQUÍMICA/);
  assert.equal(detectarPlan(texto), 2018);
  const r = leerHorarioFinales(texto, B2018, REF);
  assert.equal(r.filas.filter((f) => !f.materia).length, 0);
  assert.equal(new Set(r.filas.map((f) => f.materia)).size, 13);
  const de = (m: string) => r.filas.filter((f) => f.materia === m).map((f) => `${f.llamado} ${f.fecha} ${f.hora}`);
  assert.deepEqual(de('Química General'), ['1 2026-12-01 08:00', '2 2026-12-15 08:00', '3 2027-02-09 08:00']);
  // "Qca. Orgánica 1" y "Anatomia Mumana" (error del OCR) también se reconocen
  assert.deepEqual(de('Química Orgánica I'), ['1 2026-12-02 08:00', '2 2026-12-16 08:00', '3 2027-02-10 08:00']);
  assert.equal(de('Anatomía Humana').length, 3);
  assert.equal(de('Química Orgánica II').length, 3);
});

test('detectarPlan', () => {
  assert.equal(detectarPlan('CARRERA: NUTRICIÓN\nPlan de estudios 2026'), 2026);
  assert.equal(detectarPlan('Proyecto Académico 2018'), 2018);
  assert.equal(detectarPlan('HORARIO DE FINALES DICIEMBRE 2026'), null);
});

test('calendario escaneado: las 12 actividades con su rango, categoría y semestre', () => {
  const r = leerCalendarioPdf(textoDeOcr(ocr('calendario')), REF);
  const lista = r.eventos.map((e) => `${e.desde} ${e.hasta} ${e.categoria} ${e.semestre}`);
  assert.deepEqual(lista, [
    '2027-02-16 2027-03-16 inscripcion 1',
    '2027-02-22 2027-02-22 clases 1',
    '2027-03-23 2027-03-23 aranceles 1',
    '2027-03-01 2027-03-01 feriado null',
    '2027-03-29 2027-04-02 asueto 1',
    '2027-04-30 2027-04-30 solicitudes 1',
    '2027-06-05 2027-06-05 clases 1',
    '2027-06-10 2027-06-25 examenes 1',
    '2027-06-15 2027-06-27 examenes 1',
    '2027-07-12 2027-07-24 asueto 1',
    '2027-08-02 2027-11-13 clases 2',
    '2027-08-15 2027-08-15 feriado null',
  ]);
  assert.equal(r.eventos[0].titulo, 'Matriculación e inscripción ordinaria (1.er semestre)');
  assert.equal(r.eventos[4].titulo, 'Semana Santa (asueto)');
  assert.equal(r.eventos[5].titulo, 'Plazo para solicitud de convalidaciones');
  assert.deepEqual(r.sinUsar, []);
});

test('calendario: formatos de fecha sueltos', () => {
  const t = [
    'CALENDARIO ACADÉMICO 2027',
    'Inscripción a materias   del 3 de agosto al 14 de agosto',
    'Feriado nacional: Paz del Chaco',
    '12 de junio',
    'Exámenes parciales   lunes 20 al viernes 24 de septiembre',
    'Reincorporaciones   hasta el 5/3',
    'Vacaciones de invierno   28 de diciembre de 2027 al 8 de enero de 2028',
  ].join('\n');
  const r = leerCalendarioPdf(t, REF);
  assert.deepEqual(r.eventos.map((e) => `${e.titulo}|${e.desde}|${e.hasta}|${e.categoria}`), [
    'Inscripción a materias|2027-08-03|2027-08-14|inscripcion',
    'Feriado nacional: Paz del Chaco|2027-06-12|2027-06-12|feriado',
    'Exámenes parciales|2027-09-20|2027-09-24|examenes',
    'Reincorporaciones|2027-03-05|2027-03-05|solicitudes',
    'Vacaciones de invierno|2027-12-28|2028-01-08|asueto',
  ]);
  assert.equal(categoriaDe('Vence la 2.ª cuota de aranceles'), 'aranceles');
  assert.equal(categoriaDe('Publicación del horario de finales'), 'horarios');
});

test('horario de clases escaneado (grilla): 11 clases en su día, hora y aula', () => {
  const r = leerHorarioClases(filasDeOcr(ocr('horario')), B2018);
  const lista = r.clases.map((c) => `${c.dia} ${c.inicio}-${c.fin} ${c.materia} ${c.tipo ?? '-'} ${c.aula ?? '-'}`);
  assert.deepEqual(lista, [
    '1 07:00-08:30 Química General teoria Aula 12',
    '1 08:30-10:00 Geometría Analítica y Cálculo - Aula 7',
    '2 07:00-08:30 Física I - Aula 5',
    '2 08:30-10:00 Biología General - Aula 9',
    '2 10:00-12:00 Química General laboratorio Lab. 1',
    '3 07:00-08:30 Química General teoria Aula 12',
    '3 08:30-10:00 Geometría Analítica y Cálculo - Aula 7',
    '4 07:00-08:30 Física I - Aula 5',
    '4 10:00-12:00 Biología General - -',
    '5 07:00-08:30 Inglés Básico - -',
    '5 08:30-10:00 Seminario I - Aula 2',
  ]);
  assert.ok(r.clases.every((c) => c.nivel === 1 && c.seccion === 'Única'));
});

const fila = (y: number, ...celdas: [string, number][]): FilaDoc => ({ pagina: 0, y, alto: 10, celdas: celdas.map(([texto, x]) => ({ texto, x0: x, x1: x + texto.length * 6 })) });

test('horario de clases: grilla con horas sueltas, dos niveles y bloques seguidos', () => {
  const filas: FilaDoc[] = [
    fila(0, ['SEGUNDO NIVEL - SECCIÓN A', 100]),
    fila(20, ['HORA', 0], ['LUNES', 100], ['MARTES', 200], ['MIÉRCOLES', 300]),
    fila(40, ['07:00', 0], ['Química Inorgánica', 90], ['Física II', 200]),
    fila(52, ['(Lab)', 100]), // segunda línea de la celda del lunes
    fila(70, ['08:00', 0], ['Química Inorgánica (Lab)', 90], ['Cálculo Diferencial e Integral', 300]),
    fila(100, ['09:00', 0]),
    fila(130, ['3.er Nivel', 0]),
    fila(150, ['HORA', 0], ['LUNES', 100], ['MARTES', 200], ['MIÉRCOLES', 300]),
    fila(170, ['13:00 - 15:00', 0], ['Bioestadística', 300]),
  ];
  const r = leerHorarioClases(filas, B2018);
  assert.deepEqual(r.clases.map((c) => `${c.nivel}${c.seccion ?? ''} ${c.dia} ${c.inicio}-${c.fin} ${c.materia} ${c.tipo ?? '-'}`), [
    '2A 1 07:00-09:00 Química Inorgánica laboratorio',
    '2A 2 07:00-08:00 Física II -',
    '2A 3 08:00-09:00 Cálculo Diferencial e Integral -',
    '3 3 13:00-15:00 Bioestadística -',
  ]);
});

test('horario de clases: lista con días y horario en el renglón', () => {
  const filas: FilaDoc[] = [
    fila(0, ['Química Orgánica II (T)', 0], ['Lunes y Jueves', 200], ['07:00 a 09:00', 300], ['Aula 4', 400]),
    fila(20, ['Bioestadística', 0], ['Vie', 200], ['14.00 - 16.00 hs.', 300]),
    fila(40, ['Materia rara', 0], ['Martes', 200], ['10:00 - 11:00', 300]),
  ];
  const r = leerHorarioClases(filas, B2018);
  assert.deepEqual(r.clases.map((c) => `${c.dia} ${c.inicio}-${c.fin} ${c.materia} ${c.tipo ?? '-'} ${c.aula ?? '-'}`), [
    '1 07:00-09:00 Química Orgánica II teoria Aula 4',
    '2 10:00-11:00 null - -',
    '4 07:00-09:00 Química Orgánica II teoria Aula 4',
    '5 14:00-16:00 Bioestadística - -',
  ]);
  assert.deepEqual(r.sinUsar, ['Materia rara   Martes   10:00 - 11:00']);
});

test('ayudantes del horario de clases', () => {
  assert.equal(diaDe('miercoles'), 3);
  assert.equal(diaDe('vierne5'), 5);
  assert.equal(diaDe('sab'), 6);
  assert.equal(diaDe('marte'), 2);
  assert.equal(diaDe('mesa'), null);
  assert.deepEqual(rangoEn('7.30 a 9.00'), { inicio: '07:30', fin: '09:00' });
  assert.equal(rangoEn('09:00 - 07:00'), null);
  assert.equal(nivelEn('PRIMER NIVEL'), 1);
  assert.equal(nivelEn('4to. nivel'), 4);
  assert.equal(nivelEn('NIVEL VII'), 7);
  assert.equal(nivelEn('Quinto semestre'), 5);
  assert.equal(seccionEn('Sección B'), 'B');
  assert.equal(tipoEn('Física II (RP)', null), 'rp');
  assert.equal(tipoEn('Química', 'Lab. 2'), 'laboratorio');
});

test('horario de clases: la última fila de cada tabla no se pierde al empezar la siguiente', () => {
  const filas: FilaDoc[] = [
    fila(0, ['PRIMER NIVEL', 100]),
    fila(20, ['HORA', 0], ['LUNES', 100], ['MARTES', 200], ['MIÉRCOLES', 300]),
    fila(40, ['07:00 - 08:30', 0], ['Química General', 100]),
    fila(60, ['08:30 - 10:00', 0], ['Física I', 200]),
    fila(90, ['SEGUNDO NIVEL', 100]),
    fila(110, ['HORA', 0], ['LUNES', 100], ['MARTES', 200], ['MIÉRCOLES', 300]),
    fila(130, ['07:00 - 08:30', 0], ['Física II', 300]),
    fila(150, ['08:30 - 10:00', 0], ['Química Inorgánica', 100]),
    fila(170, ['HORA', 0], ['LUNES', 100], ['MARTES', 200], ['MIÉRCOLES', 300]),
  ];
  const r = leerHorarioClases(filas, B2018);
  assert.deepEqual(r.clases.map((c) => `${c.nivel} ${c.dia} ${c.inicio} ${c.materia}`), [
    '1 1 07:00 Química General',
    '1 2 08:30 Física I',
    '2 1 08:30 Química Inorgánica',
    '2 3 07:00 Física II',
  ]);
});

test('nivelEn no confunde el semestre del año con el nivel', () => {
  assert.equal(nivelEn('HORARIO DE CLASES SEGUNDO SEMESTRE 2027 - PRIMER NIVEL'), 1);
  assert.equal(nivelEn('Horario de clases · Primer semestre 2027'), null);
  assert.equal(nivelEn('Quinto semestre'), 5);
  assert.equal(nivelEn('3er. curso'), 3);
});

// ── PDF reales de la FCQ (Ingeniería Química, 2.º semestre 2026) ──
// Fixtures recortadas: sin la tabla de docentes ni los nombres de las mesas.
const IQ = ['IQ-2018', 'IQ-2026'].map((f) => JSON.parse(readFileSync(new URL(`../../../supabase/datos-fcq/${f}.json`, import.meta.url), 'utf8')));
const FICHAS_IQ = IQ.flatMap((d) => [
  ...d.materias.map((m: unknown[], i: number) => ({ nombre: m[1] as string, plan: d.anio as number, orden: i + 1, nivel: m[0] as number })),
  ...(d.optativas?.materias ?? []).map((m: unknown[]) => ({ nombre: m[1] as string, plan: d.anio as number, orden: null, nivel: null })),
]);
const MATERIAS_IQ = [...new Set(FICHAS_IQ.map((f) => f.nombre))];

test('horario de clases FCQ: grilla por materia con De/A, teoría/práctica, plan y nivel por hoja', () => {
  const filas = filasDeOcr(ocr('horario-fcq'));
  const { clases } = leerHorarioClases(filas, MATERIAS_IQ, null, FICHAS_IQ);
  const t = (c: { plan?: number | null; nivel: number | null; dia: number; inicio: string; fin: string; tipo: string | null; materia: string | null }) =>
    `${c.plan} n${c.nivel} ${c.dia} ${c.inicio}-${c.fin} ${c.tipo ?? '-'} ${c.materia}`;
  const lista = clases.map(t).sort();
  // Hoja 1: plan 2018, nivel 2 (12 clases, todas como en el PDF).
  for (const esperada of [
    '2018 n2 1 11:00-12:00 teoria Seminario II',
    '2018 n2 1 13:00-14:00 rp Química Inorgánica',
    '2018 n2 1 14:00-16:00 teoria Química Inorgánica',
    '2018 n2 1 16:00-19:00 teoria Álgebra Lineal',
    '2018 n2 2 10:00-12:00 rp Física I',
    '2018 n2 2 13:00-16:00 - Química Inorgánica',
    '2018 n2 3 14:00-16:00 laboratorio Física I',
    '2018 n2 3 16:00-18:00 - Álgebra Lineal',
    '2018 n2 5 08:00-11:00 teoria Física I',
    // Plan 2008, nivel 5: "NIE" (miércoles mal leído) se ubica entre martes y jueves.
    '2008 n5 1 13:00-16:00 teoria Microbiología Industrial',
    '2008 n5 1 10:00-12:00 - Microbiología Industrial',
    '2008 n5 3 11:00-12:00 - Microbiología Industrial',
    '2008 n5 2 13:00-16:00 - Análisis Industrial',
    '2008 n5 3 08:00-10:00 teoria Análisis Industrial',
    '2008 n5 5 14:00-18:00 teoria Portugués',
  ]) assert.ok(lista.includes(esperada), `falta: ${esperada}\n${lista.join('\n')}`);
  // Cálculo II: el OCR perdió el "II", pero las tres clases quedan (para revisar el nombre).
  assert.equal(clases.filter((c) => c.plan === 2018 && /^Cálculo/.test(c.materia ?? '')).length, 3);
  // Con un plan elegido, solo sus hojas.
  const solo2008 = leerHorarioClases(filas, MATERIAS_IQ, 2008, FICHAS_IQ).clases;
  assert.ok(solo2008.length >= 7 && solo2008.every((c) => c.plan === 2008));
  assert.deepEqual([...planesDeHojas(filas).entries()].sort(), [[2008, 1], [2018, 1]]);
});

test('horario de clases FCQ: hoja sin nivel legible toma el de sus materias', () => {
  const filas = filasDeOcr(ocr('horario-fcq')).map((f) => ({ ...f, celdas: f.celdas.map((c) => ({ ...c, texto: c.texto.replace(/^2$/, '') })) }));
  const { clases } = leerHorarioClases(filas, MATERIAS_IQ, 2018, FICHAS_IQ);
  assert.ok(clases.length >= 9 && clases.every((c) => c.nivel === 2), clases.map((c) => `${c.nivel} ${c.materia}`).join('\n'));
});

test('finales FCQ: fechas "25-nov", plan por fila, llamados por fecha y código de materia', () => {
  const texto = textoDeOcr(ocr('finales-fcq'));
  assert.equal(detectarPlan(texto), null); // filas de los planes 2018 y 2026
  const r = leerHorarioFinales(texto, MATERIAS_IQ, new Date(2026, 6, 1), { fichas: FICHAS_IQ });
  const de = (m: string) => [...new Set(r.filas.filter((f) => f.materia === m).map((f) => `${f.llamado} ${f.fecha} ${f.hora}`))].sort();
  // El año sale de "SEGUNDO SEMESTRE 2026": febrero es de 2027.
  assert.deepEqual(de('Química General'), ['1 2026-11-25 14:00', '2 2026-12-09 14:00', '3 2027-02-03 14:00']);
  assert.deepEqual(de('Cálculo I'), ['1 2026-11-27 14:00', '2 2026-12-11 14:00', '3 2027-02-05 14:00']);
  assert.deepEqual(de('Geometría Analítica'), ['1 2026-12-03 08:00', '2 2026-12-17 08:00', '3 2027-02-11 08:00']);
  assert.deepEqual(de('Computación y Algoritmia para Ingeniería'), ['1 2026-11-30 14:00', '2 2026-12-14 14:00', '3 2027-02-08 14:00']);
  // Los códigos "10-01" / "IQ-03" no se toman como fechas.
  assert.ok(r.filas.every((f) => f.fecha >= '2026-11-01' && f.fecha <= '2027-03-31'));
  // Con plan elegido, solo sus filas.
  const s2026 = leerHorarioFinales(texto, MATERIAS_IQ, new Date(2026, 6, 1), { fichas: FICHAS_IQ, plan: 2026 });
  assert.ok(s2026.filas.length >= 10 && s2026.filas.every((f) => f.plan === 2026 || f.plan == null));
});

test('finales: el código desempata "Cálculo" con el número de la malla', () => {
  const texto = 'HORARIO DE EXÁMENES FINALES SEGUNDO SEMESTRE 2026\n10010   Cálculo   102018   2   PLAN 2018   27-nov   14:00\n10-07   Cálculo 1   102026   2   PLAN 2026   11-dic   14:00\n10003   Cálculo I   102018   1   PLAN 2018   05-feb   14:00';
  const r = leerHorarioFinales(texto, MATERIAS_IQ, new Date(2026, 6, 1), { fichas: FICHAS_IQ });
  assert.deepEqual(r.filas.map((f) => `${f.materia} ${f.fecha}`), ['Cálculo II 2026-11-27', 'Cálculo II 2026-12-11', 'Cálculo I 2027-02-05']);
});

test('fechas cortas y romanos del OCR', () => {
  const ref = new Date(2026, 9, 1);
  assert.deepEqual(fechasCortasEn('o3-dic 11--dic 14dic 27-n0v 23-no0v 05-feb', ref).map((f) => f.fecha), ['2026-12-03', '2026-12-11', '2026-12-14', '2026-11-27', '2026-11-23', '2027-02-05']);
  assert.equal(romanosOcr('Cálculo Il'), 'Cálculo II');
  assert.equal(romanosOcr('Seminario Ill'), 'Seminario III');
  assert.equal(romanosOcr('Termodinámica li'), 'Termodinámica II');
  assert.equal(limpiarNombre('Si Seminario Il'), 'Seminario II');
  assert.equal(limpiarNombre('A del De Optativa: Recursos Naturales'), 'Optativa: Recursos Naturales');
  assert.deepEqual(planesEn('l2008__ y 12018'), [2008, 2018]);
});

test('página OCR: usa pdf.js "legacy" y rellena Promise.withResolvers para WebView viejas', () => {
  assert.match(URLS_OCR.pdfjs, /\/legacy\/build\/pdf\.min\.mjs$/);
  assert.match(URLS_OCR.pdfjsWorker, /\/legacy\/build\/pdf\.worker\.min\.mjs$/);
  const i = HTML_OCR.indexOf('Promise.withResolvers =');
  assert.ok(i > 0 && i < HTML_OCR.indexOf(URLS_OCR.tesseract) && i < HTML_OCR.indexOf('type="module"'));
});

test('finales: un año suelto o una fecha no son el plan de la fila (formato viejo con plan elegido)', () => {
  const texto = 'Mesas de examen final - Plan 2018\nQuímica General   15 de diciembre de 2025   08:00\nFísica I   22/12/2025   08:00\nBiología General   del 2025 al 2026   18/12/2025';
  const r = leerHorarioFinales(texto, ['Química General', 'Física I', 'Biología General'], new Date(2025, 10, 1), { plan: 2018 });
  assert.deepEqual(r.filas.map((f) => f.materia).sort(), ['Biología General', 'Física I', 'Química General']);
  assert.ok(r.filas.every((f) => f.plan == null));
});

test('finales: 2018 y 2026 en días distintos de la misma semana son el mismo llamado', () => {
  const texto = 'SEGUNDO SEMESTRE 2026\nIQ001   Química General   IQ2018   25-nov   14:00\nIQ-05   Química General   IQ2026   27-nov   14:00\nIQ001   Química General   IQ2018   09-dic   14:00\nIQ-05   Química General   IQ2026   11-dic   14:00';
  const r = leerHorarioFinales(texto, ['Química General'], new Date(2026, 6, 1));
  assert.deepEqual(r.filas.map((f) => `${f.plan} ${f.llamado} ${f.fecha}`).sort(), ['2018 1 2026-11-25', '2018 2 2026-12-09', '2026 1 2026-11-27', '2026 2 2026-12-11']);
});

test('limpiarNombre no corta la primera letra con tilde', () => {
  assert.equal(limpiarNombre('Álgebra Lineal'), 'Álgebra Lineal');
  assert.equal(limpiarNombre('1 Ética Profesional'), 'Ética Profesional');
  assert.equal(limpiarNombre('Óptica'), 'Óptica');
  assert.equal(limpiarNombre('2 Análisis Industrial'), 'Análisis Industrial');
});

// ── Filas armadas con las líneas de la tabla y recortes para revisar ──

const pal = (t: string, x0: number, y0: number, x1: number, y1: number): PalabraOcr => ({ t, x0, y0, x1, y1, c: 95 });

test('tabla: lo que está entre dos líneas es una fila, con celdas de dos renglones en orden', () => {
  const pagina: PaginaOcr = {
    ancho: 1000,
    alto: 400,
    palabras: [
      pal('Computación', 20, 112, 140, 132), pal('y', 150, 113, 160, 131), pal('Algoritmia', 170, 110, 280, 132),
      pal('para', 20, 152, 70, 172), pal('Ingeniería', 80, 150, 190, 172),
      pal('25-nov', 400, 132, 480, 152), pal('14:00', 600, 131, 660, 151),
      // Palabra con una mancha: mide el doble pero es del mismo renglón.
      pal('Admi', 20, 210, 70, 250), pal('istración', 75, 212, 160, 228), pal('02-dic', 400, 212, 480, 230),
    ],
    lineas: { h: [[100, 0, 1000], [182, 0, 520], [183, 520, 1000], [262, 0, 1000]], v: [[300, 100, 262], [560, 100, 262]] },
  };
  const filas = filasDeOcr([pagina], { tablas: true });
  assert.deepEqual(filas.map((f) => f.celdas.map((c) => c.texto)), [
    ['Computación y Algoritmia para Ingeniería', '25-nov', '14:00'],
    ['Admi istración', '02-dic'],
  ]);
  assert.equal(filas[0].zona?.y0, 110);
  // Sin usar las líneas, la celda de dos renglones queda partida.
  assert.ok(filasDeOcr([pagina]).length > 2);
  // Sin líneas (lector viejo) es igual que antes.
  assert.deepEqual(filasDeOcr([{ ...pagina, lineas: undefined }], { tablas: true }), filasDeOcr([pagina]));
});

test('ubicar: el renglón exacto, o el que más palabras comparte', () => {
  const pagina: PaginaOcr = { ancho: 1000, alto: 400, palabras: [pal('Química', 20, 100, 120, 120), pal('General', 130, 100, 230, 120), pal('25-nov', 400, 100, 480, 120), pal('Física', 20, 200, 100, 220), pal('II', 110, 200, 130, 220)] };
  const filas = filasDeOcr([pagina]);
  assert.equal(ubicar(filas, 'Química General   25-nov')?.y0, 100);
  assert.equal(ubicar(filas, 'Fisica II: Martes 08:00')?.y0, 200);
  assert.equal(ubicar(filas, 'Termodinámica'), null);
  // PDF con texto: sin zonas, sin recorte.
  assert.equal(ubicar(filas.map(({ zona: _z, ...f }) => f), 'Química General   25-nov'), null);
});

test('grilla FCQ: cada clase sabe dónde está en el PDF y lo dudoso trae motivo', () => {
  const paginas = ocr('horario-fcq');
  const r = leerHorarioClases(filasDeOcr(paginas), MATERIAS_IQ, null, FICHAS_IQ);
  assert.ok(r.clases.length > 0);
  for (const c of r.clases) {
    assert.ok(c.zona, `${c.materia} sin zona`);
    assert.ok(c.zona!.y1 > c.zona!.y0);
  }
  for (const x of r.revisar) assert.ok(['sin-fin', 'materia', 'nivel'].includes(x.motivo));
  assert.deepEqual(r.sinUsar, r.revisar.map((x) => x.texto));
});

test('página del lector: manda líneas, miniatura y relee lo que se saltó', () => {
  assert.match(HTML_OCR, /function rescatar\(/);
  assert.match(HTML_OCR, /lineas, imagen/);
  assert.ok(HTML_OCR.includes('/[\\p{L}\\p{N}]/u'), 'la expresión con \\p tiene que llegar entera a la página');
});
