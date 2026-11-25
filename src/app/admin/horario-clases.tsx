import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Columnas } from '../../components/disposicion';
import { CampoFechaHora } from '../../components/fecha';
import { textoProgreso, useLectorOcr } from '../../components/LectorOcr';
import { ItemRevision, RecorteOcr, type PaginaVista } from '../../components/RecorteOcr';
import { BarraSuperior, Boton, Campo, Cargando, Chip, Fila, Hoja, Insignia, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { cargarCarreras } from '../../datos/admin';
import { aniosDePlanes, bytesDeArchivo, fichasDeMaterias, materiasDeCarrera } from '../../datos/finales-oficiales';
import {
  actualizarHorarioClases, borrarHorarioClases, cargarHorarioClases, crearHorarioClases, guardarClasesOficiales, ocultarHorarioClases, publicarHorarioClases,
  urlPdfHorarioClases, type ClaseEditable,
} from '../../datos/horarios-clases';
import { estadoAviso, TEXTO_AVISO } from '../../lib/aviso-publicacion';
import { textoError } from '../../lib/errores';
import { leerHorarioClases, NOMBRE_DIA, planesDeHojas, textoNivel, type ParaRevisar } from '../../lib/horario-clases';
import { detectarCarrera, detectarPlan, normalizar, type FichaMateria } from '../../lib/horario-finales';
import { confianzaMedia, filasDeOcr, textoDeFilas, type FilaDoc, type Zona } from '../../lib/ocr/documento';
import { filasDePdfGeneral } from '../../lib/pdf-texto';
import { infoTipoClase, TIPOS_CLASE, type TipoClase } from '../../lib/tipo-clase';
import type { Carrera, HorarioClasesDb } from '../../lib/tipos-db';
import { colores, espacio, fondos } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/horarios-clases'));

/** Clase en edición: la materia puede faltar hasta que el admin la elija. */
type FilaClase = Omit<ClaseEditable, 'materia'> & { clave: string; materia: string | null; origen?: string; zona?: Zona | null; pagina?: number };

let contador = 0;
const nuevaClave = () => `k${++contador}`;

/** "Horario de clases · 1.er periodo 2027" a partir del encabezado. */
function tituloDeHorario(texto: string, ahora = new Date()): string {
  const n = normalizar(texto.slice(0, 1500));
  const m = /\b(1|2|primer|segundo)\s*\.?\s*(?:er|do|o)?\.?\s*(periodo|semestre)\s*(?:academico\s*)?(?:de\s*|del\s*)?(20\d\d)?/.exec(n);
  const anio = m?.[3] ?? /\b(20[2-4]\d)\b/.exec(n)?.[1] ?? String(ahora.getFullYear());
  if (m) {
    const num = m[1] === '1' || m[1] === 'primer' ? '1.er' : '2.º';
    return `Horario de clases · ${num} ${m[2]} ${anio}`;
  }
  return `Horario de clases · ${anio}`;
}

/**
 * Subir el horario de clases de una carrera (PDF de la facultad, casi
 * siempre escaneado), revisar lo que se leyó y publicarlo. Con ?id= abre
 * uno ya cargado.
 */
export default function HorarioClasesAdmin() {
  useTema();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const lector = useLectorOcr();
  const [horario, setHorario] = useState<HorarioClasesDb | null>(null);
  const [cargando, setCargando] = useState(Boolean(id));
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [detectada, setDetectada] = useState(false);
  const [planes, setPlanes] = useState<number[]>([]);
  const [plan, setPlan] = useState<number | null>(null);
  const [planDetectado, setPlanDetectado] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [materias, setMaterias] = useState<string[]>([]);
  const [fichas, setFichas] = useState<FichaMateria[]>([]);
  // Planes que trae el PDF (una hoja por carrera, plan y nivel): plan → cantidad de hojas.
  const [planesDoc, setPlanesDoc] = useState<Map<number, number>>(new Map());
  const [doc, setDoc] = useState<FilaDoc[] | null>(null);
  // Páginas escaneadas (con su imagen) para mostrar el recorte de lo que hay que revisar.
  const [vistas, setVistas] = useState<PaginaVista[] | null>(null);
  const [revisar, setRevisar] = useState<(ParaRevisar & { clave: string })[]>([]);
  // Ítem "sin hora de fin" que se está completando en el editor.
  const pendiente = useRef<string | null>(null);
  const [pdf, setPdf] = useState<{ bytes: Uint8Array; nombre: string } | null>(null);
  const [filas, setFilas] = useState<FilaClase[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [editando, setEditando] = useState<FilaClase | null>(null);
  const [notificar, setNotificar] = useState(true);
  const [manual, setManual] = useState(false);
  const [guardando, setGuardando] = useState<null | 'guardar' | 'publicar' | 'ocultar' | 'borrar'>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cambios, setCambios] = useState(false);

  useEffect(() => {
    cargarCarreras().then(setCarreras).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    cargarHorarioClases(id)
      .then((r) => {
        if (!r) return setError('Ese horario ya no existe.');
        setHorario(r.horario);
        setCarreraId(r.horario.carrera_id);
        setPlan(r.horario.plan_anio);
        setTitulo(r.horario.titulo);
        setFilas(r.clases.map((c) => ({ clave: nuevaClave(), materia: c.materia, nivel: c.nivel, seccion: c.seccion, dia_semana: c.dia_semana, hora_inicio: c.hora_inicio.slice(0, 5), hora_fin: c.hora_fin.slice(0, 5), aula: c.aula, tipo_clase: c.tipo_clase })));
      })
      .catch((e) => setError(textoError(e, 'No se pudo cargar el horario.')))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(() => {
    if (!carreraId) return setPlanes([]);
    aniosDePlanes(carreraId).then(setPlanes).catch(() => {});
    fichasDeMaterias(carreraId).then(setFichas).catch(() => setFichas([]));
  }, [carreraId]);

  // PDF con hojas de varios planes: se muestra el plan con más hojas de los que tiene la carrera
  // (un horario por plan, para que cada estudiante vea solo el suyo).
  const planAutomatico = useRef<{ doc: Map<number, number>; planes: number[] } | null>(null);
  useEffect(() => {
    // Una vez por PDF y por lista de planes (cuando llega la de la carrera detectada): después manda lo que elija el admin.
    if (planesDoc.size < 2 || !planes.length) return;
    if (planAutomatico.current?.doc === planesDoc && planAutomatico.current.planes === planes) return;
    planAutomatico.current = { doc: planesDoc, planes };
    const candidatos = [...planesDoc.entries()].filter(([p]) => planes.includes(p)).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const elegido = candidatos[0]?.[0] ?? null;
    const lista = [...planesDoc.keys()].sort();
    const cuales = `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
    if (elegido != null) {
      setPlan(elegido);
      setPlanDetectado(true);
    }
    const texto = elegido != null
      ? `Este PDF trae hojas de los planes ${cuales}. Ahora ves las del plan ${elegido}: guardalo y, para otro plan, subí el mismo PDF en un horario nuevo y elegí ese plan.`
      : `Este PDF trae hojas de los planes ${cuales}, que no están cargados en esta carrera: revisá que sea la carrera correcta.`;
    // Se suma al aviso que ya hubiera (escaneo borroso), reemplazando el de planes anterior.
    setAviso((v) => [v?.split('Este PDF trae hojas')[0].trim(), texto].filter(Boolean).join(' '));
  }, [planesDoc, planes]);

  useEffect(() => {
    if (!carreraId) return setMaterias([]);
    let activo = true;
    materiasDeCarrera(carreraId, plan).then((m) => activo && setMaterias(m)).catch(() => {});
    return () => {
      activo = false;
    };
  }, [carreraId, plan]);

  // Con el documento y las materias se leen las clases (y se vuelven a leer si cambia la carrera o el plan).
  useEffect(() => {
    if (!doc || !materias.length) return;
    const r = leerHorarioClases(doc, materias, plan, fichas);
    setFilas(r.clases.map((c) => ({ clave: nuevaClave(), materia: c.materia, nivel: c.nivel, seccion: c.seccion, dia_semana: c.dia, hora_inicio: c.inicio, hora_fin: c.fin, aula: c.aula, tipo_clase: c.tipo, origen: c.origen, zona: c.zona, pagina: c.pagina })));
    // Las materias fuera de la malla ya aparecen como clases para revisar.
    setRevisar(r.revisar.filter((x) => x.motivo !== 'materia').map((x) => ({ ...x, clave: nuevaClave() })));
  }, [doc, materias, plan, fichas]);

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
      await new Promise((ok) => setTimeout(ok, 50));
      let filasDoc = filasDePdfGeneral(bytes);
      setVistas(null);
      if (!filasDoc.length) {
        setProgreso(textoProgreso(null));
        const paginas = await lector.leer(bytes, (p) => setProgreso(textoProgreso(p)));
        filasDoc = filasDeOcr(paginas);
        setVistas(paginas.map((p) => ({ ancho: p.ancho, alto: p.alto, imagen: p.imagen })));
        if (filasDoc.length && confianzaMedia(paginas) < 65) setAviso('El escaneo se ve borroso: revisá bien cada clase antes de publicar.');
      }
      const texto = textoDeFilas(filasDoc);
      setPdf({ bytes, nombre: a.name ?? 'horario.pdf' });
      setDoc(filasDoc);
      if (!filasDoc.length) {
        setFilas([]);
        setAviso('No encontramos texto en este PDF. Podés cargar las clases a mano con "Agregar".');
      }
      const c = texto ? detectarCarrera(texto, carreras) : null;
      if (c) setCarreraId(c);
      setDetectada(Boolean(c));
      const hojas = planesDeHojas(filasDoc);
      setPlanesDoc(hojas);
      const p = hojas.size === 1 ? [...hojas.keys()][0] : hojas.size > 1 ? null : detectarPlan(texto);
      setPlan(p);
      setPlanDetectado(Boolean(p));
      if (!titulo) setTitulo(tituloDeHorario(texto));
      setCambios(true);
    } catch (e) {
      setError(`${textoError(e, 'No se pudo leer el PDF.')} Podés cargar las clases a mano con "Agregar".`);
      setManual(true);
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  };

  const sinMateria = filas.filter((f) => !f.materia);
  // Lo que conviene mirar antes de publicar, cada cosa con su motivo.
  const dudosas = useMemo(() => {
    const enMalla = new Set(materias);
    const l: { fila: FilaClase; motivo: string }[] = [];
    for (const f of filas) {
      if (!f.materia) l.push({ fila: f, motivo: 'No reconocimos la materia. Elegila (o borrá la clase).' });
      else if (materias.length && !enMalla.has(f.materia)) l.push({ fila: f, motivo: `"${f.materia}" no está en la malla de este plan. Elegí la materia correcta, o dejala así si es una optativa.` });
    }
    const pag = (x: { fila: FilaClase }) => x.fila.pagina ?? x.fila.zona?.pagina ?? 999;
    return l.sort((a, b) => pag(a) - pag(b));
  }, [filas, materias]);
  const totalRevisar = dudosas.length + revisar.length;

  const resolver = (clave: string) => setRevisar((l) => l.filter((x) => x.clave !== clave));
  const completarClase = (r: ParaRevisar & { clave: string }) => {
    const ultima = filas[filas.length - 1];
    // Se quita de la lista solo si la clase se guarda (ver aplicarEdicion).
    pendiente.current = r.clave;
    setEditando({ clave: nuevaClave(), materia: r.materia && materias.includes(r.materia) ? r.materia : null, nivel: ultima?.nivel ?? null, seccion: null, dia_semana: r.dia ?? 1, hora_inicio: r.inicio ?? '07:00', hora_fin: '', aula: null, tipo_clase: null, origen: r.texto, zona: r.zona });
  };
  const ponerNivel = (r: ParaRevisar & { clave: string }, nivel: number) => {
    setFilas((l) => l.map((f) => (f.nivel == null && f.pagina != null && f.pagina === r.pagina ? { ...f, nivel } : f)));
    resolver(r.clave);
    setCambios(true);
  };
  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; filas: FilaClase[] }>();
    for (const f of filas) {
      if (!f.materia) continue;
      const k = `${f.nivel ?? 99}|${f.seccion ?? ''}`;
      const t = [f.nivel ? textoNivel(f.nivel) : 'Sin nivel', f.seccion ? `sección ${f.seccion}` : ''].filter(Boolean).join(' · ');
      m.set(k, { titulo: t, filas: [...(m.get(k)?.filas ?? []), f] });
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
      .map(([k, g]) => ({ clave: k, titulo: g.titulo, filas: g.filas.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)) }));
  }, [filas]);

  const aplicarEdicion = (f: FilaClase | null) => {
    const original = editando;
    setEditando(null);
    if (pendiente.current) {
      const clave = pendiente.current;
      pendiente.current = null;
      setRevisar((l) => l.filter((x) => x.clave !== clave));
    }
    if (!original) return;
    setFilas((l) => {
      const existe = l.some((x) => x.clave === original.clave);
      if (!f) return l.filter((x) => x.clave !== original.clave);
      return existe ? l.map((x) => (x.clave === original.clave ? f : x)) : [...l, f];
    });
    setCambios(true);
  };

  const guardar = async (): Promise<string | null> => {
    if (!carreraId) {
      setError('Elegí la carrera.');
      return null;
    }
    if (titulo.trim().length < 3) {
      setError('Poné un título (por ejemplo, "Horario de clases · 1.er periodo 2027").');
      return null;
    }
    const listas = filas.filter((f): f is FilaClase & { materia: string } => Boolean(f.materia)).map(({ clave: _c, origen: _o, ...c }) => c);
    if (horario) {
      if (titulo.trim() !== horario.titulo || plan !== horario.plan_anio) await actualizarHorarioClases(horario.id, { titulo, plan_anio: plan });
      await guardarClasesOficiales(horario.id, listas);
      setFilas((l) => l.filter((f) => f.materia));
      setCambios(false);
      return horario.id;
    }
    const nuevo = await crearHorarioClases(carreraId, plan, titulo, pdf?.bytes ?? null, listas);
    const r = await cargarHorarioClases(nuevo);
    if (r) setHorario(r.horario);
    setFilas((l) => l.filter((f) => f.materia));
    setCambios(false);
    return nuevo;
  };

  const accion = async (tipo: 'guardar' | 'publicar' | 'ocultar') => {
    setError(null);
    setAviso(null);
    if (tipo === 'publicar' && !filas.some((f) => f.materia)) return setError('No hay clases con materia para publicar.');
    setGuardando(tipo);
    try {
      if (tipo === 'ocultar') {
        await ocultarHorarioClases(horario!.id);
        setHorario((h) => (h ? { ...h, publicado: false } : h));
        setAviso('Listo: los estudiantes ya no lo ven.');
        return;
      }
      const hid = await guardar();
      if (!hid) return;
      if (tipo === 'publicar') {
        const avisar = notificar && estadoAviso(horario) === 'pendiente';
        const n = await publicarHorarioClases(hid, avisar);
        const ahora = new Date().toISOString();
        setHorario((h) => (h ? { ...h, publicado: true, publicado_en: h.publicado_en ?? ahora, avisado_en: avisar ? ahora : h.avisado_en } : h));
        setAviso(`Publicado: ${n} clases.${avisar ? ' Les avisamos a los estudiantes de la carrera.' : ''}`);
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
      await borrarHorarioClases(horario);
      volver();
    } catch (e) {
      setError(textoError(e, 'No se pudo borrar.'));
      setGuardando(null);
    }
  };

  const verPdf = async () => {
    const url = await urlPdfHorarioClases(horario?.pdf_path ?? null);
    if (url) await WebBrowser.openBrowserAsync(url);
  };

  const agregarAMano = () => {
    const ultima = filas[filas.length - 1];
    setEditando({ clave: nuevaClave(), materia: null, nivel: ultima?.nivel ?? null, seccion: ultima?.seccion ?? null, dia_semana: 1, hora_inicio: '07:00', hora_fin: '08:30', aula: null, tipo_clase: null });
  };

  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Horario de clases" onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  const nuevo = !horario;
  // Sin PDF leído también se puede armar el borrador a mano (por ejemplo, si el lector falló).
  const hayAlgo = Boolean(pdf || horario || manual);

  const datosGenerales = (
    <>
      {nuevo && (
        <Tarjeta variante="celeste">
          <Text style={s.filaTitulo}>{pdf ? pdf.nombre : '1. Elegí el PDF de una carrera'}</Text>
          <Text style={[s.filaDetalle, { marginTop: 2 }]}>
            {leyendo && progreso
              ? `${progreso} La primera vez descarga el lector (unos 8 MB).`
              : pdf
                ? doc?.length
                  ? carreraId
                    ? `Encontramos ${filas.length} clases${totalRevisar ? `, ${totalRevisar} para revisar` : ''}.`
                    : 'Elegí la carrera para reconocer las materias.'
                  : 'Sin texto para leer.'
                : 'El horario de clases del periodo que publica la facultad. Si está escaneado (con firmas y sellos), lo leemos igual.'}
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
          {!pdf && !manual && !leyendo && (
            <Boton texto="Cargar a mano, sin PDF" icono="create-outline" variante="fantasma" compacto onPress={() => setManual(true)} estilo={{ marginTop: espacio.s, alignSelf: 'flex-start' }} />
          )}
        </Tarjeta>
      )}
      {hayAlgo && (
        <>
          <Text style={s.etiqueta}>Carrera{detectada && nuevo ? ' (detectada en el PDF)' : ''}</Text>
          {nuevo && !carreraId && doc?.length ? <Mensaje tipo="info" texto="No encontramos la carrera en el PDF: elegila para reconocer las materias." /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
            {carreras.map((c) => (
              <Chip key={c.id} texto={c.sigla ?? c.nombre} elegido={carreraId === c.id} onPress={nuevo ? () => { setCarreraId(c.id); setDetectada(false); } : undefined} />
            ))}
          </View>
          {carreraId && planes.length > 0 && (
            <>
              <Text style={s.etiqueta}>Plan{planDetectado && plan ? ' (detectado en el PDF)' : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
                {planes.map((p) => <Chip key={p} texto={`Plan ${p}`} elegido={plan === p} onPress={() => { setPlan(p); setPlanDetectado(false); setCambios(true); }} />)}
                <Chip texto="Todos" elegido={plan == null} onPress={() => { setPlan(null); setPlanDetectado(false); setCambios(true); }} />
              </View>
            </>
          )}
          <Campo etiqueta="Título" value={titulo} onChangeText={(t) => { setTitulo(t); setCambios(true); }} maxLength={120} placeholder="Ej.: Horario de clases · 1.er periodo 2027" />
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

  const acciones = hayAlgo && (
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
      {sinMateria.length > 0 && <Mensaje tipo="info" texto={`Las ${sinMateria.length} clases sin materia no se guardan: elegí la materia o borralas.`} />}
      {horario && (
        <>
          {confirmarBorrar && <Mensaje texto="¿Seguro? Se borra el horario y sus clases para todos (las agendas de los estudiantes no se tocan). Tocá de nuevo para borrarlo." />}
          <Boton texto={confirmarBorrar ? 'Sí, borrar' : 'Borrar horario'} variante="peligro" icono="trash-outline" onPress={borrar} cargando={guardando === 'borrar'} deshabilitado={Boolean(guardando)} estilo={{ marginTop: espacio.m }} />
        </>
      )}
    </>
  );

  const lista = hayAlgo && (
    <>
      <Seccion accion={{ texto: 'Agregar', onPress: agregarAMano }}>{filas.length ? `${filas.length} clases` : 'Clases'}</Seccion>
      {!filas.length && (
        <Tarjeta>
          <Text style={s.filaDetalle}>Todavía no hay clases. Cargalas a mano con "Agregar".</Text>
        </Tarjeta>
      )}
      {totalRevisar > 0 && (
        <>
          <Text style={[s.etiqueta, { color: colores.rojo }]}>Para revisar ({totalRevisar})</Text>
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
            {vistas ? 'Lo que no pudimos leer bien, con el pedazo del PDF marcado en rojo.' : 'Lo que no pudimos leer bien.'}
          </Text>
          <Tarjeta estilo={{ paddingVertical: espacio.xs, borderWidth: 1, borderColor: colores.rojo }}>
            {dudosas.map(({ fila, motivo }, i) => (
              <ItemRevision key={fila.clave} motivo={motivo} pagina={fila.pagina ?? fila.zona?.pagina} ultima={i === dudosas.length - 1 && !revisar.length}>
                <FilaDeClase f={fila} ultima onPress={() => setEditando(fila)} mostrarOrigen={!vistas} />
                <RecorteOcr paginas={vistas} zona={fila.zona} titulo={null} />
              </ItemRevision>
            ))}
            {revisar.map((r, i) => (
              <ItemRevision
                key={r.clave}
                pagina={r.pagina ?? r.zona?.pagina}
                motivo={
                  r.motivo === 'sin-fin'
                    ? `${r.materia ?? 'Una clase'}: empieza el ${NOMBRE_DIA[r.dia ?? 1].toLowerCase()} a las ${r.inicio}, pero no leímos a qué hora termina.`
                    : `${r.texto}. Elegilo para las clases de esa hoja:`
                }
                ultima={i === revisar.length - 1}
              >
                <RecorteOcr paginas={vistas} zona={r.zona} titulo={null} />
                {r.motivo === 'sin-fin' ? (
                  <View style={{ flexDirection: 'row', gap: espacio.s, flexWrap: 'wrap' }}>
                    <Boton texto="Completar la clase" icono="add" variante="secundario" compacto onPress={() => completarClase(r)} />
                    <Boton texto="No va" icono="close" variante="fantasma" compacto onPress={() => resolver(r.clave)} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s }}>
                    {NIVELES.map((n) => <Chip key={n} texto={String(n)} onPress={() => ponerNivel(r, n)} />)}
                  </View>
                )}
              </ItemRevision>
            ))}
          </Tarjeta>
        </>
      )}
      {grupos.map((g) => (
        <View key={g.clave}>
          <Text style={s.etiqueta}>{g.titulo}</Text>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {g.filas.map((f, i) => <FilaDeClase key={f.clave} f={f} ultima={i === g.filas.length - 1} onPress={() => setEditando(f)} />)}
          </Tarjeta>
        </View>
      ))}
    </>
  );

  return (
    <Pantalla>
      <BarraSuperior titulo={nuevo ? 'Subir horario de clases' : 'Horario de clases'} onVolver={volver} />
      <Columnas proporcion={1} izquierda={<>{datosGenerales}{acciones}</>} derecha={<>{lista}</>} />
      <EditorClase fila={editando} materias={materias} vistas={vistas} onListo={aplicarEdicion} onCerrar={() => { pendiente.current = null; setEditando(null); }} />
      {lector.vista}
    </Pantalla>
  );
}

function FilaDeClase({ f, ultima, onPress, mostrarOrigen }: { f: FilaClase; ultima: boolean; onPress: () => void; mostrarOrigen?: boolean }) {
  const tipo = infoTipoClase(f.tipo_clase);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Editar ${f.materia ?? 'clase'} ${NOMBRE_DIA[f.dia_semana]}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s + 2, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: colores.linea, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {f.materia ? <Text style={[s.filaTitulo, { fontSize: 15 }]} numberOfLines={1}>{f.materia}</Text> : null}
        <Text style={s.filaDetalle}>
          <Text style={{ color: colores.texto }}>{NOMBRE_DIA[f.dia_semana]}</Text> · {f.hora_inicio} a {f.hora_fin}{tipo ? ` · ${tipo.texto}` : ''}{f.aula ? ` · ${f.aula}` : ''}
        </Text>
        {mostrarOrigen && f.origen ? <Text style={[s.filaDetalle, { fontSize: 12, marginTop: 2 }]} numberOfLines={2}>"{f.origen}"</Text> : null}
      </View>
      <Ionicons name="create-outline" size={18} color={colores.textoSuave} />
    </Pressable>
  );
}

const NIVELES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Hoja para corregir (o agregar) una clase. */
function EditorClase({ fila, materias, vistas, onListo, onCerrar }: { fila: FilaClase | null; materias: string[]; vistas: PaginaVista[] | null; onListo: (f: FilaClase | null) => void; onCerrar: () => void }) {
  const [materia, setMateria] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [nivel, setNivel] = useState<number | null>(null);
  const [seccion, setSeccion] = useState('');
  const [dia, setDia] = useState(1);
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [aula, setAula] = useState('');
  const [tipo, setTipo] = useState<TipoClase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fila) return;
    setMateria(fila.materia);
    setBusca('');
    setNivel(fila.nivel);
    setSeccion(fila.seccion ?? '');
    setDia(fila.dia_semana);
    setInicio(fila.hora_inicio);
    setFin(fila.hora_fin);
    setAula(fila.aula ?? '');
    setTipo(fila.tipo_clase);
    setError(null);
  }, [fila]);

  const opciones = useMemo(() => {
    const q = normalizar(busca);
    return (q ? materias.filter((m) => normalizar(m).includes(q)) : materias).slice(0, 12);
  }, [busca, materias]);

  const listo = () => {
    if (!fila) return;
    if (!materia) return setError('Elegí la materia.');
    if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) return setError('Elegí la hora de inicio y de fin.');
    if (fin <= inicio) return setError('La clase tiene que terminar después de empezar.');
    onListo({ ...fila, materia, nivel, seccion: seccion.trim() || null, dia_semana: dia, hora_inicio: inicio, hora_fin: fin, aula: aula.trim() || null, tipo_clase: tipo });
  };

  return (
    <Hoja visible={Boolean(fila)} titulo={fila?.materia ? 'Editar clase' : 'Clase'} onCerrar={onCerrar}>
      {fila?.zona && vistas?.[fila.zona.pagina]?.imagen ? (
        <RecorteOcr paginas={vistas} zona={fila.zona} titulo={`Así está en el PDF (página ${fila.zona.pagina + 1})`} />
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
          <Campo etiqueta="Buscar materia" value={busca} onChangeText={setBusca} placeholder="Ej.: orgánica" autoCapitalize="none" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m, marginTop: -espacio.s }}>
            {opciones.map((m) => <Chip key={m} texto={m} onPress={() => setMateria(m)} />)}
            {!opciones.length && <Text style={s.filaDetalle}>No hay materias con ese nombre en la carrera.</Text>}
          </View>
        </>
      )}
      <Text style={s.etiqueta}>Día</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {[1, 2, 3, 4, 5, 6].map((d) => <Chip key={d} texto={NOMBRE_DIA[d]} elegido={dia === d} onPress={() => setDia(d)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <CampoFechaHora etiqueta="Empieza" modo="time" valor={inicio} onCambio={setInicio} estilo={{ flex: 1 }} />
        <CampoFechaHora etiqueta="Termina" modo="time" valor={fin} onCambio={setFin} estilo={{ flex: 1 }} />
      </View>
      <Text style={s.etiqueta}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {TIPOS_CLASE.map((t) => <Chip key={t.valor} texto={t.texto} icono={t.icono} elegido={tipo === t.valor} onPress={() => setTipo(tipo === t.valor ? null : t.valor)} />)}
      </View>
      <Campo etiqueta="Aula (opcional)" value={aula} onChangeText={setAula} maxLength={60} placeholder="Ej.: Aula 12" />
      <Text style={s.etiqueta}>Nivel</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {NIVELES.map((n) => <Chip key={n} texto={String(n)} elegido={nivel === n} onPress={() => setNivel(nivel === n ? null : n)} />)}
      </View>
      <Campo etiqueta="Sección (opcional)" value={seccion} onChangeText={setSeccion} maxLength={20} placeholder="Ej.: A" />
      <Mensaje texto={error} />
      <Boton texto="Listo" icono="checkmark" onPress={listo} />
      {fila && <Boton texto="Borrar esta clase" variante="peligro" icono="trash-outline" onPress={() => onListo(null)} estilo={{ marginTop: espacio.m }} />}
    </Hoja>
  );
}
