import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { pct, semaforoVisible } from '../../components/academico';
import { Columnas } from '../../components/disposicion';
import { Aparecer, NumeroAnimado, PressableAnimado, useAparecer, usePresion, vibrar } from '../../components/movimiento';
import { BarraProgreso } from '../../components/graficos';
import { CabeceraMarca, EstadoVacio, Esqueleto, Pantalla, s, Seccion, Tarjeta, type NombreIcono } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { aAsistencia, cargarFirmas, cargarMalla, REGLA_POR_DEFECTO, reglaDe, tieneLab } from '../../datos/academico';
import { cargarAgenda, cuentaRegresiva, diaSemanaHoy, diasHasta, hora, horaDe, partesFecha } from '../../datos/agenda';
import { cargarAvisos, haceCuanto } from '../../datos/ceq';
import { cargarCalendario } from '../../datos/calendario';
import { destacados, hoyPy, type EventoCalendario } from '../../lib/calendario';
import { FilaCalendario } from '../../components/calendario';
import { usarDatos } from '../../datos/usarDatos';
import { evaluarFirma } from '../../lib/firma';
import { calcularProgreso, esSeminario, materiasContadas } from '../../lib/progreso';
import { colores, coloresSemaforo, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../../tema';
import { useTema } from '../../context/TemaProvider';
import { infoTipoClase } from '../../lib/tipo-clase';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function cargar(planId: string | null | undefined, carreraId: string | null | undefined, finClases?: string | null) {
  const [malla, agenda, avisos, calendario] = await Promise.all([
    planId ? cargarMalla(planId, carreraId) : Promise.resolve(null),
    cargarAgenda(planId, finClases),
    cargarAvisos(2),
    // El calendario es un extra: si falla, el inicio igual se muestra.
    cargarCalendario().catch(() => [] as EventoCalendario[]),
  ]);
  let progreso = null;
  let firmas: { id: string; nombre: string; semaforo: keyof typeof coloresSemaforo; firma: boolean; teoria: number | null }[] = [];
  if (malla) {
    progreso = calcularProgreso(malla.materias, malla.grupos, malla.estados, malla.unidad);
    // Los seminarios no tienen firma.
    const cursando = malla.materiasDb.filter((m) => malla.estados.get(m.id)?.estado === 'cursando' && !esSeminario(m.nombre));
    const datos = await cargarFirmas(cursando.map((m) => m.id));
    firmas = cursando.map((m) => {
      const d = datos.get(m.id)!;
      const r = evaluarFirma({ regla: reglaDe(malla.reglas, m.id) ?? REGLA_POR_DEFECTO, recuperado: d.recuperado, tieneLaboratorio: tieneLab(d.evaluacionesDb), evaluaciones: d.evaluaciones, asistencia: aAsistencia(d.asistencia), asistenciaLab: aAsistencia(d.asistenciaLab) });
      return { id: m.id, nombre: m.nombre, semaforo: semaforoVisible(r), firma: r.firma, teoria: r.teoria.actual };
    });
  }
  const hoy = diaSemanaHoy();
  return { progreso, firmas, facultad: destacados(calendario, hoyPy(), 3), clasesHoy: agenda.horario.filter((h) => h.dia_semana === hoy), eventos: agenda.eventos.slice(0, 3), nombres: agenda.nombres, avisos };
}

export default function Inicio() {
  useTema();
  const { perfil } = useSesion();
  const { datos, cargando, error, refrescando, recargar, sinConexion } = usarDatos(() => cargar(perfil?.plan_id, perfil?.carrera_id, perfil?.fin_clases), [perfil?.plan_id, perfil?.carrera_id, perfil?.fin_clases], { cache: `inicio:${perfil?.plan_id}` });
  const primerNombre = perfil?.nombre?.split(' ')[0];
  const f = new Date();
  const fecha = `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
  const saludo = f.getHours() < 12 ? 'Buen día' : f.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <Pantalla
      cabecera={
        <CabeceraMarca
          titulo={primerNombre ? `¡Hola, ${primerNombre}!` : `¡${saludo}!`}
          sub={fecha.charAt(0).toUpperCase() + fecha.slice(1)}
          sinConexion={sinConexion && datos ? error : null}
        />
      }
      refrescando={refrescando}
      onRefrescar={recargar}
    >
      {/* Progreso de carrera */}
      <Tarjeta estilo={[est.avance, { marginTop: -espacio.xl }]} onPress={() => router.navigate('/carrera')} etiqueta="Ver mi carrera">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
          <View style={est.avanceIcono}><Ionicons name="school-outline" size={24} color={colores.blanco} /></View>
          <Text style={est.avanceTitulo}>Avance de carrera</Text>
          <Ionicons name="arrow-forward" size={22} color={colores.blanco} />
        </View>
        {cargando && !datos ? (
          <View style={{ gap: 8, marginTop: espacio.l }}><Esqueleto alto={36} ancho="45%" /><Esqueleto alto={12} ancho="60%" /></View>
        ) : (
          <>
            <NumeroAnimado
              valor={datos?.progreso?.porcentaje ?? 0}
              decimales={Number.isInteger(datos?.progreso?.porcentaje ?? 0) ? 0 : 1}
              sufijo="%"
              estilo={est.avanceNumero}
            >%</NumeroAnimado>
            <Text style={est.avanceDetalle}>
              {datos?.progreso?.obligatoriasTotales
                ? (({ aprobadas, total }) => `${aprobadas} de ${total} materias aprobadas`)(materiasContadas(datos.progreso))
                : error && !datos
                  ? 'No pudimos cargar tu avance'
                  : 'Tu malla está en preparación'}
            </Text>
            <View style={{ marginTop: espacio.m }}>
              <BarraProgreso valor={datos?.progreso?.porcentaje ?? 0} alto={7} color={colores.blanco} fondo="rgba(255,255,255,0.25)" />
            </View>
          </>
        )}
      </Tarjeta>

      {/* Accesos rápidos */}
      <View style={est.accesos}>
        <Acceso icono="git-network-outline" texto="Malla" retraso={120} onPress={() => router.navigate('/carrera')} />
        <Acceso icono="calculator-outline" texto="Firma" retraso={180} onPress={() => router.navigate('/firma')} />
        <Acceso icono="calendar-outline" texto="Agenda" retraso={240} onPress={() => router.navigate('/agenda')} />
      </View>

      {error && !datos ? (
        <Tarjeta estilo={{ marginTop: espacio.m }}>
          <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tu inicio" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} />
        </Tarjeta>
      ) : (
      <Columnas
        izquierda={<>

      {/* Clases de hoy */}
      <Seccion icono="calendar-outline" accion={{ texto: 'Horario', onPress: () => router.navigate('/agenda') }}>Hoy</Seccion>
      {cargando && !datos ? (
        <Esqueleto alto={84} estilo={{ borderRadius: radio.l }} />
      ) : datos?.clasesHoy.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingBottom: espacio.s, paddingRight: espacio.l }} style={{ marginHorizontal: -espacio.l, paddingLeft: espacio.l }}>
          {datos.clasesHoy.map((h, i) => (
            <Aparecer key={h.id} retraso={250 + i * 90} distancia={10} estilo={est.clase}>
              <Text style={est.claseHora}>{hora(h.hora_inicio)} – {hora(h.hora_fin)}{((t) => (t ? ` · ${t.texto}` : ''))(infoTipoClase(h.tipo_clase))}</Text>
              <Text style={est.claseNombre} numberOfLines={2}>{h.titulo || (h.materia_id && datos.nombres.get(h.materia_id)) || 'Clase'}</Text>
              {h.aula ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                  <Ionicons name="location" size={13} color={colores.marino} />
                  <Text style={est.claseAula}>{h.aula}</Text>
                </View>
              ) : null}
              <View style={est.claseIcono}><Ionicons name="time-outline" size={22} color={colores.marino} /></View>
            </Aparecer>
          ))}
        </ScrollView>
      ) : (
        <Tarjeta variante="celeste">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
            <Ionicons name="cafe-outline" size={22} color={colores.marino} />
            <Text style={[s.cuerpo, { flex: 1 }]}>Hoy no tenés clases cargadas.</Text>
          </View>
        </Tarjeta>
      )}

      {/* Próximas fechas */}
      <Seccion icono="time-outline" accion={{ texto: '+ Agregar', onPress: () => router.navigate('/agenda?nueva=fecha') }}>Próximas fechas</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.s }}>
        {cargando && !datos ? (
          <Esqueleto alto={40} />
        ) : datos?.eventos.length ? (
          datos.eventos.map((e, i) => {
            const { dia, mes } = partesFecha(e.fecha);
            const urgente = diasHasta(e.fecha) <= 3;
            return (
              <View key={e.id} style={[est.evento, i < datos.eventos.length - 1 && s.filaLinea]}>
                <View style={[est.fechaCaja, urgente && { backgroundColor: fondos.marino }]}>
                  <Text style={[est.fechaDia, urgente && { color: colores.blanco }]}>{dia}</Text>
                  <Text style={[est.fechaMes, urgente && { color: colores.celeste }]}>{mes}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.filaTitulo} numberOfLines={1}>{e.titulo}</Text>
                  <Text style={s.filaDetalle} numberOfLines={1}>
                    {[e.materia_id ? datos.nombres.get(e.materia_id) : null, horaDe(e.fecha)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={[est.cuenta, urgente && { color: colores.amarillo }]}>{cuentaRegresiva(e.fecha)}</Text>
              </View>
            );
          })
        ) : (
          <EstadoVacio
            icono="calendar-clear-outline"
            titulo="Sin fechas cargadas"
            texto="Agregá tus parciales, finales y entregas, según tu cursada."
            accion={{ texto: 'Agregar fecha', onPress: () => router.navigate('/agenda?nueva=fecha') }}
          />
        )}
      </Tarjeta>

        </>}
        derecha={<>
      {/* Firma en curso */}
      {!!datos?.firmas.length && (
        <>
          <Seccion icono="calculator-outline" accion={{ texto: 'Calculadora', onPress: () => router.navigate('/firma') }}>Firma en curso</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {datos.firmas.map((m, i) => {
              const c = coloresSemaforo[m.firma ? 'verde' : m.semaforo];
              return (
                <Pressable key={m.id} onPress={() => router.push(`/firma/${m.id}`)} accessibilityRole="button" accessibilityLabel={`${m.nombre}: ${m.firma ? 'tenés firma' : c.nombre}`} style={[est.firma, i < datos.firmas.length - 1 && s.filaLinea]}>
                  <View style={[est.semaforo, { backgroundColor: c.texto }]} />
                  <Text style={[s.filaTitulo, { flex: 1 }]} numberOfLines={1}>{m.nombre}</Text>
                  <Text style={[s.filaDetalle, { fontFamily: fuentes.semibold, color: c.texto }]}>{m.firma ? 'Tenés firma' : m.teoria != null ? pct(m.teoria) : c.nombre}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colores.textoTenue} />
                </Pressable>
              );
            })}
          </Tarjeta>
        </>
      )}

      {/* Calendario de la facultad */}
      {!!datos?.facultad?.length && (
        <>
          <Seccion icono="school-outline" accion={{ texto: 'Calendario', onPress: () => router.push('/calendario') }}>En la facultad</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {datos.facultad.map((e, i) => <FilaCalendario key={e.id} e={e} hoy={hoyPy()} ultima={i === datos.facultad.length - 1} />)}
          </Tarjeta>
        </>
      )}

      {/* Avisos */}
      <Seccion icono="megaphone-outline" accion={{ texto: 'Ver todos', onPress: () => router.push('/avisos') }}>Avisos del CEQ</Seccion>
      {cargando && !datos ? (
        <Tarjeta><Esqueleto alto={14} ancho="60%" /><Esqueleto alto={12} estilo={{ marginTop: 10 }} /></Tarjeta>
      ) : datos?.avisos.length ? (
        datos.avisos.map((a) => (
          <Tarjeta key={a.id} onPress={() => router.push(`/aviso/${a.id}`)} etiqueta={a.titulo}>
            <View style={{ flexDirection: 'row', gap: espacio.m }}>
              <View style={est.avisoIcono}><Ionicons name="megaphone" size={18} color={colores.marino} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.filaTitulo} numberOfLines={2}>{a.titulo}</Text>
                <Text style={[s.filaDetalle, { marginTop: 2 }]} numberOfLines={2}>{a.cuerpo}</Text>
                <Text style={[s.filaDetalle, { marginTop: 6, color: colores.azul, fontFamily: fuentes.medium }]}>{haceCuanto(a.publicar_en ?? a.created_at)}</Text>
              </View>
            </View>
          </Tarjeta>
        ))
      ) : (
        <Tarjeta><EstadoVacio icono="megaphone-outline" titulo="No hay avisos nuevos" /></Tarjeta>
      )}
        </>}
      />
      )}
    </Pantalla>
  );
}

function Acceso({ icono, texto, onPress, retraso }: { icono: NombreIcono; texto: string; onPress: () => void; retraso: number }) {
  const { opacity, translateY } = useAparecer(retraso);
  const { escala, onPressIn, onPressOut } = usePresion(0.92);
  return (
    <PressableAnimado
      onPress={() => { vibrar(); onPress(); }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={texto}
      style={[est.acceso, { opacity, transform: [{ translateY }, { scale: escala }] }]}
    >
      <Ionicons name={icono} size={21} color={colores.marino} />
      <Text style={est.accesoTexto}>{texto}</Text>
    </PressableAnimado>
  );
}

const est = crearEstilos(() => ({
  avance: { backgroundColor: fondos.marinoProfundo, borderWidth: 0, padding: espacio.l, borderRadius: radio.xl, ...sombras.media },
  avanceIcono: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  avanceTitulo: { flex: 1, fontFamily: fuentes.bold, fontSize: 18, color: colores.blanco },
  avanceNumero: { fontFamily: fuentes.bold, fontSize: 42, lineHeight: 50, color: colores.blanco, marginTop: espacio.m, letterSpacing: -1 },
  avanceDetalle: { fontFamily: fuentes.regular, fontSize: 14, color: colores.blanco, opacity: 0.9 },
  accesos: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.xs, marginBottom: espacio.xs },
  acceso: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: espacio.m, backgroundColor: fondos.superficieBlanca, borderRadius: radio.l, borderWidth: 1, borderColor: colores.lineaSuave, ...sombras.suave },
  accesoTexto: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.texto },
  clase: { width: 250, minHeight: 96, backgroundColor: fondos.superficieBlanca, borderRadius: radio.l, padding: espacio.m, paddingRight: 56, gap: 4, borderWidth: 1, borderColor: colores.lineaSuave, ...sombras.suave },
  claseIcono: { position: 'absolute', right: espacio.m, top: espacio.m, width: 36, height: 36, borderRadius: 10, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  claseHora: { fontFamily: fuentes.semibold, fontSize: 12.5, color: colores.marino },
  claseNombre: { fontFamily: fuentes.bold, fontSize: 17, lineHeight: 22, color: colores.texto },
  claseAula: { fontFamily: fuentes.regular, fontSize: 12.5, color: colores.textoSuave },
  evento: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s + 2 },
  fechaCaja: { width: 46, height: 48, borderRadius: 10, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  fechaDia: { fontFamily: fuentes.bold, fontSize: 17, lineHeight: 20, color: colores.marino },
  fechaMes: { fontFamily: fuentes.semibold, fontSize: 9.5, letterSpacing: 0.6, color: colores.textoSuave },
  cuenta: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.textoSuave },
  firma: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.m },
  semaforo: { width: 10, height: 10, borderRadius: 5 },
  avisoIcono: { width: 38, height: 38, borderRadius: 12, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
}));
