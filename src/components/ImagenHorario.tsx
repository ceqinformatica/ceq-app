import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentRef, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
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

/** La imagen se diseña en 360 × 640 puntos y sale en 1080 × 1920 (9:16). */
const ANCHO = 360;
const ALTO = 640;
const SALIDA = { width: 1080, height: 1920 };
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
              refVista={ref}
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
 * de 360 × 640 escalado al ancho disponible, así la imagen es siempre la
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
  const anchoDia = (ANCHO - 40 - 16 - 24) / dias.length;
  const acento = paleta.tonos[0];

  return (
    <View
      ref={refVista}
      collapsable={false}
      testID="imagen-horario"
      style={{ width: ancho, height: (ancho * ALTO) / ANCHO, backgroundColor: f.fondo, padding: u(20), overflow: 'hidden' }}
    >
      {/* Burbujas de fondo del color de la paleta */}
      <View style={{ position: 'absolute', width: u(260), height: u(260), borderRadius: u(130), top: u(-120), right: u(-90), backgroundColor: acento, opacity: 0.16 }} />
      <View style={{ position: 'absolute', width: u(140), height: u(140), borderRadius: u(70), bottom: u(-70), left: u(-50), backgroundColor: paleta.tonos[1], opacity: 0.12 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(7) }}>
        <View style={{ width: u(24), height: u(24), borderRadius: u(12), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Image source={logoCeq} style={{ width: u(16), height: u(16) }} accessibilityLabel="Logo del CEQ" />
        </View>
        <Text style={{ fontFamily: fuentes.bold, fontSize: u(9.5), letterSpacing: u(1.6), color: f.textoSuave }}>PORTAL CEQ</Text>
      </View>
      <Text style={{ fontFamily: fuentes.bold, fontSize: u(27), lineHeight: u(32), letterSpacing: u(-0.4), color: f.texto, marginTop: u(12) }} numberOfLines={2}>
        {titulo}
      </Text>
      {subtitulo ? (
        <Text style={{ fontFamily: fuentes.medium, fontSize: u(13), lineHeight: u(17), color: f.textoSuave, marginTop: u(2) }} numberOfLines={1}>{subtitulo}</Text>
      ) : null}

      <View style={{ flex: 1, marginTop: u(14), backgroundColor: f.tarjeta, borderRadius: u(16), paddingTop: u(10), paddingBottom: u(10), paddingLeft: u(4), paddingRight: u(12) }}>
        <View style={{ flexDirection: 'row', height: u(18) }}>
          <View style={{ width: u(24) }} />
          {dias.map((d) => (
            <Text key={d} style={{ flex: 1, textAlign: 'center', fontFamily: fuentes.bold, fontSize: u(9.5), letterSpacing: u(0.6), color: f.texto }}>
              {DIAS_CORTOS[d - 1].toUpperCase()}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1, flexDirection: 'row' }} onLayout={(e) => setAltoGrilla(e.nativeEvent.layout.height / k)}>
          <View style={{ width: u(24) }}>
            {marcas.map((h, i) => (
              <Text key={h} style={{ position: 'absolute', right: u(5), top: u(i * altoHora - 5), fontFamily: fuentes.medium, fontSize: u(8.5), color: f.textoSuave }}>
                {String(h / 60).padStart(2, '0')}
              </Text>
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
                const lineas = Math.max(1, Math.floor((alto - 6) / 11.5));
                const tipo = infoTipoClase(c.tipo_clase);
                const conTipo = tipo != null && lineas >= 3;
                const conAula = !!c.aula && lineas >= 4;
                const conHora = lineas >= 5;
                const lineasNombre = Math.max(1, lineas - (conTipo ? 1 : 0) - (conAula ? 1 : 0) - (conHora ? 1 : 0));
                const largo = anchoDia / columnas >= 50 ? 9 : 6;
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
                      {conTipo ? <Text style={[txt(u, 7.5, fuentes.bold, tinta), { opacity: 0.85, letterSpacing: u(0.4) }]} numberOfLines={1}>{tipo!.corto.toUpperCase()}</Text> : null}
                      <Text style={txt(u, 9, fuentes.semibold, tinta)} numberOfLines={lineasNombre}>
                        {tipo && !conTipo ? `${tipo.corto} · ` : ''}{abreviar(nombre(c), largo)}
                      </Text>
                      {conAula ? <Text style={[txt(u, 7.5, fuentes.medium, tinta), { opacity: 0.85 }]} numberOfLines={1}>{c.aula}</Text> : null}
                      {conHora ? <Text style={[txt(u, 7.5, fuentes.medium, tinta), { opacity: 0.85 }]} numberOfLines={1}>{hora(c.hora_inicio)}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {leyenda.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: u(12), rowGap: u(6) }}>
          {leyenda.slice(0, 10).map((m) => (
            <View key={m.clave} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: u(6), paddingRight: u(6) }}>
              <View style={{ width: u(10), height: u(10), borderRadius: u(3), backgroundColor: colorDe.get(m.clave) }} />
              <Text style={{ flex: 1, fontFamily: fuentes.semibold, fontSize: u(10), color: f.texto }} numberOfLines={1}>{m.nombre}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={{ marginTop: u(12), fontFamily: fuentes.medium, fontSize: u(8.5), color: f.textoSuave, textAlign: 'center', letterSpacing: u(0.3) }}>
        Hecho con la app Portal CEQ
      </Text>
    </View>
  );
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
