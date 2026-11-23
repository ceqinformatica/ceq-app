import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Carnet } from '../../components/Carnet';
import { AVISO_CARNET_PAGO } from '../../lib/carnet';
import { BarraProgreso } from '../../components/graficos';
import { Boton, CabeceraMarca, Campo, Chip, EstadoVacio, Esqueleto, Fila, Hoja, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { cargarAvisos, cargarEncuestas, haceCuanto, cargarSocio, enviarSugerencia, votar, type EncuestaConResultados } from '../../datos/ceq';
import { cargarTramites } from '../../datos/tramites';
import { usarDatos } from '../../datos/usarDatos';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../../tema';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';

/** Los más consultados: se muestran primero en la pestaña del CEQ. */
const TRAMITES_DESTACADOS = ['inscripcion-finales', 'certificado-estudios', 'constancia-general', 'matriculacion'];

async function cargar(uid: string) {
  const [socio, avisos, todos, encuestas] = await Promise.all([cargarSocio(uid), cargarAvisos(3), cargarTramites(), cargarEncuestas(uid)]);
  const destacados = TRAMITES_DESTACADOS.map((c) => todos.find((t) => t.clave === c)).filter((t) => t != null);
  const tramites = (destacados.length ? destacados : todos).slice(0, 4);
  return { socio, avisos, tramites, totalTramites: todos.length, encuestas };
}

export default function Ceq() {
  useTema();
  const { sesion, perfil } = useSesion();
  const uid = sesion?.user.id ?? '';
  const { datos, cargando, error, refrescando, recargar, setDatos, sinConexion } = usarDatos(() => cargar(uid), [uid], { cache: 'ceq' });
  const [sugerir, setSugerir] = useState(false);

  return (
    <Pantalla cabecera={<CabeceraMarca titulo="Centro de Estudiantes" sub="de Química · FCQ" sinConexion={sinConexion && datos ? error : null} />} refrescando={refrescando} onRefrescar={recargar}>
      <View style={{ marginTop: -espacio.xxl }}>
        {cargando && !datos ? (
          <Tarjeta><Esqueleto alto={150} /></Tarjeta>
        ) : datos?.socio ? (
          <Pressable onPress={() => router.push('/carnet')} accessibilityRole="button" accessibilityHint="Abre el carnet con el código QR">
            <Carnet socio={datos.socio} />
          </Pressable>
        ) : (
          <Tarjeta onPress={() => router.push('/carnet')} etiqueta="Cómo obtener el carnet de socio">
            <View style={{ flexDirection: 'row', gap: espacio.m, alignItems: 'center' }}>
              <View style={est.iconoGrande}><Ionicons name="card-outline" size={26} color={colores.marino} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.filaTitulo}>Todavía no tenés carnet</Text>
                <Text style={s.filaDetalle}>{AVISO_CARNET_PAGO}</Text>
              </View>
            </View>
          </Tarjeta>
        )}
      </View>

      {error && !datos && <Mensaje texto={error} />}

      {perfil?.rol === 'admin' && (
        <Tarjeta variante="marino" onPress={() => router.push('/admin')} etiqueta="Abrir el panel del CEQ" estilo={{ marginTop: espacio.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
            <Ionicons name="construct" size={22} color={colores.blanco} />
            <View style={{ flex: 1 }}>
              <Text style={[s.filaTitulo, { color: colores.blanco }]}>Panel del CEQ</Text>
              <Text style={[s.filaDetalle, { color: colores.celeste }]}>Publicar avisos y enviar notificaciones</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colores.blanco} />
          </View>
        </Tarjeta>
      )}

      <View style={est.accesos}>
        <Acceso icono="megaphone" texto="Avisos" onPress={() => router.push('/avisos')} />
        <Acceso icono="document-text" texto="Trámites" onPress={() => router.push('/tramites')} />
        <Acceso icono="chatbubble-ellipses" texto="Sugerir" onPress={() => setSugerir(true)} />
        <Acceso icono="card" texto="Carnet" onPress={() => router.push('/carnet')} />
      </View>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        <Fila icono="school-outline" titulo="Fechas de finales" detalle="Cuándo rendís cada materia, según el horario oficial" onPress={() => router.push('/finales-fechas')} />
        <Fila
          icono="calendar-outline"
          titulo="Calendario académico"
          detalle="Inscripciones, finales, aranceles y feriados de la FCQ"
          onPress={() => router.push('/calendario')}
          ultima
        />
      </Tarjeta>

      <Seccion accion={{ texto: 'Ver todos', onPress: () => router.push('/avisos') }}>Avisos</Seccion>
      {cargando && !datos ? (
        <Tarjeta><Esqueleto alto={14} ancho="70%" /><Esqueleto alto={12} estilo={{ marginTop: 10 }} /></Tarjeta>
      ) : datos?.avisos.length ? (
        datos.avisos.map((a) => (
          <Tarjeta key={a.id} onPress={() => router.push(`/aviso/${a.id}`)} etiqueta={a.titulo}>
            <Text style={est.avisoFecha}>{haceCuanto(a.publicar_en ?? a.created_at)}</Text>
            <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino }]}>{a.titulo}</Text>
            <Text style={[s.filaDetalle, { marginTop: 4 }]} numberOfLines={2}>{a.cuerpo}</Text>
          </Tarjeta>
        ))
      ) : (
        <Tarjeta><EstadoVacio icono="megaphone-outline" titulo="Sin avisos por ahora" /></Tarjeta>
      )}

      {datos?.encuestas.map((e) => (
        <Encuesta key={e.id} encuesta={e} onVotado={(nueva) => setDatos({ ...datos, encuestas: datos.encuestas.map((x) => (x.id === nueva.id ? nueva : x)) })} />
      ))}

      {!!datos?.tramites.length && (
        <>
          <Seccion accion={{ texto: `Ver los ${datos.totalTramites}`, onPress: () => router.push('/tramites') }}>Guía de trámites</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {datos.tramites.map((t, i) => (
              <Fila key={t.id} icono="document-text-outline" titulo={t.nombre} detalle={t.descripcion ?? undefined} onPress={() => router.push(`/tramite/${t.id}`)} ultima={i === datos.tramites.length - 1} />
            ))}
          </Tarjeta>
        </>
      )}

      <Tarjeta variante="celeste" onPress={() => setSugerir(true)} etiqueta="Enviar una sugerencia" estilo={{ marginTop: espacio.m }}>
        <View style={{ flexDirection: 'row', gap: espacio.m, alignItems: 'center' }}>
          <View style={[est.iconoGrande, { backgroundColor: fondos.superficieBlanca }]}><Ionicons name="chatbubble-ellipses-outline" size={24} color={colores.marino} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.filaTitulo, { color: colores.marino }]}>¿Qué podemos mejorar?</Text>
            <Text style={s.filaDetalle}>Mandale tu sugerencia o reclamo al CEQ.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colores.marino} />
        </View>
      </Tarjeta>

      <FormSugerencia visible={sugerir} onCerrar={() => setSugerir(false)} />
    </Pantalla>
  );
}

function Acceso({ icono, texto, onPress, deshabilitado }: { icono: 'megaphone' | 'document-text' | 'chatbubble-ellipses' | 'card'; texto: string; onPress: () => void; deshabilitado?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={deshabilitado} accessibilityRole="button" accessibilityLabel={texto} style={({ pressed }) => [est.acceso, pressed && { opacity: 0.8 }, deshabilitado && { opacity: 0.45 }]}>
      <View style={est.accesoIcono}><Ionicons name={icono} size={22} color={colores.marino} /></View>
      <Text style={est.accesoTexto}>{texto}</Text>
    </Pressable>
  );
}

function Encuesta({ encuesta, onVotado }: { encuesta: EncuestaConResultados; onVotado: (e: EncuestaConResultados) => void }) {
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mostrarResultados = encuesta.yaVote;

  const enviar = async () => {
    if (!elegida) return;
    setEnviando(true);
    setError(null);
    try {
      await votar(encuesta.id, elegida);
      onVotado({ ...encuesta, yaVote: true, total: encuesta.total + 1, opciones: encuesta.opciones.map((o) => (o.id === elegida ? { ...o, votos: o.votos + 1 } : o)) });
    } catch (e) {
      setError(textoError(e, 'No se pudo votar.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Seccion>Encuesta</Seccion>
      <Tarjeta>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: espacio.s }}>
          <Ionicons name="shield-checkmark" size={14} color={colores.verde} />
          <Text style={[s.filaDetalle, { color: colores.verde, fontFamily: fuentes.medium }]}>Anónima: nadie sabe qué votaste</Text>
        </View>
        <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino, marginBottom: espacio.m }]}>{encuesta.pregunta}</Text>
        {encuesta.opciones.map((o) => {
          const porc = encuesta.total ? Math.round((o.votos / encuesta.total) * 100) : 0;
          if (mostrarResultados) {
            return (
              <View key={o.id} style={{ marginBottom: espacio.m }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={s.cuerpo}>{o.texto}</Text>
                  <Text style={[s.cuerpo, { fontFamily: fuentes.semibold, color: colores.marino }]}>{porc} %</Text>
                </View>
                <BarraProgreso valor={porc} fondo={fondos.lineaSuave} />
              </View>
            );
          }
          const activo = elegida === o.id;
          return (
            <Pressable key={o.id} onPress={() => setElegida(o.id)} accessibilityRole="radio" accessibilityState={{ checked: activo }} style={[est.opcion, activo && { borderColor: colores.marino, backgroundColor: fondos.tarjeta }]}>
              <View style={[s.radio, activo && { borderColor: colores.marino }]}>{activo && <View style={s.radioPunto} />}</View>
              <Text style={[s.cuerpo, { flex: 1 }]}>{o.texto}</Text>
            </Pressable>
          );
        })}
        {mostrarResultados ? (
          <Text style={s.filaDetalle}>{encuesta.total} votos · Ya votaste</Text>
        ) : (
          <Boton texto="Votar" onPress={enviar} cargando={enviando} deshabilitado={!elegida} />
        )}
        <Mensaje texto={error} />
      </Tarjeta>
    </>
  );
}

const CATEGORIAS = ['Académico', 'Infraestructura', 'Eventos', 'La app', 'Otro'];

function FormSugerencia({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);

  const enviar = async () => {
    setEnviando(true);
    setEstado(null);
    try {
      await enviarSugerencia(categoria, texto.trim());
      setTexto('');
      setEstado({ tipo: 'exito', texto: '¡Gracias! El CEQ recibió tu sugerencia.' });
    } catch (e) {
      setEstado({ tipo: 'error', texto: textoError(e, 'No se pudo enviar.') });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Sugerencia al CEQ" onCerrar={() => { setEstado(null); onCerrar(); }}>
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Tema</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {CATEGORIAS.map((c) => <Chip key={c} texto={c} elegido={c === categoria} onPress={() => setCategoria(c)} />)}
      </View>
      <Campo etiqueta="Contanos" value={texto} onChangeText={setTexto} multiline maxLength={2000} placeholder="Escribí tu idea, reclamo o propuesta" />
      <Mensaje texto={estado?.texto ?? null} tipo={estado?.tipo} />
      <Boton texto="Enviar" icono="send" onPress={enviar} cargando={enviando} deshabilitado={texto.trim().length < 3} />
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

const est = crearEstilos(() => ({
  iconoGrande: { width: 48, height: 48, borderRadius: 14, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  accesos: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.l, marginBottom: espacio.s },
  acceso: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: fondos.superficieBlanca, borderRadius: radio.l, paddingVertical: espacio.m, ...sombras.suave },
  accesoIcono: { width: 44, height: 44, borderRadius: 14, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  accesoTexto: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.marino },
  avisoFecha: { fontFamily: fuentes.semibold, fontSize: 11, color: colores.azul, letterSpacing: 0.4, marginBottom: 4, textTransform: 'uppercase' },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, borderWidth: 1, borderColor: colores.lineaSuave, borderRadius: radio.m, padding: espacio.m, marginBottom: espacio.s },
}));
