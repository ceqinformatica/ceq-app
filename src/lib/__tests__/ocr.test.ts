/// <reference types="node" />
/**
 * Lectura de PDF escaneados: las palabras que devuelve el OCR (fixtures
 * ocr-*.json, sacadas de PDF escaneados de prueba con firmas, sellos y la
 * hoja un poco torcida) pasan a renglones y de ahí a fechas y clases.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { celdasDeRenglon, filasDeOcr, renglones, textoDeOcr, type PaginaOcr, type PalabraOcr, type RenglonOcr } from '../ocr/documento.ts';
const textoDeRenglon = (r: RenglonOcr) => celdasDeRenglon(r).map((c) => c.texto).join('   ');
import { categoriaDe, leerCalendarioPdf } from '../calendario-pdf.ts';
import { detectarPlan, leerHorarioFinales } from '../horario-finales.ts';
import { diaDe, leerHorarioClases, nivelEn, rangoEn, seccionEn, tipoEn } from '../horario-clases.ts';
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
