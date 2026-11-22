import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, Cargando, Chip, Fila, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { borrarTramite, cargarTramite, guardarTramite } from '../../datos/tramites';
import { aFormulario, CATEGORIAS_TRAMITE, LIMITE_NOMBRE_TRAMITE, TEXTO_MODALIDAD, validarTramite, type FormularioTramite, type Modalidad } from '../../lib/tramites';
import { colores, espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/tramites'));

const VACIO: FormularioTramite = {
  nombre: '', categoria: 'Otros', descripcion: '', pasos: '', requisitos: '', costo: '', donde: '', plazo: '', contacto: '',
  modalidad: 'presencial', formulario_url: '', fuente_url: '',
};

const MODALIDADES: (Modalidad | null)[] = ['presencial', 'etramite', 'mixto', null];

export default function EditarTramite() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = Boolean(id);
  const [cargando, setCargando] = useState(editando);
  const [f, setF] = useState<FormularioTramite>(VACIO);
  const [clave, setClave] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    cargarTramite(id)
      .then((t) => {
        if (!t) return setError('Este trámite ya no existe.');
        setF(aFormulario(t));
        setClave(t.clave);
        setVisible(t.publicado);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el trámite.'))
      .finally(() => setCargando(false));
  }, [id]);

  const cambiar = <K extends keyof FormularioTramite>(k: K) => (v: FormularioTramite[K]) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    setError(null);
    const r = validarTramite(f, clave);
    if ('error' in r) return setError(r.error);
    setGuardando(true);
    try {
      await guardarTramite(id ?? null, r.tramite, visible);
      volver();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!id) return;
    if (!confirmarBorrar) return setConfirmarBorrar(true);
    setGuardando(true);
    try {
      await borrarTramite(id);
      volver();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.');
      setGuardando(false);
    }
  };

  const titulo = editando ? 'Editar trámite' : 'Nuevo trámite';
  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo={titulo} onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <BarraSuperior titulo={titulo} onVolver={volver} />

      <Campo etiqueta="Nombre" value={f.nombre} onChangeText={cambiar('nombre')} maxLength={LIMITE_NOMBRE_TRAMITE} placeholder="Ej.: Certificado de estudios" />

      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Categoría</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {CATEGORIAS_TRAMITE.map((c) => <Chip key={c} texto={c} elegido={f.categoria === c} onPress={() => cambiar('categoria')(c)} />)}
        {!(CATEGORIAS_TRAMITE as readonly string[]).includes(f.categoria) && <Chip texto={f.categoria} elegido />}
      </View>

      <Campo etiqueta="Para qué sirve" value={f.descripcion} onChangeText={cambiar('descripcion')} multiline placeholder="Una o dos oraciones." />
      <Campo etiqueta="Pasos" value={f.pasos} onChangeText={cambiar('pasos')} multiline placeholder={'Uno por renglón:\nPagar el arancel en Perceptoría\nPresentar el formulario en Mesa de Entrada'} ayuda="Uno por renglón. Se numeran solos." />
      <Campo etiqueta="Requisitos" value={f.requisitos} onChangeText={cambiar('requisitos')} multiline placeholder={'Uno por renglón:\nFotocopia de cédula\nRecibo de pago'} ayuda="Uno por renglón. Opcional." />

      <Seccion>Datos útiles</Seccion>
      <Campo etiqueta="Plazo" value={f.plazo} onChangeText={cambiar('plazo')} multiline placeholder="Ej.: Hasta el 31/07/2026" />
      <Campo etiqueta="Dónde" value={f.donde} onChangeText={cambiar('donde')} placeholder="Ej.: Mesa de Entrada, 07:00 a 18:00" />
      <Campo etiqueta="Costo" value={f.costo} onChangeText={cambiar('costo')} placeholder="Ej.: Arancel vigente, se paga en Perceptoría" />
      <Campo etiqueta="Contacto" value={f.contacto} onChangeText={cambiar('contacto')} placeholder="Correo o teléfono" autoCapitalize="none" />

      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Cómo se hace</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {MODALIDADES.map((m) => <Chip key={m ?? 'nada'} texto={m ? TEXTO_MODALIDAD[m] : 'No indicar'} elegido={f.modalidad === m} onPress={() => cambiar('modalidad')(m)} />)}
      </View>

      <Campo etiqueta="Enlace al formulario (opcional)" value={f.formulario_url} onChangeText={cambiar('formulario_url')} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
      <Campo etiqueta="Fuente oficial (opcional)" value={f.fuente_url} onChangeText={cambiar('fuente_url')} placeholder="https://www.qui.una.py/…" autoCapitalize="none" keyboardType="url" ayuda="La página de la FCQ de donde sale la información." />

      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          icono="eye-outline"
          titulo="Visible en la app"
          detalle="Apagalo para ocultarlo sin borrarlo (por ejemplo, mientras lo revisás)."
          derecha={<Switch value={visible} onValueChange={setVisible} accessibilityLabel="Visible en la app" trackColor={{ true: colores.marino, false: colores.linea }} thumbColor={colores.blanco} />}
          ultima
        />
      </Tarjeta>

      <Mensaje texto={error} />
      <Boton texto={editando ? 'Guardar cambios' : 'Agregar trámite'} icono="checkmark" onPress={guardar} cargando={guardando} />
      {editando && (
        <>
          {confirmarBorrar && <Mensaje texto="¿Seguro? El trámite desaparece de la app para todos. Si solo querés esconderlo, apagá Visible. Tocá de nuevo para borrarlo." />}
          <Boton texto={confirmarBorrar ? 'Sí, borrar' : 'Borrar trámite'} variante="peligro" icono="trash-outline" onPress={borrar} deshabilitado={guardando} estilo={{ marginTop: espacio.m }} />
        </>
      )}
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}
