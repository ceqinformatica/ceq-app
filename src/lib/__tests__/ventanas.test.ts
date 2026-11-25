import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cierraTocandoAfuera, COLOR_TEMA, coloresVentana, ESPERA_TOQUE_AFUERA_MS, elegirVentana, marcarVista, tocaMostrar, validarVentana, type Vistas } from '../ventanas.ts';
import type { VentanaDb } from '../tipos-db.ts';

const AHORA = new Date(2026, 10, 23, 10, 0);
const v = (id: string, extra: Partial<VentanaDb> = {}): VentanaDb => ({
  id, titulo: id, cuerpo: '', imagen_url: null, icono: null, boton_texto: null, boton_destino: null, color: 'celeste', forma: 'centro',
  alineacion: 'centro', donde: 'inicio', frecuencia: 'una_vez', cerrable: true, carrera_id: null, desde: '2026-11-01T00:00:00Z', hasta: null,
  activa: true, prioridad: 0, creada_por: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...extra,
});

test('una vez: no se repite, salvo que el CEQ la edite', () => {
  const a = v('a');
  let vistas: Vistas = {};
  assert.equal(tocaMostrar(a, vistas, AHORA, new Set()), true);
  vistas = marcarVista(vistas, a, AHORA);
  assert.equal(tocaMostrar(a, vistas, AHORA, new Set()), false);
  assert.equal(tocaMostrar({ ...a, updated_at: '2026-11-22T00:00:00Z' }, vistas, AHORA, new Set()), true);
});

test('diaria: una vez por día; siempre: una vez por cada apertura', () => {
  const d = v('d', { frecuencia: 'diaria' });
  const vistas = marcarVista({}, d, AHORA);
  assert.equal(tocaMostrar(d, vistas, new Date(2026, 10, 23, 22, 0), new Set()), false);
  assert.equal(tocaMostrar(d, vistas, new Date(2026, 10, 24, 7, 0), new Set()), true);
  const s = v('s', { frecuencia: 'siempre' });
  assert.equal(tocaMostrar(s, marcarVista({}, s, AHORA), AHORA, new Set()), true);
  assert.equal(tocaMostrar(s, {}, AHORA, new Set(['s'])), false);
});

test('elige la vigente de mayor prioridad, de mi carrera y para esta pantalla', () => {
  const lista = [
    v('vieja', { prioridad: 5, hasta: '2026-11-10T00:00:00Z' }),
    v('futura', { prioridad: 9, desde: '2026-12-01T00:00:00Z' }),
    v('apagada', { prioridad: 9, activa: false }),
    v('otra-carrera', { prioridad: 8, carrera_id: 'c2' }),
    v('baja', { prioridad: 1 }),
    v('alta', { prioridad: 3, carrera_id: 'c1' }),
  ];
  assert.equal(elegirVentana(lista, {}, AHORA, new Set(), true, 'c1')?.id, 'alta');
  assert.equal(elegirVentana(lista, {}, AHORA, new Set(), false, 'c1'), null, 'fuera del inicio solo las de "todas"');
  assert.equal(elegirVentana([...lista, v('todas', { donde: 'todas' })], {}, AHORA, new Set(), false, 'c1')?.id, 'todas');
});

test('colores: paleta y color propio con texto legible', () => {
  const c = coloresVentana('celeste');
  assert.equal(c.fondo, '#1879B4');
  assert.equal(c.texto, '#FFFFFF');
  assert.equal(c.boton, '#FFFFFF', 'botón del color del texto');
  assert.equal(c.textoBoton, '#1879B4');
  assert.equal(coloresVentana('#FFF5CC').texto, '#1F2A33');
  assert.equal(coloresVentana('#202060').texto, '#FFFFFF');
  assert.equal(coloresVentana('fucsia').fondo, '#FFFFFF', 'un valor desconocido sigue el tema');
});

test('colores: según el tema del usuario', () => {
  assert.equal(COLOR_TEMA, 'blanco', 'se guarda con un valor que la base ya acepta');
  const claro = coloresVentana(COLOR_TEMA, false);
  const oscuro = coloresVentana(COLOR_TEMA, true);
  assert.equal(claro.fondo, '#FFFFFF');
  assert.notEqual(oscuro.fondo, claro.fondo);
  assert.notEqual(oscuro.texto, claro.texto);
  // Un color fijo se ve igual en los dos modos.
  assert.equal(coloresVentana('rojo', true).fondo, coloresVentana('rojo', false).fondo);
  assert.equal(validarVentana({ titulo: 'Hola', cuerpo: '', imagen_url: '', icono: '', boton_texto: '', boton_destino: '', color: COLOR_TEMA, cerrable: true }), null);
});

test('validar formulario', () => {
  const base = { titulo: 'Hola', cuerpo: '', imagen_url: '', icono: '', boton_texto: '', boton_destino: '', color: 'celeste', cerrable: true };
  assert.equal(validarVentana(base), null);
  assert.match(validarVentana({ ...base, titulo: ' ' })!, /título/);
  assert.match(validarVentana({ ...base, boton_texto: 'Ver' })!, /dónde/);
  assert.match(validarVentana({ ...base, boton_texto: 'Ver', boton_destino: 'javascript:alert(1)' })!, /pantalla/);
  assert.equal(validarVentana({ ...base, boton_texto: 'Ver', boton_destino: '/calendario' }), null);
  assert.equal(validarVentana({ ...base, boton_texto: 'Ver', boton_destino: 'https://ceq-una.com' }), null);
  assert.match(validarVentana({ ...base, imagen_url: 'http://x' })!, /https/);
  assert.match(validarVentana({ ...base, color: 'rosa' })!, /color/);
  assert.equal(validarVentana({ ...base, color: '#AABBCC' }), null);
  // Siempre hay cruz: sin botón y cerrando solo con la cruz también vale.
  assert.equal(validarVentana({ ...base, cerrable: false }), null);
});

test('tocar afuera solo cierra si está permitido y pasó un momento', () => {
  const v = { cerrable: true, forma: 'centro' };
  assert.equal(cierraTocandoAfuera(v, ESPERA_TOQUE_AFUERA_MS), true);
  assert.equal(cierraTocandoAfuera(v, 200), false);
  assert.equal(cierraTocandoAfuera({ ...v, cerrable: false }, 60_000), false);
  assert.equal(cierraTocandoAfuera({ ...v, forma: 'pantalla' }, 60_000), true);
  assert.equal(cierraTocandoAfuera({ ...v, forma: 'abajo' }, 60_000), true);
});
