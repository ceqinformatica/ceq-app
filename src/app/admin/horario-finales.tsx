import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Columnas } from '../../components/disposicion';
import { textoProgreso, useLectorOcr } from '../../components/LectorOcr';
import { CampoFechaHora } from '../../components/fecha';
import { ItemRevision, RecorteOcr, type PaginaVista } from '../../components/RecorteOcr';
import { BarraSuperior, Boton, Campo, Cargando, Chip, Fila, Hoja, Insignia, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { cargarCarreras } from '../../datos/admin';
import {
  borrarHorario, bytesDeArchivo, cargarHorario, crearHorario, fichasDeMaterias, guardarFechas, materiasDeCarrera, ocultarHorario, publicarHorario, renombrarHorario,
  urlPdfHorario, type FechaEditable,
} from '../../datos/finales-oficiales';
import { estadoAviso, TEXTO_AVISO } from '../../lib/aviso-publicacion';
import { textoError } from '../../lib/errores';
import { detectarCarrera, detectarPlan, isoATexto, leerHorarioFinales, textoAIso, textoLlamado, tituloSugerido, type FichaMateria } from '../../lib/horario-finales';
import { compararPorNivel, nivelesPorMateria } from '../../lib/orden-niveles';
import { nombreNivel } from '../../components/academico';
import { confianzaMedia, filasDeOcr, textoDeFilas, ubicar, type FilaDoc, type Zona } from '../../lib/ocr/documento';
import { textoDePdfGeneral } from '../../lib/pdf-texto';
import type { Carrera, HorarioFinalesDb } from '../../lib/tipos-db';
import { colores, espacio, fondos } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/horarios-finales'));

/** Fila en edición: la materia puede faltar hasta que el admin la elija. */
type Fila = Omit<FechaEditable, 'materia'> & { clave: string; materia: string | null; origen?: string; zona?: Zona | null };

let contador = 0;
const nuevaClave = () => `f${++contador}`;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

/**
 * Subir el horario de finales de una carrera (PDF de la Dirección
 * Académica), revisar lo que se detectó y publicarlo. Con ?id= abre uno ya
 * cargado para corregirlo, publicarlo u ocultarlo.
 */
export default function HorarioFinalesAdmin() {
  useTema();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [horario, setHorario] = useState<HorarioFinalesDb | null>(null);
  const [cargando, setCargando] = useState(Boolean(id));
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [detectada, setDetectada] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [materias, setMaterias] = useState<string[]>([]);
  const [fichas, setFichas] = useState<FichaMateria[]>([]);
  const [texto, setTexto] = useState<string | null>(null);
  // PDF escaneado: renglones con su lugar en la página y la imagen de cada página, para los recortes.
  const [escaneo, setEscaneo] = useState<{ filas: FilaDoc[]; vistas: PaginaVista[] } | null>(null);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; nombre: string } | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [plan, setPlan] = useState<number | null>(null);
  const [escaneado, setEscaneado] = useState(false);
  const lector = useLectorOcr();
  const [editando, setEditando] = useState<Fila | null>(null);
  const [notificar, setNotificar] = useState(true);
  const [guardando, setGuardando] = useState<null | 'guardar' | 'publicar' | 'ocultar' | 'borrar'>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cambios, setCambios] = useState(false);

  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);

  // Horario ya cargado.
  useEffect(() => {
    if (!id) return;
    cargarHorario(id)
      .then((r) => {
        if (!r) return setError('Ese horario ya no existe.');
        setHorario(r.horario);
        setCarreraId(r.horario.carrera_id);
        setTitulo(r.horario.titulo);
        setFilas(r.fechas.map((f) => ({ clave: nuevaClave(), materia: f.materia, llamado: f.llamado, fecha: f.fecha, hora: f.hora?.slice(0, 5) ?? null, aula: f.aula })));
      })
      .catch((e) => setError(textoError(e, 'No se pudo cargar el horario.')))
      .finally(() => setCargando(false));
  }, [id]);

  // Materias de la carrera elegida (para reconocer y para elegir a mano).
  useEffect(() => {
    if (!carreraId) return setFichas([]);
    fichasDeMaterias(carreraId).then(setFichas).catch(() => setFichas([]));
  }, [carreraId]);

  useEffect(() => {
    if (!carreraId) return setMaterias([]);
    let activo = true;
    materiasDeCarrera(carreraId, plan).then((m) => activo && setMaterias(m)).catch(() => {});
    return () => {
      activo = false;
    };
  }, [carreraId, plan]);

  // Al tener el texto y las materias, se detecta todo (y se vuelve a detectar si cambia la carrera).
  useEffect(() => {
    if (texto == null || !materias.length) return;
    // Con un plan elegido quedan solo sus filas (en planillas con "IQ2018" / "IQ2026" por fila).
    const r = leerHorarioFinales(texto, materias, new Date(), { fichas, plan });
    setFilas(r.filas.map((f) => ({ clave: nuevaClave(), materia: f.materia, llamado: f.llamado, fecha: f.fecha, hora: f.hora, aula: f.aula, origen: f.origen, zona: escaneo ? ubicar(escaneo.filas, f.origen) : null })));
  }, [texto, materias, fichas, plan, escaneo]);

  const elegirPdf = async () => {
    setError(null);
    setAviso(null);
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 20 * 1024 * 1024) return setError('El PDF pesa más de 20 MB.');
    setLeyendo(true);
    try {
      const bytes = await bytesDeArchivo(a as { uri: string; file?: File });
      // Leer el PDF lleva un momento: se deja dibujar el "Leyendo…" primero.
      await new Promise((ok) => setTimeout(ok, 50));
      let t = textoDePdfGeneral(bytes);
      setEscaneado(false);
      setEscaneo(null);
      if (!t.trim()) {
        // PDF escaneado: se lee la imagen con OCR (en el dispositivo).
        setProgreso(textoProgreso(null));
        try {
          const paginas = await lector.leer(bytes, (p) => setProgreso(textoProgreso(p)));
          // Una fila de la planilla por renglón: se arma con las líneas de la tabla.
          const filasDoc = filasDeOcr(paginas, { tablas: true });
          t = textoDeFilas(filasDoc);
          setEscaneado(true);
          setEscaneo({ filas: filasDoc, vistas: paginas.map((p) => ({ ancho: p.ancho, alto: p.alto, imagen: p.imagen })) });
          if (t.trim() && confianzaMedia(paginas) < 65) setAviso('El escaneo se ve borroso: revisá bien cada fecha antes de publicar.');
        } catch (e) {
          setAviso(`${textoError(e, 'No se pudo leer el PDF escaneado.')} Podés cargar las fechas a mano y el PDF queda para que lo vean los estudiantes.`);
          t = '';
        } finally {
          setProgreso(null);
        }
      }
      setPdf({ bytes, nombre: a.name ?? 'horario.pdf' });
      setTexto(t);
      setPlan(detectarPlan(t));
      if (!t.trim()) {
        setFilas([]);
        setAviso((v) => v ?? 'No encontramos texto en este PDF. Podés cargar las fechas a mano y el PDF queda para que lo vean los estudiantes.');
      }
      const c = t ? detectarCarrera(t, carreras) : null;
      if (c) setCarreraId(c);
      setDetectada(Boolean(c));
      if (!titulo) setTitulo(tituloSugerido(t));
      setCambios(true);
    } catch (e) {
      setError(textoError(e, 'No se pudo leer el PDF.'));
    } finally {
      setLeyendo(false);
    }
  };

  const sinMateria = filas.filter((f) => !f.materia);
  const vistas = escaneo?.vistas ?? null;
  // Lo que conviene mirar antes de publicar, cada cosa con su motivo.
  const dudosas = useMemo(() => {
    const enMalla = new Set(materias);
    const l: { fila: Fila; motivo: string }[] = [];
    for (const f of filas) {
      if (!f.materia) l.push({ fila: f, motivo: 'No reconocimos la materia. Elegila (o borrá la fecha).' });
      else if (materias.length && !enMalla.has(f.materia)) l.push({ fila: f, motivo: `"${f.materia}" no está en la malla. Elegí la materia correcta.` });
      else if (!f.hora) l.push({ fila: f, motivo: `${f.materia}: no leímos la hora.` });
    }
    const pag = (x: { fila: Fila }) => x.fila.zona?.pagina ?? 999;
    return l.sort((a, b) => pag(a) - pag(b));
  }, [filas, materias]);
  // Nivel de cada materia (del plan elegido; si no, el primero en que aparece), para ordenar por nivel y no alfabéticamente.
  const nivelDe = useMemo(() => nivelesPorMateria(fichas, plan), [fichas, plan]);
  const porMateria = useMemo(() => {
    const m = new Map<string, Fila[]>();
    for (const f of filas) if (f.materia) m.set(f.materia, [...(m.get(f.materia) ?? []), f]);
    return [...m.entries()]
      .map(([nombre, l]) => [nombre, l.sort((a, b) => a.llamado - b.llamado || a.fecha.localeCompare(b.fecha))] as const)
      .sort((a, b) => compararPorNivel(nivelDe, a[0], b[0]));
  }, [filas, nivelDe]);
  const materiasPorNivel = useMemo(() => [...materias].sort((a, b) => compararPorNivel(nivelDe, a, b)), [materias, nivelDe]);

  /** Resultado de la hoja: la fila corregida, una nueva, o null para borrarla. */
  const aplicarEdicion = (f: Fila | null) => {
    const original = editando;
    setEditando(null);
    if (!original) return;
    setFilas((l) => {
      const existe = l.some((x) => x.clave === original.clave);
      if (!f) return l.filter((x) => x.clave !== original.clave);
      return existe ? l.map((x) => (x.clave === original.clave ? f : x)) : [...l, f];
    });
    setCambios(true);
  };

  const validar = (): string | null => {
    if (!carreraId) return 'Elegí la carrera.';
    if (titulo.trim().length < 3) return 'Poné un título (por ejemplo, "Finales diciembre 2026").';
    return null;
  };

  /** Guarda (crea si es nuevo). Las fechas sin materia no se guardan. */
  const guardar = async (): Promise<string | null> => {
    const e = validar();
    if (e) {
      setError(e);
      return null;
    }
    const listas = filas.filter((f): f is Fila & { materia: string } => Boolean(f.materia)).map(({ materia, llamado, fecha, hora, aula }) => ({ materia, llamado, fecha, hora, aula }));
    if (horario) {
      if (titulo.trim() !== horario.titulo) await renombrarHorario(horario.id, titulo);
      await guardarFechas(horario.id, listas);
      setFilas((l) => l.filter((f) => f.materia));
      setCambios(false);
      return horario.id;
    }
    const nuevo = await crearHorario(carreraId!, titulo, pdf?.bytes ?? null, listas);
    const r = await cargarHorario(nuevo);
    if (r) setHorario(r.horario);
    setFilas((l) => l.filter((f) => f.materia));
    setCambios(false);
    return nuevo;
  };

  const accion = async (tipo: 'guardar' | 'publicar' | 'ocultar') => {
    setError(null);
    setAviso(null);
    if (tipo === 'publicar' && !filas.some((f) => f.materia)) return setError('No hay fechas con materia para publicar.');
    setGuardando(tipo);
    try {
      if (tipo === 'ocultar') {
        await ocultarHorario(horario!.id);
        setHorario((h) => (h ? { ...h, publicado: false } : h));
        setAviso('Listo: los estudiantes ya no lo ven.');
        return;
      }
      const hid = await guardar();
      if (!hid) return;
      if (tipo === 'publicar') {
        const avisar = notificar && estadoAviso(horario) === 'pendiente';
        const n = await publicarHorario(hid, avisar);
        const ahora = new Date().toISOString();
        setHorario((h) => (h ? { ...h, publicado: true, publicado_en: h.publicado_en ?? ahora, avisado_en: avisar ? ahora : h.avisado_en } : h));
        setAviso(`Publicado: ${n} fechas.${avisar ? ' Les avisamos a los estudiantes de la carrera.' : ''}`);
      } else {
        setAviso(horario?.publicado ? 'Cambios guardados: los estudiantes ya los ven.' : 'Borrador guardado. Todavía no lo ven los estudiantes.');
      }
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(null);
    }
  };

  const borrar = async () => {
    if (!horario) return volver();
    if (!confirmarBorrar) return setConfirmarBorrar(true);
    setGuardando('borrar');
    try {
      await borrarHorario(horario);
      volver();
    } catch (e) {
      setError(textoError(e, 'No se pudo borrar.'));
      setGuardando(null);
    }
  };

  const verPdf = async () => {
    const url = await urlPdfHorario(horario?.pdf_path ?? null);
    if (url) await WebBrowser.openBrowserAsync(url);
  };

  const agregarAMano = () =>
    setEditando({ clave: nuevaClave(), materia: null, llamado: 1, fecha: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), hora: null, aula: null });

  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Horario de finales" onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  const nuevo = !horario;
  const hayFilas = filas.length > 0;

  const datosGenerales = (
    <>
      {nuevo && (
        <Tarjeta variante="celeste">
          <Text style={s.filaTitulo}>{pdf ? pdf.nombre : '1. Elegí el PDF de una carrera'}</Text>
          <Text style={[s.filaDetalle, { marginTop: 2 }]}>
            {leyendo && progreso
              ? `${progreso} La primera vez descarga el lector (unos 8 MB).`
              : pdf
                ? texto
                  ? carreraId
                    ? `${escaneado ? 'PDF escaneado leído. ' : ''}Encontramos ${filas.length} fechas${dudosas.length ? `, ${dudosas.length} para revisar` : ''}.`
                    : 'Elegí la carrera para ver las fechas.'
                  : 'Sin texto para leer.'
                : 'El horario o anteproyecto de exámenes finales que publica la Dirección Académica. Si está escaneado (con firmas), lo leemos igual.'}
          </Text>
          <Boton
            texto={pdf ? 'Elegir otro PDF' : 'Elegir PDF'}
            icono="document-attach-outline"
            variante={pdf ? 'secundario' : 'primario'}
            compacto
            onPress={elegirPdf}
            cargando={leyendo}
            estilo={{ marginTop: espacio.m, alignSelf: 'flex-start' }}
          />
        </Tarjeta>
      )}
      {(pdf || horario) && (
        <>
          <Text style={s.etiqueta}>Carrera{detectada && nuevo ? ' (detectada en el PDF)' : ''}</Text>
          {nuevo && !carreraId && texto ? <Mensaje tipo="info" texto="No encontramos la carrera en el PDF: elegila para reconocer las materias." /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
            {carreras.map((c) => (
              <Chip key={c.id} texto={c.sigla ?? c.nombre} elegido={carreraId === c.id} onPress={nuevo ? () => { setCarreraId(c.id); setDetectada(false); } : undefined} />
            ))}
          </View>
          {plan && nuevo ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espacio.s, marginBottom: espacio.m }}>
              <Insignia texto={`Plan ${plan} (detectado en el PDF)`} icono="school-outline" />
              <Chip texto="Usar todos los planes" icono="close" onPress={() => setPlan(null)} />
            </View>
          ) : null}
          <Campo etiqueta="Título" value={titulo} onChangeText={(t) => { setTitulo(t); setCambios(true); }} maxLength={120} placeholder="Ej.: Finales diciembre 2026" />
        </>
      )}
      {horario && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
          {horario.publicado ? <Insignia texto="Publicado" icono="eye-outline" /> : <Insignia texto="Borrador" icono="create-outline" color={colores.gris} fondo={fondos.grisFondo} />}
          {horario.pdf_path ? (
            <Pressable onPress={verPdf} accessibilityRole="link">
              <Insignia texto="Ver PDF" icono="open-outline" />
            </Pressable>
          ) : null}
        </View>
      )}
      <Mensaje tipo="info" texto={aviso} />
      <Mensaje texto={error} />
    </>
  );

  const acciones = (pdf || horario) && (
    <>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          icono="notifications-outline"
          titulo="Avisar a los estudiantes"
          detalle={horario?.publicado && estadoAviso(horario) === 'pendiente' ? 'Publicado sin aviso: para avisar, ocultalo y volvé a publicarlo.' : TEXTO_AVISO[estadoAviso(horario)]}
          derecha={<Switch value={notificar && estadoAviso(horario) === 'pendiente'} disabled={estadoAviso(horario) !== 'pendiente' || Boolean(horario?.publicado)} onValueChange={setNotificar} accessibilityLabel="Avisar a los estudiantes" trackColor={{ true: fondos.marino, false: colores.linea }} thumbColor={colores.blanco} />}
          ultima
        />
      </Tarjeta>
      {!horario?.publicado && (
        <Boton texto="Publicar" icono="send" onPress={() => accion('publicar')} cargando={guardando === 'publicar'} deshabilitado={Boolean(guardando)} estilo={{ marginBottom: espacio.m }} />
      )}
      <Boton
        texto={horario?.publicado ? 'Guardar cambios' : 'Guardar borrador'}
        icono="save-outline"
        variante={horario?.publicado ? 'primario' : 'secundario'}
        onPress={() => accion('guardar')}
        cargando={guardando === 'guardar'}
        deshabilitado={Boolean(guardando) || (!cambios && !nuevo)}
        estilo={{ marginBottom: espacio.m }}
      />
      {horario?.publicado && (
        <Boton texto="Ocultar a los estudiantes" icono="eye-off-outline" variante="fantasma" onPress={() => accion('ocultar')} cargando={guardando === 'ocultar'} deshabilitado={Boolean(guardando)} />
      )}
      {sinMateria.length > 0 && <Mensaje tipo="info" texto={`Las ${sinMateria.length} fechas sin materia no se guardan: elegí la materia o borralas.`} />}
      {horario && (
        <>
          {confirmarBorrar && <Mensaje texto="¿Seguro? Se borra el horario y sus fechas para todos. Tocá de nuevo para borrarlo." />}
          <Boton texto={confirmarBorrar ? 'Sí, borrar' : 'Borrar horario'} variante="peligro" icono="trash-outline" onPress={borrar} cargando={guardando === 'borrar'} deshabilitado={Boolean(guardando)} estilo={{ marginTop: espacio.m }} />
        </>
      )}
    </>
  );

  const lista = (pdf || horario) && (
    <>
      <Seccion accion={{ texto: 'Agregar', onPress: agregarAMano }}>
        {hayFilas ? `${filas.length} fechas · ${porMateria.length} materias` : 'Fechas'}
      </Seccion>
      {!hayFilas && (
        <Tarjeta>
          <Text style={s.filaDetalle}>{texto === '' ? 'Cargá las fechas a mano con "Agregar".' : 'No hay fechas todavía.'}</Text>
        </Tarjeta>
      )}
      {dudosas.length > 0 && (
        <>
          <Text style={[s.etiqueta, { color: colores.rojo }]}>Para revisar ({dudosas.length})</Text>
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
            {vistas ? 'Lo que no pudimos leer bien, con el renglón del PDF marcado en rojo.' : 'Lo que no pudimos leer bien.'}
          </Text>
          <Tarjeta estilo={{ paddingVertical: espacio.xs, borderWidth: 1, borderColor: colores.rojo }}>
            {dudosas.map(({ fila, motivo }, i) => (
              <ItemRevision key={fila.clave} motivo={motivo} pagina={fila.zona?.pagina} ultima={i === dudosas.length - 1}>
                <FilaFecha f={fila} ultima onPress={() => setEditando(fila)} mostrarOrigen={!(fila.zona && vistas?.[fila.zona.pagina]?.imagen)} />
                <RecorteOcr paginas={vistas} zona={fila.zona} titulo={null} />
              </ItemRevision>
            ))}
          </Tarjeta>
        </>
      )}
      {porMateria.map(([nombre, l], i) => {
        const nivel = nivelDe.get(nombre)?.nivel ?? null;
        const nuevoNivel = i === 0 || (nivelDe.get(porMateria[i - 1][0])?.nivel ?? null) !== nivel;
        return (
          <View key={nombre}>
            {nuevoNivel && <Text style={[s.etiqueta, { marginTop: i === 0 ? 0 : espacio.m, marginBottom: espacio.s }]}>{nivel == null ? 'Sin nivel' : nombreNivel(nivel)}</Text>}
            <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
              <Text style={[s.filaTitulo, { paddingTop: espacio.s }]}>{nombre}</Text>
              {l.map((f, j) => <FilaFecha key={f.clave} f={f} ultima={j === l.length - 1} onPress={() => setEditando(f)} />)}
            </Tarjeta>
          </View>
        );
      })}
    </>
  );

  return (
    <Pantalla>
      <BarraSuperior titulo={nuevo ? 'Subir horario de finales' : 'Horario de finales'} onVolver={volver} />
      <Columnas
        proporcion={1}
        izquierda={<>{datosGenerales}{acciones}</>}
        derecha={<>{lista}</>}
      />
      <EditorFecha fila={editando} materias={materiasPorNivel} vistas={vistas} onListo={aplicarEdicion} onCerrar={() => setEditando(null)} />
      {lector.vista}
    </Pantalla>
  );
}

function FilaFecha({ f, ultima, onPress, mostrarOrigen }: { f: Fila; ultima: boolean; onPress: () => void; mostrarOrigen?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Editar ${f.materia ?? 'fecha'} ${textoLlamado(f.llamado)}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s + 2, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: colores.linea, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.filaDetalle}>
          <Text style={{ color: colores.texto }}>{textoLlamado(f.llamado)}</Text> · {fechaCorta(f.fecha)}{f.hora ? ` · ${f.hora.slice(0, 5)} h` : ''}{f.aula ? ` · ${f.aula}` : ''}
        </Text>
        {mostrarOrigen && f.origen ? <Text style={[s.filaDetalle, { fontSize: 12, marginTop: 2 }]} numberOfLines={2}>"{f.origen}"</Text> : null}
      </View>
      <Ionicons name="create-outline" size={18} color={colores.textoSuave} />
    </Pressable>
  );
}

/** Hoja para corregir (o agregar) una fecha: materia, llamado, día, hora y aula. */
function EditorFecha({ fila, materias, vistas, onListo, onCerrar }: { fila: Fila | null; materias: string[]; vistas: PaginaVista[] | null; onListo: (f: Fila | null) => void; onCerrar: () => void }) {
  const [materia, setMateria] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [llamado, setLlamado] = useState(1);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [aula, setAula] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fila) return;
    setMateria(fila.materia);
    setBusca('');
    setLlamado(fila.llamado);
    setFecha(isoATexto(fila.fecha));
    setHora(fila.hora?.slice(0, 5) ?? '');
    setAula(fila.aula ?? '');
    setError(null);
  }, [fila]);

  const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const opciones = useMemo(() => {
    const q = sinTildes(busca.trim());
    return (q ? materias.filter((m) => sinTildes(m).includes(q)) : materias).slice(0, 12);
  }, [busca, materias]);

  const listo = () => {
    if (!fila) return;
    if (!materia) return setError('Elegí la materia.');
    const iso = textoAIso(fecha);
    if (!iso) return setError('Elegí la fecha.');
    onListo({ ...fila, materia, llamado, fecha: iso, hora: hora || null, aula: aula.trim() || null });
  };

  return (
    <Hoja visible={Boolean(fila)} titulo={fila?.materia ? 'Editar fecha' : 'Fecha de final'} onCerrar={onCerrar}>
      {fila?.zona && vistas?.[fila.zona.pagina]?.imagen ? (
        <RecorteOcr key={fila.clave} paginas={vistas} zona={fila.zona} titulo={`Así está en el PDF (página ${fila.zona.pagina + 1})`} />
      ) : fila?.origen ? (
        <Mensaje tipo="info" texto={`En el PDF: "${fila.origen}"`} />
      ) : null}
      <Text style={s.etiqueta}>Materia</Text>
      {materia ? (
        <View style={{ flexDirection: 'row', marginBottom: espacio.m }}>
          <Chip texto={materia} elegido icono="close" onPress={() => setMateria(null)} />
        </View>
      ) : (
        <>
          <Campo etiqueta="Buscar materia" value={busca} onChangeText={setBusca} placeholder="Ej.: orgánica" autoCapitalize="none" limpiable />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m, marginTop: -espacio.s }}>
            {opciones.map((m) => <Chip key={m} texto={m} onPress={() => setMateria(m)} />)}
            {!opciones.length && <Text style={s.filaDetalle}>No hay materias con ese nombre en la carrera.</Text>}
          </View>
        </>
      )}
      <Text style={s.etiqueta}>Llamado</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {[1, 2, 3, 4, 5].map((n) => <Chip key={n} texto={textoLlamado(n)} elegido={llamado === n} onPress={() => setLlamado(n)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <CampoFechaHora etiqueta="Fecha" modo="date" valor={fecha} onCambio={setFecha} estilo={{ flex: 3 }} />
        <CampoFechaHora etiqueta="Hora" modo="time" valor={hora} onCambio={setHora} opcional estilo={{ flex: 2 }} />
      </View>
      <Campo etiqueta="Aula (opcional)" value={aula} onChangeText={setAula} maxLength={60} placeholder="Ej.: Aula 12" />
      <Mensaje texto={error} />
      <Boton texto="Listo" icono="checkmark" onPress={listo} />
      {fila && (
        <Boton texto="Borrar esta fecha" variante="peligro" icono="trash-outline" onPress={() => onListo(null)} estilo={{ marginTop: espacio.m }} />
      )}
    </Hoja>
  );
}
