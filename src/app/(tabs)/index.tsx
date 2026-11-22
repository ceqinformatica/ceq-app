import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { pct, semaforoVisible } from '../../components/academico';
import { AnilloProgreso } from '../../components/graficos';
import { CabeceraMarca, EstadoVacio, Esqueleto, Pantalla, s, Seccion, Tarjeta, type NombreIcono } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { aAsistencia, cargarFirmas, cargarMalla, REGLA_POR_DEFECTO, reglaDe, tieneLab } from '../../datos/academico';
import { cargarAgenda, cuentaRegresiva, diaSemanaHoy, diasHasta, hora, horaDe, partesFecha } from '../../datos/agenda';
import { cargarAvisos, haceCuanto } from '../../datos/ceq';
import { usarDatos } from '../../datos/usarDatos';
import { evaluarFirma } from '../../lib/firma';
import { calcularProgreso, esSeminario } from '../../lib/progreso';
import { colores, coloresSemaforo, espacio, fuentes, radio, sombras } from '../../tema';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function cargar(planId: string | null | undefined, carreraId: string | null | undefined) {
  const [malla, agenda, avisos] = await Promise.all([
    planId ? cargarMalla(planId, carreraId) : Promise.resolve(null),
    cargarAgenda(planId),
    cargarAvisos(2),
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
  return { progreso, firmas, clasesHoy: agenda.horario.filter((h) => h.dia_semana === hoy), eventos: agenda.eventos.slice(0, 3), nombres: agenda.nombres, avisos };
}

export default function Inicio() {
  const { perfil } = useSesion();
  const { datos, cargando, refrescando, recargar } = usarDatos(() => cargar(perfil?.plan_id, perfil?.carrera_id), [perfil?.plan_id]);
  const primerNombre = perfil?.nombre?.split(' ')[0];
  const f = new Date();
  const fecha = `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
  const saludo = f.getHours() < 12 ? 'Buen día' : f.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <Pantalla
      cabecera={
        <CabeceraMarca
          derecha={
            <Pressable onPress={() => router.push('/perfil')} accessibilityRole="button" accessibilityLabel="Abrir mi perfil" hitSlop={8} style={est.avatar}>
              <Text style={est.avatarTexto}>{(primerNombre?.[0] ?? '?').toUpperCase()}</Text>
            </Pressable>
          }
        >
          <Text style={est.fecha}>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</Text>
          <Text style={est.saludo}>{primerNombre ? `${saludo}, ${primerNombre}` : saludo}</Text>
        </CabeceraMarca>
      }
      refrescando={refrescando}
      onRefrescar={recargar}
    >
      {/* Progreso de carrera */}
      <Tarjeta estilo={{ marginTop: -espacio.xxl }} onPress={() => router.navigate('/carrera')} etiqueta="Ver mi carrera">
        {cargando && !datos ? (
          <View style={{ flexDirection: 'row', gap: espacio.l, alignItems: 'center' }}>
            <Esqueleto alto={84} ancho={84} estilo={{ borderRadius: 42 }} />
            <View style={{ flex: 1, gap: 8 }}><Esqueleto alto={16} ancho="70%" /><Esqueleto alto={12} /></View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: espacio.l, alignItems: 'center' }}>
            <AnilloProgreso porcentaje={datos?.progreso?.porcentaje ?? 0} tamano={84} grosor={9} />
            <View style={{ flex: 1 }}>
              <Text style={est.etiquetaCaja}>PROGRESO DE CARRERA</Text>
              <Text style={[s.filaTitulo, { fontSize: 16, color: colores.marino, marginTop: 2 }]}>
                {datos?.progreso?.obligatoriasTotales
                  ? `${datos.progreso.obligatoriasAprobadas} de ${datos.progreso.obligatoriasTotales} materias aprobadas`
                  : 'Tu malla está en preparación'}
              </Text>
              <Text style={[s.filaDetalle, { marginTop: 2 }]}>Tocá para ver tu malla</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
          </View>
        )}
      </Tarjeta>

      {/* Accesos rápidos */}
      <View style={est.accesos}>
        <Acceso icono="git-network" texto="Malla" onPress={() => router.navigate('/carrera')} />
        <Acceso icono="calculator" texto="Firma" onPress={() => router.navigate('/firma')} />
        <Acceso icono="calendar" texto="Agenda" onPress={() => router.navigate('/agenda')} />
        <Acceso icono="card" texto="Carnet" onPress={() => router.push('/carnet')} />
      </View>

      {/* Clases de hoy */}
      <Seccion accion={{ texto: 'Horario', onPress: () => router.navigate('/agenda') }}>Hoy</Seccion>
      {cargando && !datos ? (
        <Esqueleto alto={84} estilo={{ borderRadius: radio.l }} />
      ) : datos?.clasesHoy.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingBottom: espacio.s, paddingRight: espacio.l }} style={{ marginHorizontal: -espacio.l, paddingLeft: espacio.l }}>
          {datos.clasesHoy.map((h) => (
            <View key={h.id} style={est.clase}>
              <Text style={est.claseHora}>{hora(h.hora_inicio)} – {hora(h.hora_fin)}</Text>
              <Text style={est.claseNombre} numberOfLines={2}>{h.titulo || (h.materia_id && datos.nombres.get(h.materia_id)) || 'Clase'}</Text>
              {h.aula ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                  <Ionicons name="location" size={12} color={colores.celeste} />
                  <Text style={est.claseAula}>{h.aula}</Text>
                </View>
              ) : null}
            </View>
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
      <Seccion accion={{ texto: '+ Agregar', onPress: () => router.navigate('/agenda?nueva=fecha') }}>Mis próximas fechas</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.s }}>
        {cargando && !datos ? (
          <Esqueleto alto={40} />
        ) : datos?.eventos.length ? (
          datos.eventos.map((e, i) => {
            const { dia, mes } = partesFecha(e.fecha);
            const urgente = diasHasta(e.fecha) <= 3;
            return (
              <View key={e.id} style={[est.evento, i < datos.eventos.length - 1 && s.filaLinea]}>
                <View style={[est.fechaCaja, urgente && { backgroundColor: colores.marino }]}>
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

      {/* Firma en curso */}
      {!!datos?.firmas.length && (
        <>
          <Seccion accion={{ texto: 'Calculadora', onPress: () => router.navigate('/firma') }}>Firma en curso</Seccion>
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

      {/* Avisos */}
      <Seccion accion={{ texto: 'Ver todos', onPress: () => router.push('/avisos') }}>Avisos del CEQ</Seccion>
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
                <Text style={[s.filaDetalle, { marginTop: 6, color: colores.azul, fontFamily: fuentes.medium }]}>{haceCuanto(a.created_at)}</Text>
              </View>
            </View>
          </Tarjeta>
        ))
      ) : (
        <Tarjeta><EstadoVacio icono="megaphone-outline" titulo="No hay avisos nuevos" /></Tarjeta>
      )}
    </Pantalla>
  );
}

function Acceso({ icono, texto, onPress }: { icono: NombreIcono; texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={texto} style={({ pressed }) => [est.acceso, pressed && { opacity: 0.8 }]}>
      <View style={est.accesoIcono}><Ionicons name={icono} size={22} color={colores.marino} /></View>
      <Text style={est.accesoTexto}>{texto}</Text>
    </Pressable>
  );
}

const est = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colores.celesteVivo },
  avatarTexto: { fontFamily: fuentes.bold, fontSize: 17, color: colores.marino },
  fecha: { fontFamily: fuentes.medium, fontSize: 13.5, color: colores.celeste },
  saludo: { fontFamily: fuentes.bold, fontSize: 27, lineHeight: 33, color: colores.blanco, marginTop: 2, letterSpacing: -0.3 },
  etiquetaCaja: { fontFamily: fuentes.semibold, fontSize: 10.5, letterSpacing: 1, color: colores.azul },
  accesos: { flexDirection: 'row', gap: espacio.s, marginTop: espacio.xs, marginBottom: espacio.xs },
  acceso: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: espacio.m, backgroundColor: colores.superficieBlanca, borderRadius: radio.l, ...sombras.suave },
  accesoIcono: { width: 44, height: 44, borderRadius: 14, backgroundColor: colores.tarjeta, alignItems: 'center', justifyContent: 'center' },
  accesoTexto: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.marino },
  clase: { width: 170, minHeight: 104, backgroundColor: colores.marino, borderRadius: radio.l, padding: espacio.m, gap: 4, ...sombras.suave },
  claseHora: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.celeste },
  claseNombre: { fontFamily: fuentes.semibold, fontSize: 15, lineHeight: 19, color: colores.blanco },
  claseAula: { fontFamily: fuentes.regular, fontSize: 12, color: colores.celeste },
  evento: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s + 2 },
  fechaCaja: { width: 44, height: 46, borderRadius: 10, backgroundColor: colores.tarjeta, alignItems: 'center', justifyContent: 'center' },
  fechaDia: { fontFamily: fuentes.bold, fontSize: 17, lineHeight: 20, color: colores.marino },
  fechaMes: { fontFamily: fuentes.semibold, fontSize: 9.5, letterSpacing: 0.6, color: colores.textoSuave },
  cuenta: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.textoSuave },
  firma: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.m },
  semaforo: { width: 10, height: 10, borderRadius: 5 },
  avisoIcono: { width: 38, height: 38, borderRadius: 12, backgroundColor: colores.tarjeta, alignItems: 'center', justifyContent: 'center' },
});
