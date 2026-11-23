import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { CampoFechaHora } from '../../components/fecha';
import { BarraSuperior, Boton, Campo, Cargando, Chip, Mensaje, Pantalla, s } from '../../components/ui';
import { useTema } from '../../context/TemaProvider';
import { borrarFechaCalendario, cargarFechaCalendario, guardarFechaCalendario, type FormularioFecha } from '../../datos/calendario';
import { CATEGORIAS_CALENDARIO, NOMBRE_CATEGORIA, problemaEvento } from '../../lib/calendario';
import { isoDeTexto } from '../../lib/carnet';
import { textoError } from '../../lib/errores';
import { espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/calendario'));

/** "2026-11-23" → "23/11/2026" (lo que usa el selector de fecha). */
const aTexto = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const SEMESTRES: { valor: 1 | 2 | null; texto: string }[] = [
  { valor: 1, texto: '1.er semestre' },
  { valor: 2, texto: '2.º semestre' },
  { valor: null, texto: 'Todo el año' },
];

export default function EditarFecha() {
  useTema();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = Boolean(id);
  const [cargando, setCargando] = useState(editando);
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState<FormularioFecha['categoria']>('examenes');
  const [semestre, setSemestre] = useState<1 | 2 | null>(1);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    cargarFechaCalendario(id)
      .then((e) => {
        if (!e) return setError('Esta fecha ya no existe.');
        setTitulo(e.titulo);
        setCategoria(e.categoria);
        setSemestre(e.semestre === 1 || e.semestre === 2 ? e.semestre : null);
        setDesde(aTexto(e.desde));
        setHasta(aTexto(e.hasta));
        setDetalle(e.detalle ?? '');
      })
      .catch((e) => setError(textoError(e, 'No se pudo cargar la fecha.')))
      .finally(() => setCargando(false));
  }, [id]);

  const guardar = async () => {
    setError(null);
    const d = isoDeTexto(desde) ?? '';
    // Si no se elige fin, es un solo día.
    const h = hasta ? (isoDeTexto(hasta) ?? '') : d;
    const problema = problemaEvento({ titulo, desde: d, hasta: h });
    if (problema) return setError(problema);
    setGuardando(true);
    try {
      await guardarFechaCalendario(id ?? null, { titulo, categoria, semestre, desde: d, hasta: h, detalle });
      volver();
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!id) return;
    if (!confirmarBorrar) return setConfirmarBorrar(true);
    setGuardando(true);
    try {
      await borrarFechaCalendario(id);
      volver();
    } catch (e) {
      setError(textoError(e, 'No se pudo borrar.'));
      setGuardando(false);
    }
  };

  const tituloPantalla = editando ? 'Editar fecha' : 'Nueva fecha';
  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo={tituloPantalla} onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <BarraSuperior titulo={tituloPantalla} onVolver={volver} />
      <Campo etiqueta="Qué es" value={titulo} onChangeText={setTitulo} maxLength={160} placeholder="Ej.: Inscripción a finales: 1.er periodo" />

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
      <Text style={[s.filaDetalle, { marginTop: -espacio.s, marginBottom: espacio.m }]}>Si es un solo día, dejá "Hasta" vacío.</Text>

      <Campo etiqueta="Nota (opcional)" value={detalle} onChangeText={setDetalle} multiline maxLength={500} placeholder="Ej.: Hasta las 18:00. Se hace por el sistema de la facultad." />

      <Mensaje texto={error} />
      <Boton texto={editando ? 'Guardar cambios' : 'Agregar fecha'} icono="checkmark" onPress={guardar} cargando={guardando} />
      {editando && (
        <>
          {confirmarBorrar && <Mensaje texto="¿Seguro? La fecha desaparece del calendario de todos. Tocá de nuevo para borrarla." />}
          <Boton texto={confirmarBorrar ? 'Sí, borrar' : 'Borrar fecha'} variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} estilo={{ marginTop: espacio.m }} />
        </>
      )}
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}
