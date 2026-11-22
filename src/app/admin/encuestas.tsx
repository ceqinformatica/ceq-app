import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { CampoFechaHora, hoy } from '../../components/fecha';
import { BarraProgreso } from '../../components/graficos';
import { BarraSuperior, Boton, BotonFlotante, BotonIcono, Campo, Cargando, EstadoVacio, Fila, Hoja, Insignia, Mensaje, Pantalla, s, Tarjeta } from '../../components/ui';
import { borrarEncuesta, cambiarEncuesta, cargarEncuestasAdmin, crearEncuesta, programarNotificacion, type EncuestaAdmin } from '../../datos/admin';
import { usarDatos } from '../../datos/usarDatos';
import { describirCuando, leerFechaHora } from '../../lib/programacion';
import { colores, espacio, fuentes } from '../../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

export default function EncuestasAdmin() {
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarEncuestasAdmin, []);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Encuestas" onVolver={volver} />
        <Mensaje tipo="exito" texto={aviso} />
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <EstadoVacio icono="stats-chart-outline" titulo={error ? 'No pudimos cargar las encuestas' : 'Sin encuestas'} texto={error ?? 'Las encuestas son anónimas: se sabe cuántos votaron cada opción, nunca quién.'} />
        ) : (
          datos.map((e) => <Encuesta key={e.id} e={e} onCambio={recargar} />)
        )}
        <View style={{ height: 72 }} />
      </Pantalla>
      <BotonFlotante etiqueta="Nueva encuesta" onPress={() => setNueva(true)} />
      <Formulario
        visible={nueva}
        onCerrar={() => setNueva(false)}
        onListo={(t) => {
          setNueva(false);
          setAviso(t);
          recargar();
        }}
      />
    </View>
  );
}

function Encuesta({ e, onCambio }: { e: EncuestaAdmin; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vencida = e.cierra_en != null && new Date(e.cierra_en) <= new Date();
  const hacer = async (f: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    try {
      await f();
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Tarjeta>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s, flexWrap: 'wrap' }}>
            {e.abierta && !vencida ? (
              <Insignia texto={e.cierra_en ? `Abierta hasta ${describirCuando(e.cierra_en)}` : 'Abierta'} color={colores.verde} fondo={colores.verdeFondo} />
            ) : (
              <Insignia texto="Cerrada" color={colores.gris} fondo={colores.grisFondo} />
            )}
            <Insignia texto={`${e.total} ${e.total === 1 ? 'voto' : 'votos'}`} />
          </View>
          <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino, marginBottom: espacio.m }]}>{e.pregunta}</Text>
        </View>
        <BotonIcono icono={confirmar ? 'trash' : 'trash-outline'} etiqueta={confirmar ? 'Confirmar borrar encuesta' : 'Borrar encuesta'} tamano={18} onPress={() => (confirmar ? hacer(() => borrarEncuesta(e.id)) : setConfirmar(true))} />
      </View>
      {e.opciones.map((o) => {
        const porc = e.total ? Math.round((o.votos / e.total) * 100) : 0;
        return (
          <View key={o.id} style={{ marginBottom: espacio.m }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2, gap: espacio.s }}>
              <Text style={[s.cuerpo, { flex: 1 }]}>{o.texto}</Text>
              <Text style={[s.cuerpo, { fontFamily: fuentes.semibold, color: colores.marino }]}>{o.votos} · {porc} %</Text>
            </View>
            <BarraProgreso valor={porc} fondo={colores.lineaSuave} />
          </View>
        );
      })}
      {confirmar && <Mensaje texto="Se borran la encuesta y sus resultados. Tocá el tacho otra vez para confirmar." />}
      <Mensaje texto={error} />
      <Boton
        texto={e.abierta ? 'Cerrar encuesta' : 'Volver a abrir'}
        variante="secundario"
        compacto
        icono={e.abierta ? 'lock-closed-outline' : 'lock-open-outline'}
        onPress={() => hacer(() => cambiarEncuesta(e.id, !e.abierta))}
        cargando={ocupado}
      />
    </Tarjeta>
  );
}

function Formulario({ visible, onCerrar, onListo }: { visible: boolean; onCerrar: () => void; onListo: (t: string) => void }) {
  const [pregunta, setPregunta] = useState('');
  const [opciones, setOpciones] = useState(['', '']);
  const [cierreFecha, setCierreFecha] = useState('');
  const [notificar, setNotificar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setError(null);
    const p = pregunta.trim();
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!p) return setError('Falta la pregunta.');
    if (ops.length < 2) return setError('Poné al menos dos opciones.');
    if (new Set(ops.map((o) => o.toLowerCase())).size !== ops.length) return setError('Hay opciones repetidas.');
    let cierra: string | null = null;
    if (cierreFecha.trim()) {
      const r = leerFechaHora(cierreFecha, '23:59');
      if ('error' in r) return setError(r.error);
      cierra = r.fecha.toISOString();
    }
    setGuardando(true);
    try {
      await crearEncuesta(p, ops, cierra);
      if (notificar) {
        await programarNotificacion({ titulo: 'Nueva encuesta del CEQ', cuerpo: p.slice(0, 180), programada_para: new Date().toISOString(), carrera_id: null, ruta: '/ceq' });
      }
      setPregunta('');
      setOpciones(['', '']);
      setCierreFecha('');
      onListo(notificar ? 'Encuesta publicada y notificada.' : 'Encuesta publicada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Nueva encuesta" onCerrar={onCerrar}>
      <Campo etiqueta="Pregunta" value={pregunta} onChangeText={setPregunta} placeholder="Ej.: ¿Qué horario preferís para las tutorías?" maxLength={200} />
      {opciones.map((o, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espacio.s }}>
          <Campo etiqueta={`Opción ${i + 1}`} value={o} onChangeText={(t) => setOpciones(opciones.map((x, j) => (j === i ? t : x)))} maxLength={100} estilo={{ flex: 1 }} />
          {opciones.length > 2 && (
            <View style={{ marginBottom: espacio.m }}>
              <BotonIcono icono="remove" etiqueta={`Quitar opción ${i + 1}`} tamano={18} onPress={() => setOpciones(opciones.filter((_, j) => j !== i))} />
            </View>
          )}
        </View>
      ))}
      {opciones.length < 6 && <Boton texto="Agregar opción" variante="fantasma" compacto icono="add" onPress={() => setOpciones([...opciones, ''])} />}
      <CampoFechaHora etiqueta="Cierra el (opcional)" modo="date" valor={cierreFecha} onCambio={setCierreFecha} opcional minimo={hoy()} ayuda="Se cierra sola a las 23:59 de ese día. Vacío: queda abierta hasta que la cierres." estilo={{ marginTop: espacio.m }} />
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila
          icono="notifications-outline"
          titulo="Avisar con una notificación"
          derecha={<Switch value={notificar} onValueChange={setNotificar} accessibilityLabel="Avisar con una notificación" trackColor={{ true: colores.marino, false: colores.linea }} thumbColor={colores.blanco} />}
          ultima
        />
      </Tarjeta>
      <Mensaje texto={error} />
      <Boton texto="Publicar encuesta" icono="checkmark" onPress={crear} cargando={guardando} />
    </Hoja>
  );
}
