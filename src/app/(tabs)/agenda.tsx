import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { compartirVistaComoImagen, puedeCompartirImagen } from '../../components/compartir-imagen';
import { CampoFechaHora, hoy } from '../../components/fecha';
import { CabeceraMarca, Boton, BotonIcono, Campo, Cargando, Chip, EstadoVacio, Fila, Hoja, Insignia, logoCeq, Mensaje, Pantalla, s, Segmentado, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import {
  actualizarClase, borrarClase, borrarEvento, cargarAgenda, crearClases, crearEvento, cuentaRegresiva, DIAS, DIAS_CORTOS, diaSemanaHoy, diasHasta, hora, horaDe,
  partesFecha, type Agenda as DatosAgenda, type MateriaAgenda,
} from '../../datos/agenda';
import { guardarEstadosEnBloque } from '../../datos/academico';
import { horarioOficialDe, PERIODO_HORARIOS_FCQ } from '../../datos/horario-oficial';
import { usarDatos } from '../../datos/usarDatos';
import { abreviar, acomodarDia, choquesCon, horaParaBase, minutos, OPCIONES_AVISO, rangoSemana, textoAviso, textoMinutos } from '../../lib/horario';
import type { EstadoMateriaDb, EventoDb, HorarioDb, TipoEvento } from '../../lib/tipos-db';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../../tema';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';
import { textoSemestre } from '../../lib/carnet';
import { clasesPorDia, infoTipoClase, nombreConTipo, TIPOS_CLASE, type TipoClase } from '../../lib/tipo-clase';

/** Tonos para distinguir materias en el horario: celestes y grises del CEQ (sin verdes ni naranjas). */
const TONOS = ['#0F5F94', '#2A8FCC', '#3F5168', '#1677B0', '#4F7FA0', '#55687A', '#2C6E8F'];
const tonoDe = (clave: string) => TONOS[[...clave].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];

const TIPOS: { valor: TipoEvento; texto: string; icono: 'school' | 'document-text' | 'notifications' }[] = [
  { valor: 'examen', texto: 'Examen', icono: 'school' },
  { valor: 'entrega', texto: 'Entrega', icono: 'document-text' },
  { valor: 'recordatorio', texto: 'Recordatorio', icono: 'notifications' },
];

export default function Agenda() {
  useTema();
  const { perfil, sesion } = useSesion();
  const { datos, setDatos, cargando, error, refrescando, recargar, sinConexion } = usarDatos(() => cargarAgenda(perfil?.plan_id), [perfil?.plan_id], { cache: `agenda:${perfil?.plan_id}` });
  const [vista, setVista] = useState<'horario' | 'fechas'>('horario');
  const [dia, setDia] = useState(diaSemanaHoy() === 7 ? 1 : diaSemanaHoy());
  const [modoHorario, setModoHorario] = useState<'semana' | 'dia'>('semana');
  const [nuevaClase, setNuevaClase] = useState(false);
  const [editando, setEditando] = useState<HorarioDb | null>(null);
  const [nuevoEvento, setNuevoEvento] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const { nueva } = useLocalSearchParams<{ nueva?: string }>();

  // Desde Inicio: "Agregar fecha" abre directo el formulario.
  useEffect(() => {
    if (nueva === 'fecha') {
      setVista('fechas');
      setNuevoEvento(true);
      router.setParams({ nueva: undefined });
    }
  }, [nueva]);
  const [claseElegida, setClaseElegida] = useState<HorarioDb | null>(null);
  const [eventoElegido, setEventoElegido] = useState<EventoDb | null>(null);

  const clasesDelDia = useMemo(() => datos?.horario.filter((h) => h.dia_semana === dia) ?? [], [datos, dia]);
  const marcarCursando = (ids: string[]) => {
    setDatos((d) => (d ? { ...d, estados: new Map([...d.estados, ...ids.map((id) => [id, 'cursando'] as const)]) } : d));
    recargar(); // por si alguna ya tenía otro estado y no se pisó
  };
  const nombreClase = (h: HorarioDb) => h.titulo || (h.materia_id && datos?.nombres.get(h.materia_id)) || 'Clase';

  return (
    <View style={{ flex: 1, backgroundColor: fondos.fondo }}>
      <Pantalla
        cabecera={<CabeceraMarca titulo="Agenda" sub={vista === 'horario' ? 'Tu semana de clases' : 'Tus exámenes, entregas y recordatorios'} compacta derecha={<BotonIcono icono="calendar-outline" etiqueta="Calendario de la facultad" plano onPress={() => router.push('/calendario')} />} sinConexion={sinConexion && datos ? error : null} />}
        refrescando={refrescando}
        onRefrescar={recargar}
      >
        <View style={{ marginTop: espacio.m }}>
          <Segmentado opciones={[{ valor: 'horario', texto: 'Horario' }, { valor: 'fechas', texto: 'Fechas' }]} valor={vista} onCambio={setVista} />
        </View>

        {cargando && !datos ? (
          <Cargando />
        ) : error && !datos ? (
          <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tu agenda" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} />
        ) : vista === 'horario' ? (
          <>
            <View style={{ flexDirection: 'row', gap: espacio.s, paddingBottom: espacio.m }}>
              <Chip texto="Semana" icono="grid-outline" elegido={modoHorario === 'semana'} onPress={() => setModoHorario('semana')} />
              <Chip texto="Por día" icono="list-outline" elegido={modoHorario === 'dia'} onPress={() => setModoHorario('dia')} />
              {datos && datos.horario.length > 0 ? (
                <View style={{ marginLeft: 'auto' }}>
                  <Chip texto="Compartir" icono="share-social-outline" onPress={() => setCompartiendo(true)} />
                </View>
              ) : null}
            </View>
            {modoHorario === 'semana' ? (
              datos && datos.horario.length > 0 ? (
                <GrillaSemana clases={datos.horario} nombre={nombreClase} onElegir={setClaseElegida} onDia={(n) => { setDia(n); setModoHorario('dia'); }} />
              ) : (
                <Tarjeta>
                  <EstadoVacio icono="calendar-outline" titulo="Tu semana está vacía" texto="Cargá tus clases con día, hora y aula para ver toda la semana de un vistazo." accion={{ texto: 'Agregar clase', onPress: () => setNuevaClase(true) }} />
                </Tarjeta>
              )
            ) : (
            <>
            <View style={{ flexDirection: 'row', gap: 6, paddingBottom: espacio.m }}>
              {DIAS_CORTOS.slice(0, datos?.horario.some((h) => h.dia_semana === 7) ? 7 : 6).map((d, i) => {
                const n = i + 1;
                const activo = n === dia;
                const hoy = n === diaSemanaHoy();
                const cantidad = datos?.horario.filter((h) => h.dia_semana === n).length ?? 0;
                return (
                  <Pressable key={d} onPress={() => setDia(n)} accessibilityRole="tab" accessibilityState={{ selected: activo }} accessibilityLabel={`${DIAS[i]}, ${cantidad} clases`} style={[est.dia, activo && est.diaActivo]}>
                    <Text style={[est.diaTexto, activo && { color: colores.blanco }]}>{d}</Text>
                    <View style={{ flexDirection: 'row', gap: 3, height: 6, marginTop: 4 }}>
                      {Array.from({ length: Math.min(cantidad, 4) }).map((_, k) => (
                        <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: activo ? fondos.celeste : fondos.marino, opacity: activo ? 1 : 0.5 }} />
                      ))}
                    </View>
                    {hoy && <Text style={[est.hoy, activo && { color: colores.celeste }]}>HOY</Text>}
                  </Pressable>
                );
              })}
            </View>

            <Text style={[s.seccion, { marginTop: 0 }]}>{DIAS[dia - 1]}</Text>
            {clasesDelDia.length === 0 ? (
              <Tarjeta>
                <EstadoVacio icono="cafe-outline" titulo="Día libre" texto="No tenés clases cargadas este día." />
              </Tarjeta>
            ) : (
              clasesDelDia.map((h) => {
                const tono = tonoDe(h.materia_id ?? h.titulo ?? '');
                const tipo = infoTipoClase(h.tipo_clase);
                return (
                  <Pressable key={h.id} onPress={() => setClaseElegida(h)} accessibilityRole="button" accessibilityLabel={`${nombreConTipo(nombreClase(h), h.tipo_clase)}, de ${hora(h.hora_inicio)} a ${hora(h.hora_fin)}${h.aula ? `, ${h.aula}` : ''}`} style={({ pressed }) => [est.clase, pressed && { opacity: 0.85 }]}>
                    <View style={est.claseHora}>
                      <Text style={est.horaInicio}>{hora(h.hora_inicio)}</Text>
                      <Text style={est.horaFin}>{hora(h.hora_fin)}</Text>
                    </View>
                    <View style={[est.claseCuerpo, { borderLeftColor: tono }]}>
                      <Text style={est.claseNombre} numberOfLines={2}>{nombreClase(h)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: espacio.m, rowGap: 4, marginTop: 4 }}>
                        {tipo ? <Insignia texto={tipo.texto} icono={tipo.icono} /> : null}
                        {h.aula ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                            <Ionicons name="location-outline" size={13} color={colores.textoSuave} />
                            <Text style={s.filaDetalle} numberOfLines={1}>{h.aula}</Text>
                          </View>
                        ) : null}
                        {h.aviso_minutos != null ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="notifications-outline" size={13} color={colores.textoSuave} />
                            <Text style={s.filaDetalle}>{textoAviso(h.aviso_minutos)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
            </>
            )}
            <HorarioOficial carreraId={perfil?.carrera_id} />
          </>
        ) : (
          <>
            <ListaEventos datos={datos!} onElegir={setEventoElegido} />
            <Tarjeta estilo={{ marginTop: espacio.m, paddingVertical: espacio.xs }}>
              <Fila
                icono="school-outline"
                titulo="Fechas de finales"
                detalle="El horario de finales de tu carrera que publica el CEQ. Agregalos a tu agenda con un toque."
                onPress={() => router.push('/finales-fechas')}
              />
              <Fila
                icono="calendar-outline"
                titulo="Calendario académico de la FCQ"
                detalle="Inscripciones, finales, vencimientos de aranceles y feriados."
                onPress={() => router.push('/calendario')}
                ultima
              />
            </Tarjeta>
          </>
        )}
        <View style={{ height: 64 }} />
      </Pantalla>

      <Pressable
        onPress={() => (vista === 'horario' ? setNuevaClase(true) : setNuevoEvento(true))}
        accessibilityRole="button"
        accessibilityLabel={vista === 'horario' ? 'Agregar clase' : 'Agregar fecha'}
        style={({ pressed }) => [s.flotante, pressed && { backgroundColor: fondos.marinoProfundo }]}
      >
        <Ionicons name="add" size={22} color={colores.blanco} />
        <Text style={s.flotanteTexto}>{vista === 'horario' ? 'Clase' : 'Fecha'}</Text>
      </Pressable>

      <FormClase
        visible={nuevaClase || editando != null}
        clase={editando}
        diaInicial={dia}
        datos={datos}
        recordatoriosApagados={perfil?.notif_recordatorios === false}
        onCursando={marcarCursando}
        onCerrar={() => { setNuevaClase(false); setEditando(null); }}
        onListo={() => { setNuevaClase(false); setEditando(null); recargar(); }}
      />
      <CompartirHorario visible={compartiendo} clases={datos?.horario ?? []} nombre={nombreClase} onCerrar={() => setCompartiendo(false)} />
      <FormEvento visible={nuevoEvento} uid={sesion?.user.id ?? ''} datos={datos} onCursando={marcarCursando} onCerrar={() => setNuevoEvento(false)} onListo={() => { setNuevoEvento(false); recargar(); }} />

      <Hoja visible={claseElegida != null} titulo={claseElegida ? nombreClase(claseElegida) : ''} onCerrar={() => setClaseElegida(null)}>
        {claseElegida && (
          <Detalle
            filas={[
              ...(infoTipoClase(claseElegida.tipo_clase) ? [[infoTipoClase(claseElegida.tipo_clase)!.icono, infoTipoClase(claseElegida.tipo_clase)!.texto] as [string, string]] : []),
              ['calendar-outline', DIAS[claseElegida.dia_semana - 1]],
              ['time-outline', `${hora(claseElegida.hora_inicio)} a ${hora(claseElegida.hora_fin)}`],
              ...(claseElegida.aula ? [['location-outline', claseElegida.aula] as [string, string]] : []),
              ['notifications-outline', claseElegida.aviso_minutos != null ? `Te avisamos ${textoAviso(claseElegida.aviso_minutos)}` : 'Sin aviso antes de la clase'],
            ]}
            accion={{ texto: 'Editar clase', icono: 'create-outline', onPress: () => {
              const c = claseElegida;
              setClaseElegida(null);
              // Abrir la otra hoja cuando esta ya se cerró (en iOS dos Modal juntos fallan).
              setTimeout(() => setEditando(c), 350);
            } }}
            onBorrar={async () => { await borrarClase(claseElegida.id); setClaseElegida(null); recargar(); }}
            textoBorrar="Quitar del horario"
          />
        )}
      </Hoja>
      <Hoja visible={eventoElegido != null} titulo={eventoElegido?.titulo ?? ''} onCerrar={() => setEventoElegido(null)}>
        {eventoElegido && (
          <Detalle
            filas={[
              ['calendar-outline', `${partesFecha(eventoElegido.fecha).dia} ${partesFecha(eventoElegido.fecha).mes.toLowerCase()} · ${horaDe(eventoElegido.fecha)}`],
              ...(eventoElegido.materia_id && datos?.nombres.get(eventoElegido.materia_id) ? [['book-outline', datos.nombres.get(eventoElegido.materia_id)!] as [string, string]] : []),
              ['hourglass-outline', cuentaRegresiva(eventoElegido.fecha)],
            ]}
            onBorrar={async () => { await borrarEvento(eventoElegido.id); setEventoElegido(null); recargar(); }}
            textoBorrar="Eliminar fecha"
          />
        )}
      </Hoja>
    </View>
  );
}

function ListaEventos({ datos, onElegir }: { datos: DatosAgenda; onElegir: (e: EventoDb) => void }) {
  if (datos.eventos.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio icono="calendar-clear-outline" titulo="Sin fechas próximas" texto="Agregá tus parciales y entregas para tenerlos a mano y recibir recordatorios." />
      </Tarjeta>
    );
  }
  return (
    <>
      {datos.eventos.map((e) => {
        const { dia, mes } = partesFecha(e.fecha);
        const tipo = TIPOS.find((t) => t.valor === e.tipo)!;
        const dias = diasHasta(e.fecha);
        const urgente = dias <= 3;
        return (
          <Pressable key={e.id} onPress={() => onElegir(e)} accessibilityRole="button" accessibilityLabel={`${e.titulo}, ${cuentaRegresiva(e.fecha)}`} style={({ pressed }) => [est.evento, pressed && { opacity: 0.85 }]}>
            <View style={[est.fecha, urgente && { backgroundColor: fondos.marino }]}>
              <Text style={[est.fechaDia, urgente && { color: colores.blanco }]}>{dia}</Text>
              <Text style={[est.fechaMes, urgente && { color: colores.celeste }]}>{mes}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.filaTitulo} numberOfLines={1}>{e.titulo}</Text>
              <Text style={s.filaDetalle} numberOfLines={1}>
                {[e.materia_id ? datos.nombres.get(e.materia_id) : null, horaDe(e.fecha)].filter(Boolean).join(' · ')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                <Insignia texto={tipo.texto} icono={tipo.icono} />
                <Insignia texto={cuentaRegresiva(e.fecha)} color={urgente ? colores.amarillo : colores.textoSuave} fondo={urgente ? fondos.amarilloFondo : fondos.grisFondo} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

function Detalle({ filas, onBorrar, textoBorrar, nota, accion }: {
  filas: [string, string][]; onBorrar?: () => Promise<void>; textoBorrar: string; nota?: string;
  accion?: { texto: string; icono: 'create-outline'; onPress: () => void };
}) {
  const [borrando, setBorrando] = useState(false);
  return (
    <View>
      {filas.map(([icono, t]) => (
        <View key={icono} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m, marginBottom: espacio.m }}>
          <Ionicons name={icono as never} size={20} color={colores.marino} />
          <Text style={s.cuerpo}>{t}</Text>
        </View>
      ))}
      {nota && <Mensaje tipo="info" texto={nota} />}
      {accion && <Boton texto={accion.texto} icono={accion.icono} variante="secundario" onPress={accion.onPress} estilo={{ marginBottom: espacio.s }} />}
      {onBorrar && <Boton texto={textoBorrar} variante="peligro" icono="trash-outline" cargando={borrando} onPress={async () => { setBorrando(true); await onBorrar().catch(() => {}); setBorrando(false); }} />}
      <View style={{ height: espacio.l }} />
    </View>
  );
}

const reHora = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const normalizarHora = (t: string) => {
  const m = reHora.exec(t.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:00` : null;
};

/** Materias que se ofrecen al cargar una clase o una fecha: solo las tuyas. */
const misMaterias = (datos: DatosAgenda | null | undefined, incluir: EstadoMateriaDb[]) =>
  datos?.materias.filter((m) => incluir.includes(datos.estados.get(m.id) ?? 'pendiente')) ?? [];

function SelectorMateria({ materias, valor, onCambio, onOtra }: {
  materias: MateriaAgenda[]; valor: string | null; onCambio: (id: string | null) => void; onOtra: () => void;
}) {
  return (
    <>
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Materia</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {materias.map((m) => <Chip key={m.id} texto={m.nombre} elegido={valor === m.id} onPress={() => onCambio(m.id)} />)}
        <Chip texto="Otra cosa" elegido={valor == null} onPress={() => onCambio(null)} />
        <Chip texto="Sumar materia" icono="add" onPress={onOtra} />
      </View>
    </>
  );
}

/**
 * Paso previo: marcar qué materias estás cursando. Se guardan como "Cursando"
 * en tu carrera, y desde ahí la agenda solo te ofrece esas.
 */
function ElegirCursando({ datos, primeraVez, onListo, onSaltar }: {
  datos: DatosAgenda; primeraVez: boolean; onListo: (ids: string[]) => void; onSaltar: () => void;
}) {
  const candidatas = useMemo(() => datos.materias.filter((m) => !datos.estados.has(m.id)), [datos]);
  const niveles = useMemo(() => {
    const n = [...new Set(candidatas.filter((m) => !m.optativa).map((m) => m.semestre))].sort((a, b) => a - b);
    return candidatas.some((m) => m.optativa) ? [...n, 0] : n; // 0 = optativas
  }, [candidatas]);
  const nivelSugerido = useMemo(() => {
    // El nivel donde vas: el más alto con algo aprobado o firmado, si te queda algo ahí.
    const hechos = datos.materias.filter((m) => !m.optativa && datos.estados.has(m.id)).map((m) => m.semestre);
    const tope = hechos.length ? Math.max(...hechos) : 1;
    return niveles.find((n) => n !== 0 && n >= tope) ?? niveles[0] ?? 1;
  }, [datos, niveles]);
  const [nivel, setNivel] = useState(nivelSugerido);
  const [busqueda, setBusqueda] = useState('');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? candidatas.filter((m) => m.nombre.toLowerCase().includes(q))
    : candidatas.filter((m) => (nivel === 0 ? m.optativa : !m.optativa && m.semestre === nivel));
  const alternar = (id: string) => setElegidas((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const ids = candidatas.filter((m) => elegidas.has(m.id)).map((m) => m.id);
      // soloNuevas: si alguna ya tenía estado (por ejemplo, aprobada desde otro equipo), no se pisa.
      await guardarEstadosEnBloque(ids.map((materiaId) => ({ materiaId, estado: 'cursando', notaFinal: null })), { soloNuevas: true });
      onListo(ids);
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Text style={[s.cuerpo, { marginBottom: espacio.m }]}>
        {primeraVez
          ? 'Primero marcá las materias que estás cursando. Después, al cargar clases o fechas, solo te van a aparecer esas.'
          : 'Marcá las otras materias que estás cursando.'}
      </Text>
      <Campo etiqueta="Buscar" value={busqueda} onChangeText={setBusqueda} placeholder="Nombre de la materia" />
      {!q && niveles.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingBottom: espacio.m }}>
          {niveles.map((n) => <Chip key={n} texto={n === 0 ? 'Optativas' : `${n}º nivel`} elegido={nivel === n} onPress={() => setNivel(n)} />)}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {visibles.map((m) => (
          <Chip key={m.id} texto={m.nombre} icono={elegidas.has(m.id) ? 'checkmark' : undefined} elegido={elegidas.has(m.id)} onPress={() => alternar(m.id)} />
        ))}
        {visibles.length === 0 && <Text style={s.filaDetalle}>{q ? 'No hay materias pendientes con ese nombre.' : 'No te quedan materias en este nivel.'}</Text>}
      </View>
      <Mensaje texto={error} />
      <Boton
        texto={elegidas.size ? `Curso ${elegidas.size === 1 ? 'esta materia' : `estas ${elegidas.size}`}` : 'Elegí al menos una'}
        icono="checkmark"
        onPress={guardar}
        cargando={guardando}
        deshabilitado={!elegidas.size}
      />
      <Boton texto={primeraVez ? 'Es otra cosa, sin materia' : 'Volver'} variante="fantasma" onPress={onSaltar} />
      <View style={{ height: espacio.l }} />
    </>
  );
}

/** Controla el paso "¿qué estás cursando?" dentro de un formulario. */
function usarEleccion(visible: boolean, mias: MateriaAgenda[], editando = false) {
  const [eligiendo, setEligiendo] = useState(false);
  const [saltada, setSaltada] = useState(false);
  useEffect(() => {
    if (visible) { setEligiendo(false); setSaltada(false); }
  }, [visible]);
  const primeraVez = mias.length === 0;
  return {
    // Al editar una clase no se pregunta de entrada; solo si tocás "Sumar materia".
    mostrar: eligiendo || (!editando && primeraVez && !saltada),
    primeraVez,
    abrir: () => setEligiendo(true),
    cerrar: () => { setEligiendo(false); setSaltada(true); },
  };
}

type PropsForm = { visible: boolean; datos?: DatosAgenda | null; onCursando: (ids: string[]) => void; onCerrar: () => void; onListo: () => void };

function FormClase({ visible, clase, diaInicial, datos, recordatoriosApagados, onCursando, onCerrar, onListo }: PropsForm & {
  clase: HorarioDb | null; diaInicial: number; recordatoriosApagados: boolean;
}) {
  // Las que cursás, y también las que ya firmaste (o aprobaste) en este
  // semestre o que siguen en tu horario: el semestre puede no haber terminado.
  const cursando = useMemo(() => {
    const conClases = new Set((datos?.horario ?? []).map((h) => h.materia_id).filter(Boolean));
    return misMaterias(datos, ['cursando', 'firmada', 'aprobada'])
      .filter((m) => datos?.estados.get(m.id) === 'cursando' || conClases.has(m.id) || datos?.terminadasEsteSemestre.has(m.id));
  }, [datos]);
  const unica = cursando.length === 1 ? cursando[0].id : null;
  const [materia, setMateria] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [dias, setDias] = useState<number[]>([diaInicial]);
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [aula, setAula] = useState('');
  const [tipo, setTipo] = useState<TipoClase | null>('teoria');
  const [aviso, setAviso] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (clase) {
      setMateria(clase.materia_id); setTitulo(clase.titulo ?? ''); setDias([clase.dia_semana]);
      setInicio(hora(clase.hora_inicio)); setFin(hora(clase.hora_fin)); setAula(clase.aula ?? ''); setTipo(clase.tipo_clase); setAviso(clase.aviso_minutos);
    } else {
      // Si cursás una sola materia, ya queda elegida.
      setMateria(unica); setTitulo(''); setDias([diaInicial]); setInicio(''); setFin(''); setAula(''); setTipo('teoria'); setAviso(null);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clase, diaInicial]);

  const mias = clase?.materia_id && !cursando.some((m) => m.id === clase.materia_id)
    ? [...cursando, ...(datos?.materias.filter((m) => m.id === clase.materia_id) ?? [])]
    : cursando;
  const eleccion = usarEleccion(visible, mias, clase != null);

  // Al elegir la hora de inicio, se propone que termine 2 horas después.
  const elegirInicio = (v: string) => {
    setInicio(v);
    const hi = horaParaBase(v);
    if (hi && (!fin || (horaParaBase(fin) ?? '') <= hi)) setFin(textoMinutos(Math.min(minutos(hi) + 120, 23 * 60 + 59)));
  };
  const alternarDia = (n: number) => {
    if (clase) { setDias([n]); return; }
    setDias((d) => (d.includes(n) ? (d.length > 1 ? d.filter((x) => x !== n) : d) : [...d, n].sort()));
  };

  const hi = horaParaBase(inicio);
  const hf = horaParaBase(fin);
  const horasOk = hi && hf && hf > hi;
  const valido = (materia || titulo.trim()) && horasOk && dias.length > 0;
  const nombreDe = (h: HorarioDb) => h.titulo || (h.materia_id && datos?.nombres.get(h.materia_id)) || 'otra clase';
  const choques = horasOk
    ? dias.flatMap((d) => choquesCon({ id: clase?.id ?? '', dia_semana: d, hora_inicio: hi!, hora_fin: hf! }, datos?.horario ?? []))
    : [];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const base = { materia_id: materia, titulo: materia ? null : titulo.trim(), hora_inicio: hi!, hora_fin: hf!, aula: aula.trim() || null, tipo_clase: tipo, aviso_minutos: aviso };
      if (clase) await actualizarClase(clase.id, { ...base, dia_semana: dias[0] });
      else await crearClases(dias.map((d) => ({ ...base, dia_semana: d })));
      onListo();
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo={eleccion.mostrar ? '¿Qué estás cursando?' : clase ? 'Editar clase' : 'Nueva clase'} onCerrar={onCerrar}>
      {eleccion.mostrar && datos ? (
        <ElegirCursando
          datos={datos}
          primeraVez={eleccion.primeraVez}
          onListo={(ids) => { onCursando(ids); setMateria(ids[0] ?? null); eleccion.cerrar(); }}
          onSaltar={eleccion.cerrar}
        />
      ) : (
      <>
      {(datos?.materias.length ?? 0) > 0 && <SelectorMateria materias={mias} valor={materia} onCambio={setMateria} onOtra={eleccion.abrir} />}
      {!materia && <Campo etiqueta="Nombre" value={titulo} onChangeText={setTitulo} placeholder="Ej. Tutoría de Física" />}
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Tipo de clase</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }} accessibilityRole="radiogroup">
        {TIPOS_CLASE.map((t) => <Chip key={t.valor} texto={t.texto} icono={t.icono} elegido={tipo === t.valor} onPress={() => setTipo(t.valor)} />)}
      </View>
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>{clase ? 'Día' : 'Días (podés elegir varios)'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {DIAS_CORTOS.slice(0, 6).map((d, i) => <Chip key={d} texto={d} elegido={dias.includes(i + 1)} onPress={() => alternarDia(i + 1)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <CampoFechaHora etiqueta="Empieza" modo="time" valor={inicio} onCambio={elegirInicio} placeholder="Elegir hora" estilo={{ flex: 1 }} />
        <CampoFechaHora etiqueta="Termina" modo="time" valor={fin} onCambio={setFin} placeholder="Elegir hora" estilo={{ flex: 1 }} />
      </View>
      {hi && hf && !horasOk && <Mensaje texto="La clase tiene que terminar después de empezar." />}
      <Campo etiqueta="Aula (opcional)" value={aula} onChangeText={setAula} placeholder="Ej. Aula 12, Lab. de Analítica" maxLength={60} />
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Avisarme antes de la clase</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {OPCIONES_AVISO.map((m) => (
          <Chip key={m ?? 'no'} texto={m == null ? 'No' : textoAviso(m).replace(' antes', '')} icono={m == null ? undefined : 'notifications-outline'} elegido={aviso === m} onPress={() => setAviso(m)} />
        ))}
      </View>
      {aviso != null && recordatoriosApagados && (
        <Mensaje tipo="info" texto="Tenés apagados los recordatorios en Mi perfil. Prendelos para que te llegue este aviso." />
      )}
      {choques.length > 0 && (
        <Mensaje tipo="info" texto={`Se pisa con ${[...new Set(choques.map(nombreDe))].join(', ')}. Podés guardarla igual.`} />
      )}
      <Mensaje texto={error} />
      <Boton texto={clase ? 'Guardar cambios' : dias.length > 1 ? `Agregar en ${dias.length} días` : 'Agregar al horario'} icono={clase ? 'checkmark' : 'add'} onPress={guardar} cargando={guardando} deshabilitado={!valido} />
      <View style={{ height: espacio.l }} />
      </>
      )}
    </Hoja>
  );
}

/** La semana entera en una grilla: cada clase es un bloque en su día y su hora. */
const ALTO_HORA = 46;
function GrillaSemana({ clases, nombre, onElegir, onDia, paraImagen }: {
  clases: HorarioDb[]; nombre: (h: HorarioDb) => string; onElegir?: (h: HorarioDb) => void; onDia?: (n: number) => void;
  /** En la imagen que se comparte no se marca "hoy" ni se puede tocar nada. */
  paraImagen?: boolean;
}) {
  const conDomingo = clases.some((c) => c.dia_semana === 7);
  const dias = conDomingo ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];
  const { desde, hasta } = rangoSemana(clases);
  const horas = Array.from({ length: (hasta - desde) / 60 }, (_, i) => desde + i * 60);
  const alto = ((hasta - desde) / 60) * ALTO_HORA;
  const hoy = paraImagen ? 0 : diaSemanaHoy();
  return (
    <View style={[est.grilla, paraImagen && est.grillaPlana]} accessibilityLabel="Horario de la semana">
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 34 }} />
        {dias.map((d) => (
          <Pressable key={d} onPress={onDia ? () => onDia(d) : undefined} disabled={!onDia} accessibilityRole="button" accessibilityLabel={`Ver ${DIAS[d - 1]}`} style={est.grillaCabecera}>
            <Text style={[est.grillaDia, d === hoy && { color: colores.blanco, backgroundColor: fondos.marino }]}>{DIAS_CORTOS[d - 1]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', height: alto }}>
        <View style={{ width: 34 }}>
          {horas.map((h, i) => (
            <Text key={h} style={[est.grillaHora, { top: i * ALTO_HORA - 6 }]}>{String(h / 60).padStart(2, '0')}</Text>
          ))}
        </View>
        {dias.map((d) => (
          <View key={d} style={[est.grillaColumna, d === hoy && { backgroundColor: fondos.tarjeta }]}>
            {horas.map((h, i) => <View key={h} style={[est.grillaLinea, { top: i * ALTO_HORA }]} />)}
            {acomodarDia(clases.filter((c) => c.dia_semana === d)).map(({ clase: c, columna, columnas }) => {
              const top = ((minutos(c.hora_inicio) - desde) / 60) * ALTO_HORA;
              const altoBloque = Math.max(((minutos(c.hora_fin) - minutos(c.hora_inicio)) / 60) * ALTO_HORA - 2, 18);
              const lineas = Math.max(1, Math.floor((altoBloque - 6) / 13));
              const tipo = infoTipoClase(c.tipo_clase);
              // El tipo va en su propia línea si entra; si el bloque es muy bajo, delante del nombre.
              const tipoAparte = tipo != null && lineas >= 2;
              const conAula = !!c.aula && lineas > (tipoAparte ? 3 : 2);
              const lineasNombre = Math.max(1, lineas - (tipoAparte ? 1 : 0) - (conAula ? 1 : 0));
              return (
                <Pressable
                  key={c.id}
                  onPress={onElegir ? () => onElegir(c) : undefined}
                  disabled={!onElegir}
                  accessibilityRole="button"
                  accessibilityLabel={`${nombreConTipo(nombre(c), c.tipo_clase)}, ${DIAS[d - 1]} de ${hora(c.hora_inicio)} a ${hora(c.hora_fin)}${c.aula ? `, ${c.aula}` : ''}`}
                  style={({ pressed }) => [est.bloque, {
                    top, height: altoBloque, left: `${(columna / columnas) * 100}%`, width: `${100 / columnas}%`,
                    backgroundColor: tonoDe(c.materia_id ?? c.titulo ?? ''), opacity: pressed ? 0.8 : 1,
                  }]}
                >
                  {tipoAparte ? <Text style={est.bloqueTipo} numberOfLines={1}>{tipo!.corto}</Text> : null}
                  <Text style={est.bloqueNombre} numberOfLines={lineasNombre}>{tipo && !tipoAparte ? <Text style={est.bloqueTipo}>{tipo.corto} · </Text> : null}{abreviar(nombre(c))}</Text>
                  {conAula ? <Text style={est.bloqueAula} numberOfLines={1}>{c.aula}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Vista previa del horario como imagen (grilla + lista con tipo y aula),
 * para mandarlo por WhatsApp o subirlo a una historia.
 */
function CompartirHorario({ visible, clases, nombre, onCerrar }: {
  visible: boolean; clases: HorarioDb[]; nombre: (h: HorarioDb) => string; onCerrar: () => void;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  const compartir = async () => {
    setEnviando(true);
    setError(null);
    try {
      await compartirVistaComoImagen(ref, 'Compartir mi horario');
    } catch (e) {
      setError(textoError(e, 'No se pudo compartir la imagen.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Compartir horario" onCerrar={onCerrar}>
      <View ref={ref} collapsable={false} style={est.imagen}>
        <View style={est.imagenCabecera}>
          <View style={est.imagenLogo}>
            <Image source={logoCeq} style={{ width: 22, height: 22 }} accessibilityLabel="Logo del CEQ" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={est.imagenTitulo}>Mi horario</Text>
            <Text style={est.imagenSub}>{textoSemestre(new Date().toISOString())} · Portal CEQ</Text>
          </View>
        </View>
        <GrillaSemana clases={clases} nombre={nombre} paraImagen />
        <View style={{ marginTop: espacio.m, gap: espacio.s }}>
          {clasesPorDia(clases).map(({ dia, clases: delDia }) => (
            <View key={dia}>
              <Text style={est.imagenDia}>{DIAS[dia - 1]}</Text>
              {delDia.map((c) => {
                const tipo = infoTipoClase(c.tipo_clase);
                return (
                  <View key={c.id} style={est.imagenFila}>
                    <Text style={est.imagenHora}>{hora(c.hora_inicio)}–{hora(c.hora_fin)}</Text>
                    <Text style={est.imagenClase}>
                      {nombre(c)}
                      {tipo ? <Text style={est.imagenDetalle}>{` · ${tipo.texto}`}</Text> : null}
                      {c.aula ? <Text style={est.imagenDetalle}>{` · ${c.aula}`}</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
      <Mensaje texto={error} />
      {puedeCompartirImagen ? (
        <Boton texto="Compartir imagen" icono="share-social-outline" onPress={compartir} cargando={enviando} estilo={{ marginTop: espacio.m }} />
      ) : (
        <View style={{ marginTop: espacio.m }}>
          <Mensaje tipo="info" texto="Para compartir la imagen, abrí tu horario desde la app del teléfono." />
        </View>
      )}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

function HorarioOficial({ carreraId }: { carreraId: string | null | undefined }) {
  const { url, deTuCarrera } = horarioOficialDe(carreraId);
  return (
    <Tarjeta estilo={{ marginTop: espacio.m }}>
      <Fila
        icono="document-text-outline"
        titulo={deTuCarrera ? 'Horario oficial de tu carrera' : 'Horarios oficiales de la FCQ'}
        detalle={`${PERIODO_HORARIOS_FCQ}. Abrilo y copiá tus clases con el botón Clase.`}
        onPress={() => WebBrowser.openBrowserAsync(url)}
        ultima
      />
    </Tarjeta>
  );
}

function FormEvento({ visible, uid, datos, onCursando, onCerrar, onListo }: PropsForm & { uid: string }) {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('examen');
  const [materia, setMateria] = useState<string | null>(null);
  const [fecha, setFecha] = useState('');
  const [horaTxt, setHoraTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setTitulo(''); setTipo('examen'); setMateria(null); setFecha(''); setHoraTxt(''); setError(null); }
  }, [visible]);

  // Para fechas también sirven las firmadas: ahí van los finales.
  const mias = misMaterias(datos, ['cursando', 'firmada']);
  const eleccion = usarEleccion(visible, mias);

  const fechaIso = (() => {
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(fecha.trim());
    if (!m) return null;
    const anio = m[3] ? Number(m[3]) : new Date().getFullYear();
    const h = horaTxt ? normalizarHora(horaTxt) : '08:00:00';
    if (!h) return null;
    const [hh, mm] = h.split(':').map(Number);
    const f = new Date(anio, Number(m[2]) - 1, Number(m[1]), hh, mm);
    if (f.getMonth() !== Number(m[2]) - 1) return null;
    return f.toISOString();
  })();
  const valido = titulo.trim() && fechaIso;

  const guardar = async () => {
    setGuardando(true);
    try {
      await crearEvento(uid, { titulo: titulo.trim(), tipo, fecha: fechaIso!, materia_id: materia });
      onListo();
    } catch (e) {
      setError(textoError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo={eleccion.mostrar ? '¿Qué estás cursando?' : 'Nueva fecha'} onCerrar={onCerrar}>
      {eleccion.mostrar && datos ? (
        <ElegirCursando
          datos={datos}
          primeraVez={eleccion.primeraVez}
          onListo={(ids) => { onCursando(ids); setMateria(ids[0] ?? null); eleccion.cerrar(); }}
          onSaltar={eleccion.cerrar}
        />
      ) : (
      <>
      <View style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.m, flexWrap: 'wrap' }}>
        {TIPOS.map((t) => <Chip key={t.valor} texto={t.texto} icono={t.icono} elegido={tipo === t.valor} onPress={() => setTipo(t.valor)} />)}
      </View>
      <Campo etiqueta="Qué es" value={titulo} onChangeText={setTitulo} placeholder="Ej. Segundo parcial" />
      {(datos?.materias.length ?? 0) > 0 && <SelectorMateria materias={mias} valor={materia} onCambio={setMateria} onOtra={eleccion.abrir} />}
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <CampoFechaHora etiqueta="Fecha" modo="date" valor={fecha} onCambio={setFecha} minimo={hoy()} estilo={{ flex: 1.4 }} />
        <CampoFechaHora etiqueta="Hora (opcional)" modo="time" valor={horaTxt} onCambio={setHoraTxt} placeholder="08:00" opcional estilo={{ flex: 1 }} />
      </View>
      <Mensaje texto={error} />
      <Boton texto="Guardar fecha" icono="add" onPress={guardar} cargando={guardando} deshabilitado={!valido} />
      <View style={{ height: espacio.l }} />
      </>
      )}
    </Hoja>
  );
}

const est = crearEstilos(() => ({
  dia: { flex: 1, minHeight: 58, paddingVertical: espacio.s, borderRadius: radio.m, alignItems: 'center', backgroundColor: fondos.superficieBlanca, ...sombras.suave },
  diaActivo: { backgroundColor: fondos.marino },
  diaTexto: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.marino },
  hoy: { fontFamily: fuentes.bold, fontSize: 9, letterSpacing: 0.8, color: colores.azul, marginTop: 2 },
  clase: { flexDirection: 'row', gap: espacio.m, marginBottom: espacio.s },
  claseHora: { width: 48, paddingTop: espacio.m, alignItems: 'flex-end' },
  horaInicio: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.marino },
  horaFin: { fontFamily: fuentes.regular, fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  claseCuerpo: { flex: 1, backgroundColor: fondos.superficieBlanca, borderRadius: radio.m, padding: espacio.m, borderLeftWidth: 4, ...sombras.suave },
  claseNombre: { fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto },
  evento: { flexDirection: 'row', gap: espacio.m, alignItems: 'center', backgroundColor: fondos.superficieBlanca, borderRadius: radio.l, padding: espacio.m, marginBottom: espacio.s, ...sombras.suave },
  fecha: { width: 54, height: 58, borderRadius: radio.m, backgroundColor: fondos.tarjeta, alignItems: 'center', justifyContent: 'center' },
  fechaDia: { fontFamily: fuentes.bold, fontSize: 21, color: colores.marino, lineHeight: 24 },
  grilla: { backgroundColor: fondos.superficieBlanca, borderRadius: radio.l, paddingVertical: espacio.s, paddingRight: espacio.s, ...sombras.suave },
  grillaPlana: { shadowOpacity: 0, elevation: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colores.borde },
  grillaCabecera: { flex: 1, alignItems: 'center', paddingBottom: espacio.s },
  grillaDia: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.marino, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  grillaHora: { position: 'absolute', right: 6, fontFamily: fuentes.regular, fontSize: 10, color: colores.textoSuave },
  grillaColumna: { flex: 1, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colores.borde },
  grillaLinea: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: fondos.borde },
  bloque: { position: 'absolute', borderRadius: 6, paddingHorizontal: 3, paddingVertical: 3, borderWidth: 1, borderColor: colores.superficieBlanca, overflow: 'hidden' },
  bloqueTipo: { fontFamily: fuentes.bold, fontSize: 9, lineHeight: 12, letterSpacing: 0.3, color: colores.blanco, opacity: 0.9, textTransform: 'uppercase' },
  bloqueNombre: { fontFamily: fuentes.semibold, fontSize: 10, lineHeight: 13, color: colores.blanco },
  bloqueAula: { fontFamily: fuentes.regular, fontSize: 9, lineHeight: 12, color: colores.blanco, opacity: 0.9 },
  imagen: { backgroundColor: fondos.fondo, borderRadius: radio.l, padding: espacio.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colores.borde },
  imagenCabecera: { flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.m },
  imagenLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: fondos.blanco, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colores.borde },
  imagenTitulo: { fontFamily: fuentes.bold, fontSize: 20, color: colores.marino },
  imagenSub: { fontFamily: fuentes.medium, fontSize: 12, color: colores.textoSuave, marginTop: 1 },
  imagenDia: { fontFamily: fuentes.bold, fontSize: 12, letterSpacing: 0.6, color: colores.marino, textTransform: 'uppercase', marginBottom: 2 },
  imagenFila: { flexDirection: 'row', gap: espacio.s, paddingVertical: 2 },
  imagenHora: { width: 84, fontFamily: fuentes.semibold, fontSize: 12.5, color: colores.texto },
  imagenClase: { flex: 1, fontFamily: fuentes.semibold, fontSize: 12.5, color: colores.texto },
  imagenDetalle: { fontFamily: fuentes.regular, color: colores.textoSuave },
  fechaMes: { fontFamily: fuentes.semibold, fontSize: 11, color: colores.textoSuave, letterSpacing: 0.8 },
}));
