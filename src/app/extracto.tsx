import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { nombreSemestre, nota as fmtNota } from '../components/academico';
import { BarraSuperior, Boton, Campo, Cargando, Dato, EstadoVacio, Hoja, Insignia, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { cargarMalla, cargarParaImportar, importarExtracto } from '../datos/academico';
import { usarDatos } from '../datos/usarDatos';
import { emparejar, leerExtracto, normalizar, planDeImportacion, UMBRAL_SEGURO, type Extracto, type FilaExtracto } from '../lib/extracto-ealu';
import { textoDePdf } from '../lib/texto-pdf';
import type { MateriaDb } from '../lib/tipos-db';
import { colores, crearEstilos, espacio, fondos, fuentes, radio } from '../tema';
import { useTema } from '../context/TemaProvider';
import { textoError } from '../lib/errores';

const SIN_MATERIAS: MateriaDb[] = [];

const volver = () => (router.canGoBack() ? router.back() : router.replace('/carrera'));

/** Una fila del extracto con la materia que se le asignó y si se importa. */
interface Renglon {
  fila: FilaExtracto;
  materiaId: string | null;
  confianza: number;
  incluir: boolean;
}

type Paso =
  | { tipo: 'inicio' }
  | { tipo: 'leyendo' }
  | { tipo: 'revision'; extracto: Extracto }
  | { tipo: 'listo'; finales: number; aprobadas: number; repetidas: number };

/**
 * Lee el PDF elegido y lo descarta. Nada sale del teléfono y la copia
 * temporal que hace el selector se borra enseguida.
 */
async function bytesDelPdf(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const buf = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
    return new Uint8Array(buf);
  }
  const { File } = await import('expo-file-system');
  const archivo = new File(asset.uri);
  try {
    return await archivo.bytes();
  } finally {
    try {
      archivo.delete();
    } catch {
      // si no se puede borrar, el sistema limpia la caché igual
    }
  }
}

export default function ImportarExtracto() {
  useTema();
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos: malla, cargando, error: errorMalla } = usarDatos(() => cargarMalla(planId, perfil?.carrera_id), [planId], { cache: `malla:${planId}` });
  const [paso, setPaso] = useState<Paso>({ tipo: 'inicio' });
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const enCurso = useRef(false);
  const [eligiendoPara, setEligiendoPara] = useState<number | null>(null);

  const materias = malla?.materiasDb ?? SIN_MATERIAS;
  const porId = useMemo(() => new Map(materias.map((m) => [m.id, m])), [materias]);

  const eligiendoPdf = useRef(false);
  const elegirPdf = async () => {
    if (eligiendoPdf.current || enCurso.current) return;
    eligiendoPdf.current = true;
    setError(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      setPaso({ tipo: 'leyendo' });
      const texto = textoDePdf(await bytesDelPdf(r.assets[0]));
      const extracto = texto ? leerExtracto(texto) : null;
      if (!extracto || extracto.filas.length === 0) {
        setPaso({ tipo: 'inicio' });
        setError('Este PDF no parece el extracto de notas finales del EALU. Descargalo de nuevo desde el sistema y probá otra vez.');
        return;
      }
      const coincidencias = emparejar(extracto.filas, materias);
      setRenglones(
        coincidencias.map((c) => ({
          fila: c.fila,
          materiaId: c.materia?.id ?? null,
          confianza: c.confianza,
          incluir: c.materia != null && c.confianza >= UMBRAL_SEGURO,
        })),
      );
      setPaso({ tipo: 'revision', extracto });
    } catch (e) {
      setPaso({ tipo: 'inicio' });
      setError(e instanceof Error ? `No pudimos leer el PDF: ${e.message}` : 'No pudimos leer el PDF.');
    } finally {
      eligiendoPdf.current = false;
    }
  };

  const cambiar = (i: number, cambio: Partial<Renglon>) => setRenglones((rs) => rs.map((r, k) => (k === i ? { ...r, ...cambio } : r)));

  const importar = async () => {
    if (enCurso.current) return; // evita el doble toque
    enCurso.current = true;
    setImportando(true);
    setError(null);
    try {
      const { existentes, aprobadas } = await cargarParaImportar();
      // Una materia por fila: si por algo quedó repetida, vale la primera.
      const vistas = new Set<string>();
      const confirmadas = renglones
        .filter((r) => r.incluir && r.materiaId && !vistas.has(r.materiaId) && vistas.add(r.materiaId))
        .map((r) => ({ fila: r.fila, materia: { id: r.materiaId! } }));
      const plan = planDeImportacion(confirmadas, existentes, aprobadas);
      await importarExtracto(plan);
      setPaso({ tipo: 'listo', finales: plan.intentos.length, aprobadas: plan.aprobadasSinNota.length, repetidas: plan.repetidas });
    } catch (e) {
      setError(textoError(e, 'No se pudo importar.'));
    } finally {
      enCurso.current = false;
      setImportando(false);
    }
  };

  if (cargando && !malla) return <Pantalla><BarraSuperior titulo="Importar extracto" onVolver={volver} /><Cargando /></Pantalla>;
  if (errorMalla && !malla) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Importar extracto" onVolver={volver} />
        <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tu malla" texto={errorMalla} />
      </Pantalla>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: fondos.fondo }}>
      <Pantalla>
        <BarraSuperior titulo="Importar extracto" onVolver={volver} />
        {paso.tipo === 'inicio' && <Inicio onElegir={elegirPdf} error={error} />}
        {paso.tipo === 'leyendo' && <Tarjeta><Cargando texto="Leyendo tu extracto…" /></Tarjeta>}
        {paso.tipo === 'revision' && (
          <Revision
            extracto={paso.extracto}
            renglones={renglones}
            porId={porId}
            planAnio={malla?.plan?.anio ?? null}
            onCambiar={cambiar}
            onElegirMateria={setEligiendoPara}
            onOtroPdf={elegirPdf}
            importando={importando}
            error={error}
          />
        )}
        {paso.tipo === 'listo' && <Listo {...paso} />}
        {paso.tipo === 'revision' && <View style={{ height: 96 }} />}
      </Pantalla>

      {paso.tipo === 'revision' && (
        <View style={est.barra}>
          <Boton
            texto={(() => {
              const n = renglones.filter((r) => r.incluir && r.materiaId).length;
              return n ? `Importar ${n} ${n === 1 ? 'materia' : 'materias'}` : 'Elegí qué importar';
            })()}
            variante="claro"
            icono="cloud-download-outline"
            cargando={importando}
            deshabilitado={importando || !renglones.some((r) => r.incluir && r.materiaId)}
            onPress={importar}
            estilo={{ flex: 1 }}
          />
        </View>
      )}

      <ElegirMateria
        visible={eligiendoPara != null}
        nombreExtracto={eligiendoPara != null ? renglones[eligiendoPara]?.fila.nombre ?? '' : ''}
        materias={materias}
        ocupadas={new Set(renglones.filter((r, k) => k !== eligiendoPara && r.incluir).map((r) => r.materiaId).filter((x): x is string => x != null))}
        onCerrar={() => setEligiendoPara(null)}
        onElegir={(id) => {
          if (eligiendoPara != null) {
            // Si otra fila desmarcada tenía esa materia, se la saca: una materia va en una sola fila.
            setRenglones((rs) => rs.map((r, k) =>
              k === eligiendoPara ? { ...r, materiaId: id, incluir: id != null, confianza: id != null ? 1 : 0 }
                : id != null && r.materiaId === id ? { ...r, materiaId: null, incluir: false, confianza: 0 } : r));
          }
          setEligiendoPara(null);
        }}
      />
    </View>
  );
}

function Inicio({ onElegir, error }: { onElegir: () => void; error: string | null }) {
  return (
    <>
      <Tarjeta variante="celeste">
        <View style={{ flexDirection: 'row', gap: espacio.m, alignItems: 'flex-start' }}>
          <View style={est.icono}><Ionicons name="document-text-outline" size={22} color={colores.marino} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.filaTitulo, { color: colores.marino }]}>Cargá tu historial de una vez</Text>
            <Text style={s.cuerpo}>
              Elegí el PDF de "Notas finales" que descargás del EALU. Vamos a buscar cada materia en tu malla, y vos confirmás antes de guardar.
            </Text>
          </View>
        </View>
      </Tarjeta>
      <Seccion>Cómo conseguirlo</Seccion>
      <Tarjeta>
        {['Entrá al EALU con tu usuario.', 'Abrí "Notas finales" y descargá el PDF.', 'Volvé acá y elegilo.'].map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', gap: espacio.m, alignItems: 'center', marginBottom: i < 2 ? espacio.m : 0 }}>
            <View style={est.numero}><Text style={est.numeroTexto}>{i + 1}</Text></View>
            <Text style={[s.cuerpo, { flex: 1 }]}>{t}</Text>
          </View>
        ))}
      </Tarjeta>
      <Mensaje texto={error} />
      <Boton texto="Elegir PDF" icono="folder-open-outline" onPress={onElegir} estilo={{ marginTop: espacio.m }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: espacio.m }}>
        <Ionicons name="lock-closed-outline" size={14} color={colores.textoSuave} />
        <Text style={[s.filaDetalle, { flex: 1 }]}>El PDF se lee en tu teléfono y no se guarda ni se envía a ningún lado.</Text>
      </View>
    </>
  );
}

function Revision({ extracto, renglones, porId, planAnio, onCambiar, onElegirMateria, onOtroPdf, importando, error }: {
  extracto: Extracto; renglones: Renglon[]; porId: Map<string, MateriaDb>; planAnio: number | null;
  onCambiar: (i: number, c: Partial<Renglon>) => void; onElegirMateria: (i: number) => void; onOtroPdf: () => void; importando: boolean; error: string | null;
}) {
  const indices = renglones.map((r, i) => ({ r, i }));
  const seguras = indices.filter(({ r }) => r.materiaId && r.confianza >= UMBRAL_SEGURO);
  const dudosas = indices.filter(({ r }) => r.materiaId && r.confianza < UMBRAL_SEGURO);
  const sinMateria = indices.filter(({ r }) => !r.materiaId);
  // Filas numeradas que no se pudieron leer (el extracto numera 1, 2, 3…).
  const ultimo = Math.max(0, ...extracto.filas.map((f) => f.numero));
  const descartadas = Math.max(0, ultimo - extracto.filas.length);
  const otroPlan = extracto.plan != null && planAnio != null && extracto.plan !== planAnio;

  return (
    <>
      <Tarjeta>
        <Text style={[s.filaTitulo, { color: colores.marino }]} numberOfLines={2}>{extracto.carrera ?? 'Extracto del EALU'}</Text>
        {extracto.plan != null && <Text style={[s.filaDetalle, { marginTop: 2 }]}>Plan {extracto.plan}</Text>}
        <View style={{ flexDirection: 'row', marginTop: espacio.m }}>
          <Dato valor={String(extracto.filas.length)} etiqueta="Filas leídas" />
          <Dato valor={String(seguras.length + dudosas.length)} etiqueta="Encontradas" color={colores.verde} />
          <Dato valor={fmtNota(extracto.promedio)} etiqueta="Promedio" />
        </View>
      </Tarjeta>
      {otroPlan && (
        <Mensaje
          tipo="error"
          texto={`Este extracto es del plan ${extracto.plan}, pero tu perfil está en el plan ${planAnio}. Revisá bien cada materia antes de importar, o cambiá tu plan en tu perfil.`}
        />
      )}
      {descartadas > 0 && (
        <Mensaje tipo="info" texto={`${descartadas === 1 ? 'Hubo 1 fila' : `Hubo ${descartadas} filas`} del PDF que no pudimos leer. Esas cargalas a mano.`} />
      )}

      {seguras.length > 0 && <Seccion>Listas para importar</Seccion>}
      {seguras.map(({ r, i }) => (
        <FilaRenglon key={i} r={r} materia={porId.get(r.materiaId!)} onAlternar={() => onCambiar(i, { incluir: !r.incluir })} onCambiarMateria={() => onElegirMateria(i)} />
      ))}

      {dudosas.length > 0 && (
        <>
          <Seccion>Confirmá estas</Seccion>
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>El nombre no coincide del todo. Marcalas si es la misma materia, o elegí otra.</Text>
        </>
      )}
      {dudosas.map(({ r, i }) => (
        <FilaRenglon key={i} r={r} materia={porId.get(r.materiaId!)} dudosa onAlternar={() => onCambiar(i, { incluir: !r.incluir })} onCambiarMateria={() => onElegirMateria(i)} />
      ))}

      {sinMateria.length > 0 && (
        <>
          <Seccion>No las encontramos en tu malla</Seccion>
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>Si alguna está con otro nombre, elegila. Si no, quedan afuera.</Text>
        </>
      )}
      {sinMateria.map(({ r, i }) => (
        <FilaRenglon key={i} r={r} onCambiarMateria={() => onElegirMateria(i)} />
      ))}

      <Mensaje texto={error} />
      <Boton texto="Elegir otro PDF" variante="fantasma" icono="refresh" onPress={onOtroPdf} deshabilitado={importando} estilo={{ marginTop: espacio.m }} />
    </>
  );
}

function FilaRenglon({ r, materia, dudosa, onAlternar, onCambiarMateria }: {
  r: Renglon; materia?: MateriaDb; dudosa?: boolean; onAlternar?: () => void; onCambiarMateria: () => void;
}) {
  const detalle = [
    r.fila.nota != null ? `Nota ${r.fila.nota}` : 'Aprobada',
    r.fila.fecha ? r.fila.fecha.split('-').reverse().join('/') : null,
    r.fila.optativa ? 'Optativa' : null,
  ].filter(Boolean).join(' · ');
  const marcada = r.incluir && materia != null;
  return (
    <View style={[est.renglon, marcada && { borderColor: colores.marino }]}>
      {onAlternar && materia ? (
        <Pressable
          onPress={onAlternar}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: marcada }}
          accessibilityLabel={`Importar ${materia.nombre}`}
          hitSlop={8}
          style={[est.casilla, marcada && { backgroundColor: fondos.marino, borderColor: colores.marino }]}
        >
          {marcada && <Ionicons name="checkmark" size={15} color={colores.blanco} />}
        </Pressable>
      ) : (
        <View style={[est.casilla, { borderStyle: 'dashed' }]} />
      )}
      <View style={{ flex: 1, gap: 3 }}>
        {materia ? (
          <>
            <Text style={s.filaTitulo} numberOfLines={2}>{materia.nombre}</Text>
            {normalizar(materia.nombre) !== normalizar(r.fila.nombre) && (
              <Text style={s.filaDetalle} numberOfLines={2}>En el extracto: {r.fila.nombre}</Text>
            )}
          </>
        ) : (
          <Text style={s.filaTitulo} numberOfLines={2}>{r.fila.nombre}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={s.filaDetalle}>{detalle}</Text>
          {dudosa && <Insignia texto="¿Es la misma?" color={colores.amarillo} fondo={fondos.amarilloFondo} />}
        </View>
      </View>
      <Pressable onPress={onCambiarMateria} accessibilityRole="button" accessibilityLabel={materia ? 'Cambiar materia' : 'Elegir materia'} hitSlop={8}>
        <Text style={s.enlace}>{materia ? 'Cambiar' : 'Elegir'}</Text>
      </Pressable>
    </View>
  );
}

function ElegirMateria({ visible, nombreExtracto, materias, ocupadas, onCerrar, onElegir }: {
  visible: boolean; nombreExtracto: string; materias: MateriaDb[]; ocupadas: Set<string>; onCerrar: () => void; onElegir: (id: string | null) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const q = normalizar(busqueda);
  const lista = materias.filter((m) => !ocupadas.has(m.id) && (!q || normalizar(m.nombre).includes(q))).slice(0, 40);
  return (
    <Hoja visible={visible} titulo="Elegir materia" onCerrar={() => { setBusqueda(''); onCerrar(); }}>
      <Text style={[s.cuerpo, { marginBottom: espacio.m }]}>En el extracto figura como “{nombreExtracto}”.</Text>
      <Campo etiqueta="Buscar" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre de la materia" />
      {lista.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => { setBusqueda(''); onElegir(m.id); }}
          accessibilityRole="button"
          style={({ pressed }) => [est.opcion, pressed && { backgroundColor: fondos.tarjeta }]}
        >
          <Text style={[s.filaTitulo, { flex: 1 }]} numberOfLines={2}>{m.nombre}</Text>
          <Text style={s.filaDetalle}>{m.grupo_optativa_id ? 'Optativa' : nombreSemestre(m.semestre)}</Text>
        </Pressable>
      ))}
      {lista.length === 0 && <Text style={[s.filaDetalle, { marginVertical: espacio.m }]}>No hay materias con ese nombre.</Text>}
      <Boton texto="No está en mi malla" variante="fantasma" onPress={() => { setBusqueda(''); onElegir(null); }} />
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

function Listo({ finales, aprobadas, repetidas }: { finales: number; aprobadas: number; repetidas: number }) {
  const total = finales + aprobadas;
  return (
    <>
      <Tarjeta>
        <EstadoVacio
          icono="checkmark-circle"
          titulo={total ? '¡Listo, ya está en tu carrera!' : 'No había nada nuevo'}
          texto={[
            finales ? `${finales} ${finales === 1 ? 'final cargado' : 'finales cargados'} con su nota.` : null,
            aprobadas ? `${aprobadas} ${aprobadas === 1 ? 'materia marcada' : 'materias marcadas'} como aprobada${aprobadas === 1 ? '' : 's'}.` : null,
            repetidas ? `${repetidas} ya ${repetidas === 1 ? 'estaba cargada' : 'estaban cargadas'}, así que no las repetimos.` : null,
          ].filter(Boolean).join(' ')}
        />
      </Tarjeta>
      <Boton texto="Ver mi carrera" icono="school-outline" onPress={() => router.replace('/carrera')} />
    </>
  );
}

const est = crearEstilos(() => ({
  icono: { width: 40, height: 40, borderRadius: 12, backgroundColor: fondos.superficieBlanca, alignItems: 'center', justifyContent: 'center' },
  numero: { width: 26, height: 26, borderRadius: 13, backgroundColor: fondos.marino, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { fontFamily: fuentes.bold, fontSize: 13, color: colores.blanco },
  renglon: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.m, backgroundColor: fondos.superficieBlanca, borderRadius: radio.m,
    borderWidth: 1.5, borderColor: colores.lineaSuave, padding: espacio.m, marginBottom: espacio.s,
  },
  casilla: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colores.linea, alignItems: 'center', justifyContent: 'center' },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.m, paddingHorizontal: espacio.s, borderBottomWidth: 1, borderBottomColor: colores.lineaSuave },
  barra: { position: 'absolute', left: espacio.l, right: espacio.l, bottom: espacio.l, backgroundColor: fondos.marino, borderRadius: radio.l, padding: espacio.s },
}));
