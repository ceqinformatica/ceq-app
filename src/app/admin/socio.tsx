import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, Cargando, Chip, Fila, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { buscarEstudiantes, cargarSocioPorId, guardarSocio, renovarCodigo } from '../../datos/socios';
import { fechaCorta, formatearCi, hoyPy, opcionesVigencia, validarSocio, type FormularioSocio } from '../../lib/carnet';
import type { EstudianteEncontrado } from '../../lib/tipos-db';
import { colores, espacio } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin/socios'));

const vacio = (): FormularioSocio => ({
  nombre: '', ci: '', numero_socio: '', vigente_hasta: opcionesVigencia()[0].valor, usuario_id: null, pagado_en: hoyPy(), observacion: '', activo: true,
});

/** Alta o edición de un socio que ya pagó la cuota. */
export default function EditarSocio() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editando = Boolean(id);
  const [cargando, setCargando] = useState(editando);
  const [f, setF] = useState<FormularioSocio>(vacio);
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<EstudianteEncontrado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    cargarSocioPorId(id)
      .then((x) => {
        if (!x) return setError('Este socio ya no existe.');
        setF({
          nombre: x.nombre, ci: x.ci, numero_socio: x.numero_socio ?? '', vigente_hasta: x.vigente_hasta, usuario_id: x.usuario_id,
          pagado_en: x.pagado_en, observacion: x.observacion ?? '', activo: x.activo,
        });
        setCuenta(x.usuario_id ? 'Cuenta vinculada' : null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el socio.'))
      .finally(() => setCargando(false));
  }, [id]);

  // Búsqueda de la cuenta del estudiante, con una pausa corta al escribir.
  useEffect(() => {
    const t = busqueda.trim();
    if (t.length < 2) {
      setBuscando(false);
      setResultados(null);
      return;
    }
    let vivo = true;
    setBuscando(true);
    const h = setTimeout(() => {
      buscarEstudiantes(t)
        .then((r) => vivo && setResultados(r))
        .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo buscar.'))
        .finally(() => vivo && setBuscando(false));
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(h);
    };
  }, [busqueda]);

  const cambiar = <K extends keyof FormularioSocio>(k: K) => (v: FormularioSocio[K]) => setF((x) => ({ ...x, [k]: v }));

  const elegir = (e: EstudianteEncontrado) => {
    setF((x) => ({ ...x, usuario_id: e.id, nombre: x.nombre || e.nombre || '', ci: x.ci || e.ci || '' }));
    setCuenta([e.nombre, e.correo].filter(Boolean).join(' · '));
    setBusqueda('');
    setResultados(null);
  };

  const guardar = async () => {
    setError(null);
    const problema = validarSocio(f);
    if (problema) return setError(problema);
    setGuardando(true);
    try {
      await guardarSocio(id ?? null, f);
      volver();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const nuevoQr = async () => {
    if (!id) return;
    setError(null);
    try {
      await renovarCodigo(id);
      setAviso('Listo: el QR anterior de este socio ya no sirve. Su app muestra el nuevo al abrir el carnet.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el código.');
    }
  };

  const titulo = editando ? 'Editar socio' : 'Dar de alta un socio';
  if (cargando) {
    return (
      <Pantalla>
        <BarraSuperior titulo={titulo} onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }

  const vigencias = opcionesVigencia();
  const vigenciaPropia = f.vigente_hasta && !vigencias.some((v) => v.valor === f.vigente_hasta);

  return (
    <Pantalla>
      <BarraSuperior titulo={titulo} onVolver={volver} />
      {!editando && (
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
          Solo para quien ya pagó la cuota de socio. Al guardar, se le habilita el carnet virtual con QR en la app.
        </Text>
      )}

      <Seccion>Cuenta en la app</Seccion>
      {f.usuario_id ? (
        <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
          <Fila
            icono="person-circle-outline"
            titulo={cuenta ?? 'Cuenta vinculada'}
            detalle="Ve su carnet al abrir la app"
            derecha={<Boton texto="Cambiar" variante="fantasma" compacto onPress={() => { setF((x) => ({ ...x, usuario_id: null })); setCuenta(null); }} />}
            ultima
          />
        </Tarjeta>
      ) : (
        <>
          <Campo etiqueta="Buscar al estudiante" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre, C.I. o correo" autoCapitalize="none" autoCorrect={false} ayuda="Tiene que haber entrado a la app al menos una vez." />
          {buscando && <Text style={s.filaDetalle}>Buscando…</Text>}
          {resultados && !buscando && (
            <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
              {resultados.length ? (
                resultados.map((e, i) => (
                  <Fila
                    key={e.id}
                    icono="person-outline"
                    titulo={e.nombre ?? 'Sin nombre'}
                    detalle={[e.correo, e.ci ? `C.I. ${formatearCi(e.ci)}` : null, e.carrera].filter(Boolean).join(' · ')}
                    onPress={() => elegir(e)}
                    ultima={i === resultados.length - 1}
                  />
                ))
              ) : (
                <Text style={[s.filaDetalle, { padding: espacio.m }]}>No encontramos a nadie. Puede darse de alta igual, con carnet físico solamente.</Text>
              )}
            </Tarjeta>
          )}
          {!resultados && <Mensaje tipo="info" texto="Sin cuenta vinculada tiene solo el carnet físico. Podés vincularla más adelante." />}
        </>
      )}

      <Seccion>Datos del carnet</Seccion>
      <Campo etiqueta="Nombre completo" value={f.nombre} onChangeText={cambiar('nombre')} placeholder="Como figura en la cédula" maxLength={80} />
      <Campo etiqueta="Cédula" value={f.ci} onChangeText={cambiar('ci')} placeholder="Ej.: 4.555.666" keyboardType="number-pad" maxLength={14} />
      <Campo
        etiqueta="Número de socio (opcional)"
        value={f.numero_socio}
        onChangeText={cambiar('numero_socio')}
        placeholder={editando ? '' : 'Se asigna solo (CEQ-0001…)'}
        autoCapitalize="characters"
        maxLength={20}
      />

      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Vigencia</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {vigencias.map((v) => <Chip key={v.texto} texto={v.texto} elegido={f.vigente_hasta === v.valor} onPress={() => cambiar('vigente_hasta')(v.valor)} />)}
        {vigenciaPropia && <Chip texto={`Hasta ${fechaCorta(f.vigente_hasta!)}`} elegido />}
      </View>

      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Pago de la cuota</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        <Chip texto="Pagó hoy" icono="cash-outline" elegido={f.pagado_en === hoyPy()} onPress={() => cambiar('pagado_en')(hoyPy())} />
        {f.pagado_en && f.pagado_en !== hoyPy() && <Chip texto={`Pagó el ${fechaCorta(f.pagado_en)}`} elegido />}
        <Chip texto="No anotar" elegido={!f.pagado_en} onPress={() => cambiar('pagado_en')(null)} />
      </View>

      <Campo etiqueta="Observación (opcional)" value={f.observacion} onChangeText={cambiar('observacion')} placeholder="Ej.: recibo 0123, retiró el carnet físico" multiline maxLength={300} />

      {editando && (
        <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
          <Fila
            icono="checkmark-circle-outline"
            titulo="Carnet habilitado"
            detalle="Apagalo para dar de baja el carnet sin borrar al socio."
            derecha={<Switch value={f.activo} onValueChange={cambiar('activo')} accessibilityLabel="Carnet habilitado" trackColor={{ true: colores.marino, false: colores.linea }} thumbColor={colores.blanco} />}
          />
          <Fila icono="refresh-outline" titulo="Cambiar su código QR" detalle="Si perdió el celular o circula una foto de su QR" onPress={nuevoQr} ultima />
        </Tarjeta>
      )}

      <Mensaje texto={aviso} tipo="exito" />
      <Mensaje texto={error} />
      <Boton texto={editando ? 'Guardar cambios' : 'Dar de alta'} icono="checkmark" onPress={guardar} cargando={guardando} />
      <View style={{ height: espacio.xl }} />
    </Pantalla>
  );
}
