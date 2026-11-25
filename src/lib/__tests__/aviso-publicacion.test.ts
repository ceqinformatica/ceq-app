/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoAviso } from '../aviso-publicacion.ts';

test('publicar sin avisar no figura como avisado', () => {
  assert.equal(estadoAviso(null), 'pendiente');
  assert.equal(estadoAviso({ publicado_en: null, avisado_en: null }), 'pendiente');
  assert.equal(estadoAviso({ publicado_en: '2026-11-20', avisado_en: null }), 'pendiente');
  assert.equal(estadoAviso({ publicado_en: '2026-11-20', avisado_en: '2026-11-20' }), 'avisado');
  // Sin la migración (no hay avisado_en): solo se avisa la primera vez.
  assert.equal(estadoAviso({ publicado_en: '2026-11-20' }), 'ya_no_se_puede');
  assert.equal(estadoAviso({ publicado_en: null }), 'pendiente');
});
