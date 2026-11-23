import { createElement, useState } from 'react';
import { colores, espacio, fondos, fuentes, radio } from '../../tema';
import { leerTextoFecha, textoFecha, type PropsControl } from './formato';

/** En la web se usa el selector propio del navegador (<input type="date|time">). */
export function ControlFechaHora({ modo, valor, onCambio, etiqueta, minimo }: PropsControl) {
  const [foco, setFoco] = useState(false);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fecha = modo === 'date' ? leerTextoFecha(valor) : null;
  return createElement('input', {
    type: modo,
    'aria-label': etiqueta,
    value: modo === 'date' ? (fecha ? iso(fecha) : '') : valor,
    min: modo === 'date' && minimo ? iso(minimo) : undefined,
    onFocus: () => setFoco(true),
    onBlur: () => setFoco(false),
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value;
      if (!v) return onCambio('');
      if (modo === 'time') return onCambio(v.slice(0, 5));
      const [a, m, d] = v.split('-').map(Number);
      onCambio(textoFecha(new Date(a, m - 1, d)));
    },
    style: {
      boxSizing: 'border-box', width: '100%', minHeight: 50, padding: `0 ${espacio.m + 2}px`, fontSize: 16, fontFamily: fuentes.regular,
      color: colores.texto, backgroundColor: fondos.superficieBlanca, borderRadius: radio.m,
      border: foco ? `1.5px solid ${colores.marino}` : `1px solid ${colores.linea}`, outline: 'none',
    },
  });
}
