import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CampoFechaHora } from '../../components/fecha';
import { textoProgreso, useLectorOcr } from '../../components/LectorOcr';
import { BarraSuperior, Boton, Campo, Chip, Hoja, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { agregarFechasCalendario, cargarCalendario } from '../../datos/calendario';
import { bytesDeArchivo } from '../../datos/finales-oficiales';
import { leerCalendarioPdf, type EventoLeido } from '../../lib/calendario-pdf';
import { CATEGORIAS_CALENDARIO, NOMBRE_CATEGORIA, problemaEvento, rango, type CategoriaCalendario, type EventoCalendario } from '../../lib/calendario';
import { isoDeTexto } from '../../lib/carnet';
import { textoError } from '../../lib/errores';
import { normalizar } from '../../lib/horario-finales';
import { confianzaMedia, textoDeOcr } from '../../lib/ocr/documento';
import { textoDePdfGeneral } from '../../lib/pdf-texto';
import { colores, espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/calendario'));
const aTexto = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

type Fila = EventoLeido & { clave: string; elegida: boolean; repetida: boolean };

let contador = 0;
const nuevaClave = () => `c${++contador}`;

/** Ya está en el calendario: mismas fechas y el mismo tipo o un título parecido. */
function yaCargada(e: EventoLeido, existentes: EventoCalendario[]): boolean {
  const t = normalizar(e.titulo);
  return existentes.some((x) => x.desde === e.desde && x.hasta === e.hasta && (x.categoria === e.categoria || normalizar(x.titulo) === t));
}

/**
 * Subir el PDF del calendario académico que saca la facultad (con texto o
 * escaneado): se leen las actividades y sus fechas, el admin las revisa y
 * agrega las que quiera.
 */
export default function CalendarioPdf() {
  useTema();
  const lector = useLectorOcr();
  const [nombre, setNombre] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [editando, setEditando] = useState<Fila | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [existentes, setExistentes] = useState<EventoCalendario[]>([]);

  useEffect(() => {
    cargarCalendario(false).then(setExistentes).catch(() => {});
  }, []);

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
      let texto = textoDePdfGeneral(bytes);
      let borroso = false;
      if (!texto.trim()) {
        setProgreso(textoProgreso(null));
        const paginas = await lector.leer(bytes, (p) => setProgreso(textoProgreso(p)));
        texto = textoDeOcr(paginas);
        borroso = confianzaMedia(paginas) < 65;
      }
      setNombre(a.name ?? 'calendario.pdf');
      const { eventos } = leerCalendarioPdf(texto);
      setFilas(eventos.map((e) => {
        const repetida = yaCargada(e, existentes);
        return { ...e, clave: nuevaClave(), repetida, elegida: !repetida };
      }));
      if (!eventos.length) setAviso('No encontramos fechas en este PDF. Cargalas a mano con "Nueva fecha".');
      else if (borroso) setAviso('El escaneo se ve borroso: revisá bien cada fecha antes de agregarla.');
    } catch (e) {
      setError(textoError(e, 'No se pudo leer el PDF.'));
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  };

  const elegidas = filas.filter((f) => f.elegida);
  const repetidas = filas.filter((f) => f.repetida).length;
  const ordenadas = useMemo(() => [...filas].sort((a, b) => a.desde.localeCompare(b.desde) || a.titulo.localeCompare(b.titulo, 'es')), [filas]);

  const alternar = (clave: string) => setFilas((l) => l.map((f) => (f.clave === clave ? { ...f, elegida: !f.elegida } : f)));
  const todas = (v: boolean) => setFilas((l) => l.map((f) => ({ ...f, elegida: v })));

  const agregar = async () => {
    setError(null);
    const malas = elegidas.map((f) => ({ f, p: problemaEvento(f) })).filter((x) => x.p);
    if (malas.length) {
      setEditando(malas[0].f);
      return setError(`Corregí "${malas[0].f.titulo}": ${malas[0].p}`);
    }
    setGuardando(true);
    try {
      await agregarFechasCalendario(elegidas.map((f) => ({ titulo: f.titulo, categoria: f.categoria, semestre: f.semestre, desde: f.desde, hasta: f.hasta, detalle: '' })));
      volver();
    } catch (e) {
      setError(textoError(e, 'No se pudieron agregar las fechas.'));
      setGuardando(false);
    }
  };

  return (
    <Pantalla>
      <BarraSuperior titulo="Subir calendario" onVolver={volver} />
      <Tarjeta variante="celeste">
        <Text style={s.filaTitulo}>{nombre ?? 'El PDF del calendario académico'}</Text>
        <Text style={[s.filaDetalle, { marginTop: 2 }]}>
          {leyendo && progreso
            ? `${progreso} La primera vez descarga el lector (unos 8 MB).`
            : nombre
              ? `Encontramos ${filas.length} fechas${repetidas ? `, ${repetidas} ya estaban cargadas` : ''}. Revisalas y agregá las que correspondan.`
              : 'El que publica la facultad. Si está escaneado (con firmas y sellos), lo leemos igual. Antes de agregar nada vas a poder revisar cada fecha.'}
        </Text>
        <Boton
          texto={nombre ? 'Elegir otro PDF' : 'Elegir PDF'}
          icono="document-attach-outline"
          variante={nombre ? 'secundario' : 'primario'}
          compacto
          onPress={elegirPdf}
          cargando={leyendo}
          estilo={{ marginTop: espacio.m, alignSelf: 'flex-start' }}
        />
      </Tarjeta>
      <Mensaje tipo="info" texto={aviso} />
      <Mensaje texto={error} />

      {filas.length > 0 && (
        <>
          <Seccion accion={{ texto: elegidas.length === filas.length ? 'Ninguna' : 'Todas', onPress: () => todas(elegidas.length !== filas.length) }}>
            {`${elegidas.length} de ${filas.length} para agregar`}
          </Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {ordenadas.map((f, i) => (
              <FilaEvento key={f.clave} f={f} ultima={i === ordenadas.length - 1} onAlternar={() => alternar(f.clave)} onEditar={() => setEditando(f)} />
            ))}
          </Tarjeta>
          <Boton
            texto={elegidas.length ? `Agregar ${elegidas.length} ${elegidas.length === 1 ? 'fecha' : 'fechas'}` : 'Elegí al menos una'}
            icono="add"
            onPress={agregar}
            cargando={guardando}
            deshabilitado={!elegidas.length || guardando}
            estilo={{ marginTop: espacio.m }}
          />
          <Text style={[s.filaDetalle, { marginTop: espacio.s }]}>Las fechas se agregan al calendario que ven todos. Después las podés editar o borrar una por una.</Text>
        </>
      )}
      <View style={{ height: espacio.xl }} />
      <EditorEvento
        fila={editando}
        onCerrar={() => setEditando(null)}
        onListo={(f) => {
          setFilas((l) => l.map((x) => (x.clave === f.clave ? f : x)));
          setEditando(null);
          setError(null);
        }}
      />
      {lector.vista}
    </Pantalla>
  );
}

function FilaEvento({ f, ultima, onAlternar, onEditar }: { f: Fila; ultima: boolean; onAlternar: () => void; onEditar: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, paddingVertical: espacio.s + 2, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: colores.linea }}>
      <Pressable onPress={onAlternar} accessibilityRole="checkbox" accessibilityState={{ checked: f.elegida }} accessibilityLabel={`Agregar ${f.titulo}`} hitSlop={8}>
        <Ionicons name={f.elegida ? 'checkbox' : 'square-outline'} size={24} color={f.elegida ? colores.marino : colores.textoSuave} />
      </Pressable>
      <Pressable onPress={onEditar} accessibilityRole="button" accessibilityLabel={`Editar ${f.titulo}`} style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: espacio.s, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.filaTitulo, { fontSize: 15 }]} numberOfLines={2}>{f.titulo}</Text>
          <Text style={s.filaDetalle}>
            {rango(f.desde, f.hasta)}{f.desde.slice(0, 4) === f.hasta.slice(0, 4) ? ` ${f.desde.slice(0, 4)}` : ''} · {NOMBRE_CATEGORIA[f.categoria]}
            {f.repetida ? ' · ya está cargada' : ''}
          </Text>
        </View>
        <Ionicons name="create-outline" size={18} color={colores.textoSuave} />
      </Pressable>
    </View>
  );
}

const SEMESTRES: { valor: 1 | 2 | null; texto: string }[] = [
  { valor: 1, texto: '1.er semestre' },
  { valor: 2, texto: '2.º semestre' },
  { valor: null, texto: 'Todo el año' },
];

function EditorEvento({ fila, onListo, onCerrar }: { fila: Fila | null; onListo: (f: Fila) => void; onCerrar: () => void }) {
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState<CategoriaCalendario>('clases');
  const [semestre, setSemestre] = useState<1 | 2 | null>(1);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fila) return;
    setTitulo(fila.titulo);
    setCategoria(fila.categoria);
    setSemestre(fila.semestre);
    setDesde(aTexto(fila.desde));
    setHasta(fila.hasta !== fila.desde ? aTexto(fila.hasta) : '');
    setError(null);
  }, [fila]);

  const listo = () => {
    if (!fila) return;
    const d = isoDeTexto(desde) ?? '';
    const h = hasta ? (isoDeTexto(hasta) ?? '') : d;
    const problema = problemaEvento({ titulo, desde: d, hasta: h });
    if (problema) return setError(problema);
    onListo({ ...fila, titulo: titulo.trim(), categoria, semestre, desde: d, hasta: h, anio: Number(d.slice(0, 4)), elegida: true });
  };

  return (
    <Hoja visible={Boolean(fila)} titulo="Revisar fecha" onCerrar={onCerrar}>
      {fila?.origen ? <Mensaje tipo="info" texto={`En el PDF: "${fila.origen}"`} /> : null}
      <Campo etiqueta="Qué es" value={titulo} onChangeText={setTitulo} maxLength={160} />
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {CATEGORIAS_CALENDARIO.map((c) => <Chip key={c} texto={NOMBRE_CATEGORIA[c]} elegido={categoria === c} onPress={() => setCategoria(c)} />)}
      </View>
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Semestre</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {SEMESTRES.map((o) => <Chip key={String(o.valor)} texto={o.texto} elegido={semestre === o.valor} onPress={() => setSemestre(o.valor)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <CampoFechaHora etiqueta="Desde" modo="date" valor={desde} onCambio={setDesde} estilo={{ flex: 1 }} />
        <CampoFechaHora etiqueta="Hasta" modo="date" valor={hasta} onCambio={setHasta} opcional estilo={{ flex: 1 }} />
      </View>
      <Mensaje texto={error} />
      <Boton texto="Listo" icono="checkmark" onPress={listo} />
    </Hoja>
  );
}
