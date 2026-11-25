import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentRef, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PixelRatio, Pressable, ScrollView, Text, View, type TextProps } from 'react-native';
import { compartirVistaComoImagen, puedeCompartirImagen } from './compartir-imagen';
import { Boton, Campo, Hoja, logoCeq, Mensaje, Segmentado } from './ui';
import { useTema } from '../context/TemaProvider';
import { DIAS, DIAS_CORTOS, hora } from '../datos/agenda';
import { textoSemestre } from '../lib/carnet';
import { textoError } from '../lib/errores';
import { abreviar, acomodarDia, minutos, rangoSemana } from '../lib/horario';
import {
  claveMateria, coloresPorMateria, diasDeImagen, FONDOS_IMAGEN, leerPreferenciasImagen, materiasDeLeyenda, PALETAS_IMAGEN, paletaPorId,
  textoImagen, textoSobre, type ModoImagen, type PaletaImagen,
} from '../lib/imagen-horario';
import type { HorarioDb } from '../lib/tipos-db';
import { infoTipoClase } from '../lib/tipo-clase';
import { colores, crearEstilos, espacio, fondos, fuentes, radio } from '../tema';

/** La imagen se diseña en 420 × 420 puntos y sale en 1080 × 1080 (cuadrada). */
const ANCHO = 420;
const ALTO = 420;
const SALIDA = { width: 1080, height: 1080 };
const CLAVE_PREFERENCIAS = 'ceq.imagenHorario';
const TITULO_PREDETERMINADO = 'Mi horario';

/**
 * Hoja para compartir el horario: vista previa de la imagen, título y
 * subtítulo editables, modo claro u oscuro y paleta de colores. Lo elegido
 * queda guardado en el celular para la próxima vez.
 */
export function CompartirHorario({ visible, clases, nombre, onCerrar }: {
  visible: boolean; clases: HorarioDb[]; nombre: (h: HorarioDb) => string; onCerrar: () => void;
}) {
  const { esquema } = useTema();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const semestre = textoSemestre(new Date().toISOString());
  const [titulo, setTitulo] = useState(TITULO_PREDETERMINADO);
  const [subtitulo, setSubtitulo] = useState(semestre);
  const [modo, setModo] = useState<ModoImagen>(esquema);
  const [paleta, setPaleta] = useState(PALETAS_IMAGEN[0].id);
  const [ancho, setAncho] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    let vivo = true;
    AsyncStorage.getItem(CLAVE_PREFERENCIAS)
      .catch(() => null)
      .then((t) => {
        if (!vivo) return;
        const p = leerPreferenciasImagen(t);
        setTitulo(p.titulo ?? TITULO_PREDETERMINADO);
        setSubtitulo(p.subtitulo ?? semestre);
        setModo(p.modo ?? esquema);
        setPaleta(p.paleta);
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const guardarPreferencias = () => {
    const datos = {
      titulo: titulo.trim() && titulo.trim() !== TITULO_PREDETERMINADO ? titulo : null,
      // Si es el semestre de hoy no se guarda: el próximo semestre se actualiza solo.
      subtitulo: subtitulo.trim() === semestre ? null : subtitulo,
      modo,
      paleta,
    };
    AsyncStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(datos)).catch(() => {});
  };

  const compartir = async () => {
    setEnviando(true);
    setError(null);
    guardarPreferencias();
    try {
      await compartirVistaComoImagen(ref, 'Compartir mi horario', SALIDA);
    } catch (e) {
      setError(textoError(e, 'No se pudo compartir la imagen.'));
    } finally {
      setEnviando(false);
    }
  };

  const anchoImagen = Math.min(ancho, ANCHO);

  return (
    <Hoja visible={visible} titulo="Compartir horario" onCerrar={() => { guardarPreferencias(); onCerrar(); }}>
      <View onLayout={(e) => setAncho(e.nativeEvent.layout.width)} style={{ alignItems: 'center' }}>
        {anchoImagen > 0 ? (
          <View style={est.marco}>
            <ImagenHorario
              ancho={anchoImagen}
              clases={clases}
              nombre={nombre}
              titulo={textoImagen(titulo, TITULO_PREDETERMINADO)}
              subtitulo={textoImagen(subtitulo, '')}
              modo={modo}
              paleta={paletaPorId(paleta)}
            />
          </View>
        ) : null}
      </View>

      {/* Copia fuera de la pantalla al tamaño exacto de salida (1080 × 1080 px): la vista previa es más chica y escalada se vería borrosa. */}
      {visible && puedeCompartirImagen ? (
        <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ImagenHorario
            refVista={ref}
            ancho={SALIDA.width / PixelRatio.get()}
            clases={clases}
            nombre={nombre}
            titulo={textoImagen(titulo, TITULO_PREDETERMINADO)}
            subtitulo={textoImagen(subtitulo, '')}
            modo={modo}
            paleta={paletaPorId(paleta)}
          />
        </View>
      ) : null}

      <Text style={est.seccion}>Textos</Text>
      <Campo etiqueta="Título" value={titulo} onChangeText={setTitulo} placeholder={TITULO_PREDETERMINADO} maxLength={40} />
      <Campo etiqueta="Subtítulo (opcional)" value={subtitulo} onChangeText={setSubtitulo} placeholder="Ej. IQ · Nivel 6" maxLength={40} />

      <Text style={est.seccion}>Fondo</Text>
      <Segmentado opciones={[{ valor: 'claro', texto: 'Claro' }, { valor: 'oscuro', texto: 'Oscuro' }]} valor={modo} onCambio={setModo} />

      <Text style={[est.seccion, { marginTop: espacio.l }]}>Colores</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingVertical: 2 }}>
        {PALETAS_IMAGEN.map((p) => (
          <MuestraPaleta key={p.id} paleta={p} elegida={p.id === paleta} onPress={() => setPaleta(p.id)} />
        ))}
      </ScrollView>

      <View style={{ height: espacio.l }} />
      <Mensaje texto={error} />
      {puedeCompartirImagen ? (
        <Boton texto="Compartir imagen" icono="share-social-outline" onPress={compartir} cargando={enviando} deshabilitado={clases.length === 0} />
      ) : (
        <Mensaje tipo="info" texto="Para compartir la imagen, abrí tu horario desde la app del teléfono." />
      )}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

function MuestraPaleta({ paleta, elegida, onPress }: { paleta: PaletaImagen; elegida: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: elegida, checked: elegida }}
      accessibilityLabel={`Colores ${paleta.nombre}`}
      style={({ pressed }) => [est.muestra, elegida && est.muestraElegida, pressed && { opacity: 0.85 }]}
    >
      <View style={est.muestraTonos}>
        {paleta.tonos.slice(0, 4).map((t) => <View key={t} style={{ flex: 1, backgroundColor: t }} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {elegida ? <Ionicons name="checkmark-circle" size={13} color={colores.marino} /> : null}
        <Text style={[est.muestraNombre, elegida && { color: colores.marino, fontFamily: fuentes.semibold }]}>{paleta.nombre}</Text>
      </View>
    </Pressable>
  );
}

/**
 * La imagen en sí: cabecera con el título, la grilla de la semana en una
 * tarjeta y la leyenda de materias. Todas las medidas salen de un diseño
 * de 420 × 420 (cuadrado) escalado al ancho disponible, así la imagen es siempre la
 * misma (no depende del tamaño del celular).
 */
export function ImagenHorario({ refVista, ancho, clases, nombre, titulo, subtitulo, modo, paleta }: {
  refVista?: Ref<ComponentRef<typeof View>>;
  ancho: number; clases: HorarioDb[]; nombre: (h: HorarioDb) => string;
  titulo: string; subtitulo: string; modo: ModoImagen; paleta: PaletaImagen;
}) {
  const k = ancho / ANCHO;
  const u = (n: number) => n * k;
  const f = FONDOS_IMAGEN[modo];
  const colorDe = useMemo(() => coloresPorMateria(clases, paleta), [clases, paleta]);
  const leyenda = useMemo(() => materiasDeLeyenda(clases, nombre), [clases, nombre]);
  const dias = diasDeImagen(clases);
  const { desde, hasta } = rangoSemana(clases);
  const horas = Array.from({ length: (hasta - desde) / 60 }, (_, i) => desde + i * 60);
  // Marcas de hora con la del final incluida (07, 08, … 18).
  const marcas = [...horas, hasta];
  // Alto de la zona de bloques, medido en puntos del diseño (sin escalar).
  const [altoGrilla, setAltoGrilla] = useState(0);
  const altoHora = altoGrilla > 0 ? altoGrilla / horas.length : 0;
  const anchoDia = (ANCHO - 36 - 14 - 24) / dias.length;
  const acento = paleta.tonos[0];

  return (
    <View
      ref={refVista}
      collapsable={false}
      testID="imagen-horario"
      style={{ width: ancho, height: (ancho * ALTO) / ANCHO, backgroundColor: f.fondo, padding: u(18), overflow: 'hidden' }}
    >
      {/* Burbujas de fondo del color de la paleta */}
      <View style={{ position: 'absolute', width: u(200), height: u(200), borderRadius: u(100), top: u(-110), right: u(-50), backgroundColor: acento, opacity: 0.16 }} />
      <View style={{ position: 'absolute', width: u(120), height: u(120), borderRadius: u(60), bottom: u(-70), left: u(-40), backgroundColor: paleta.tonos[1], opacity: 0.12 }} />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: u(12) }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fuentes.bold, fontSize: u(22), lineHeight: u(26), letterSpacing: u(-0.3), color: f.texto }} numberOfLines={1}>
            {titulo}
          </T>
          {subtitulo ? (
            <T style={{ fontFamily: fuentes.medium, fontSize: u(11), lineHeight: u(14), color: f.textoSuave, marginTop: u(1) }} numberOfLines={1}>{subtitulo}</T>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(6), paddingBottom: u(2) }}>
          <View style={{ width: u(22), height: u(22), borderRadius: u(11), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={logoCeq} style={{ width: u(15), height: u(15) }} accessibilityLabel="Logo del CEQ" />
          </View>
          <T style={{ fontFamily: fuentes.bold, fontSize: u(8.5), letterSpacing: u(1.4), color: f.textoSuave }}>PORTAL CEQ</T>
        </View>
      </View>

      <View style={{ flex: 1, marginTop: u(10), backgroundColor: f.tarjeta, borderRadius: u(16), paddingTop: u(8), paddingBottom: u(8), paddingLeft: u(4), paddingRight: u(10) }}>
        <View style={{ flexDirection: 'row', height: u(16) }}>
          <View style={{ width: u(24) }} />
          {dias.map((d) => (
            <T key={d} style={{ flex: 1, textAlign: 'center', fontFamily: fuentes.bold, fontSize: u(9.5), letterSpacing: u(0.6), color: f.texto }}>
              {DIAS_CORTOS[d - 1].toUpperCase()}
            </T>
          ))}
        </View>
        <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setAltoGrilla(e.nativeEvent.layout.height / k)}>
          <View style={{ width: u(24) }}>
            {marcas.map((h, i) => (
              <T key={h} style={{ position: 'absolute', right: u(5), top: u(i * altoHora - 5), fontFamily: fuentes.medium, fontSize: u(8.5), color: f.textoSuave }}>
                {String(h / 60).padStart(2, '0')}
              </T>
            ))}
          </View>
          {dias.map((d) => (
            <View key={d} style={{ flex: 1 }}>
              {marcas.map((h, i) => (
                <View key={h} style={{ position: 'absolute', left: 0, right: 0, top: u(i * altoHora), height: Math.max(1, u(0.75)), backgroundColor: f.linea }} />
              ))}
              {altoHora > 0 && acomodarDia(clases.filter((c) => c.dia_semana === d)).map(({ clase: c, columna, columnas }) => {
                const tono = colorDe.get(claveMateria(c)) ?? acento;
                const tinta = textoSobre(tono);
                const top = ((minutos(c.hora_inicio) - desde) / 60) * altoHora;
                const alto = Math.max(((minutos(c.hora_fin) - minutos(c.hora_inicio)) / 60) * altoHora - 2, 14);
                const lineas = Math.max(1, Math.floor((alto - 5) / 11.5));
                const tipo = infoTipoClase(c.tipo_clase);
                // Letras que entran por línea (9 pt semibold ≈ 4,6 unidades por letra):
                // las palabras más largas se recortan para no partirlas a la mitad.
                const letras = Math.max(5, Math.floor(((anchoDia / columnas) - 11) / 4.6));
                const nombreCorto = abreviar(nombre(c), letras);
                const cabeEnUna = nombreCorto.length <= letras + 1;
                // Con dos líneas: el nombre arriba y "TEO · Aula 12" abajo si el
                // nombre entra en una línea; si no, el nombre completo en dos.
                const dosLineas = lineas === 2 && cabeEnUna && (tipo != null || !!c.aula);
                const conTipo = tipo != null && lineas >= 3;
                const conAula = !!c.aula && (lineas >= 4 || (lineas === 3 && cabeEnUna));
                const conHora = lineas >= 5;
                const lineasNombre = dosLineas ? 1 : Math.max(1, lineas - (conTipo ? 1 : 0) - (conAula ? 1 : 0) - (conHora ? 1 : 0));
                const detalle = [tipo?.corto.toUpperCase(), c.aula].filter(Boolean).join(' · ');
                return (
                  <View
                    key={c.id}
                    accessibilityLabel={`${nombre(c)}, ${DIAS[d - 1]} de ${hora(c.hora_inicio)} a ${hora(c.hora_fin)}`}
                    style={{
                      position: 'absolute', top: u(top + 1), height: u(alto), left: `${(columna / columnas) * 100}%`, width: `${100 / columnas}%`,
                      paddingLeft: u(2), paddingRight: u(1),
                    }}
                  >
                    <View style={{ flex: 1, backgroundColor: tono, borderRadius: u(7), paddingHorizontal: u(4), paddingVertical: u(3), overflow: 'hidden' }}>
                      {conTipo ? <T style={[txt(u, 7.5, fuentes.bold, tinta), { opacity: 0.85, letterSpacing: u(0.4) }]} numberOfLines={1}>{tipo!.corto.toUpperCase()}</T> : null}
                      <T style={txt(u, 9, fuentes.semibold, tinta)} numberOfLines={lineasNombre}>
                        {tipo && !conTipo && lineas === 1 ? `${tipo.corto} · ` : ''}{nombreCorto}
                      </T>
                      {dosLineas ? <T style={[txt(u, 7.5, fuentes.medium, tinta), { opacity: 0.85 }]} numberOfLines={1}>{detalle}</T> : null}
                      {conAula ? <T style={[txt(u, 7.5, fuentes.medium, tinta), { opacity: 0.85 }]} numberOfLines={1}>{c.aula}</T> : null}
                      {conHora ? <T style={[txt(u, 7.5, fuentes.medium, tinta), { opacity: 0.85 }]} numberOfLines={1}>{hora(c.hora_inicio)}</T> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {leyenda.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: u(9), columnGap: u(14), rowGap: u(4) }}>
          {(leyenda.length > 8 ? leyenda.slice(0, 7) : leyenda).map((m) => (
            <View key={m.clave} style={{ flexDirection: 'row', alignItems: 'center', gap: u(5), maxWidth: '48%' }}>
              <View style={{ width: u(9), height: u(9), borderRadius: u(3), backgroundColor: colorDe.get(m.clave) }} />
              <T style={{ flexShrink: 1, fontFamily: fuentes.semibold, fontSize: u(9), color: f.texto }} numberOfLines={1}>{m.nombre}</T>
            </View>
          ))}
          {leyenda.length > 8 ? (
            <T style={{ fontFamily: fuentes.medium, fontSize: u(9), color: f.textoSuave }}>+{leyenda.length - 7} más</T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** El texto de la imagen no crece con la letra grande del sistema: el diseño es fijo. */
function T(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />;
}

const txt = (u: (n: number) => number, tamano: number, fuente: string, color: string) => ({
  fontFamily: fuente, fontSize: u(tamano), lineHeight: u(tamano + 2.5), color,
});

const est = crearEstilos(() => ({
  marco: { borderRadius: radio.l, overflow: 'hidden' as const, borderWidth: 1, borderColor: colores.borde, marginBottom: espacio.l },
  seccion: { fontFamily: fuentes.semibold, fontSize: 13, color: colores.textoSuave, marginBottom: espacio.s, letterSpacing: 0.3 },
  muestra: { width: 86, padding: 6, borderRadius: radio.m, borderWidth: 1.5, borderColor: colores.borde, backgroundColor: fondos.superficieBlanca, gap: 6 },
  muestraElegida: { borderColor: colores.marino },
  muestraTonos: { flexDirection: 'row' as const, height: 26, borderRadius: 6, overflow: 'hidden' as const },
  muestraNombre: { fontFamily: fuentes.medium, fontSize: 12, color: colores.texto, textAlign: 'center' as const },
}));
