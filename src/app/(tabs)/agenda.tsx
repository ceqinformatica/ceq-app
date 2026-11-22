import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CabeceraMarca, Boton, Campo, Cargando, Chip, EstadoVacio, Hoja, Insignia, Mensaje, Pantalla, s, Segmentado, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import {
  borrarClase, borrarEvento, cargarAgenda, crearClase, crearEvento, cuentaRegresiva, DIAS, DIAS_CORTOS, diaSemanaHoy, diasHasta, hora, horaDe,
  partesFecha, type Agenda as DatosAgenda,
} from '../../datos/agenda';
import { usarDatos } from '../../datos/usarDatos';
import type { EventoDb, HorarioDb, TipoEvento } from '../../lib/tipos-db';
import { colores, espacio, fuentes, radio, sombras } from '../../tema';

/** Paleta suave para distinguir materias en el horario (siempre dentro de la familia azul del CEQ + acentos). */
const TONOS = ['#173874', '#3873CE', '#1D7A47', '#A86A00', '#7A3E9D', '#0F7C8C', '#5A6B85'];
const tonoDe = (clave: string) => TONOS[[...clave].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];

const TIPOS: { valor: TipoEvento; texto: string; icono: 'school' | 'document-text' | 'notifications' }[] = [
  { valor: 'examen', texto: 'Examen', icono: 'school' },
  { valor: 'entrega', texto: 'Entrega', icono: 'document-text' },
  { valor: 'recordatorio', texto: 'Recordatorio', icono: 'notifications' },
];

export default function Agenda() {
  const { perfil, sesion } = useSesion();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(() => cargarAgenda(perfil?.plan_id), [perfil?.plan_id]);
  const [vista, setVista] = useState<'horario' | 'fechas'>('horario');
  const [dia, setDia] = useState(diaSemanaHoy() === 7 ? 1 : diaSemanaHoy());
  const [nuevaClase, setNuevaClase] = useState(false);
  const [nuevoEvento, setNuevoEvento] = useState(false);
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
  const nombreClase = (h: HorarioDb) => h.titulo || (h.materia_id && datos?.nombres.get(h.materia_id)) || 'Clase';

  return (
    <View style={{ flex: 1, backgroundColor: colores.fondo }}>
      <Pantalla
        cabecera={<CabeceraMarca titulo="Agenda" sub={vista === 'horario' ? 'Tu semana de clases' : 'Tus exámenes, entregas y recordatorios'} compacta />}
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
            <View style={{ flexDirection: 'row', gap: 6, paddingBottom: espacio.m }}>
              {DIAS_CORTOS.slice(0, 6).map((d, i) => {
                const n = i + 1;
                const activo = n === dia;
                const hoy = n === diaSemanaHoy();
                const cantidad = datos?.horario.filter((h) => h.dia_semana === n).length ?? 0;
                return (
                  <Pressable key={d} onPress={() => setDia(n)} accessibilityRole="tab" accessibilityState={{ selected: activo }} accessibilityLabel={`${DIAS[i]}, ${cantidad} clases`} style={[est.dia, activo && est.diaActivo]}>
                    <Text style={[est.diaTexto, activo && { color: colores.blanco }]}>{d}</Text>
                    <View style={{ flexDirection: 'row', gap: 3, height: 6, marginTop: 4 }}>
                      {Array.from({ length: Math.min(cantidad, 4) }).map((_, k) => (
                        <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: activo ? colores.celeste : colores.marino, opacity: activo ? 1 : 0.5 }} />
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
                return (
                  <Pressable key={h.id} onPress={() => setClaseElegida(h)} accessibilityRole="button" accessibilityLabel={`${nombreClase(h)}, de ${hora(h.hora_inicio)} a ${hora(h.hora_fin)}`} style={({ pressed }) => [est.clase, pressed && { opacity: 0.85 }]}>
                    <View style={est.claseHora}>
                      <Text style={est.horaInicio}>{hora(h.hora_inicio)}</Text>
                      <Text style={est.horaFin}>{hora(h.hora_fin)}</Text>
                    </View>
                    <View style={[est.claseCuerpo, { borderLeftColor: tono }]}>
                      <Text style={est.claseNombre} numberOfLines={2}>{nombreClase(h)}</Text>
                      {h.aula ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Ionicons name="location-outline" size={13} color={colores.textoSuave} />
                          <Text style={s.filaDetalle}>{h.aula}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </>
        ) : (
          <ListaEventos datos={datos!} onElegir={setEventoElegido} />
        )}
        <View style={{ height: 64 }} />
      </Pantalla>

      <Pressable
        onPress={() => (vista === 'horario' ? setNuevaClase(true) : setNuevoEvento(true))}
        accessibilityRole="button"
        accessibilityLabel={vista === 'horario' ? 'Agregar clase' : 'Agregar fecha'}
        style={({ pressed }) => [s.flotante, pressed && { backgroundColor: colores.marinoProfundo }]}
      >
        <Ionicons name="add" size={22} color={colores.blanco} />
        <Text style={s.flotanteTexto}>{vista === 'horario' ? 'Clase' : 'Fecha'}</Text>
      </Pressable>

      <FormClase visible={nuevaClase} diaInicial={dia} nombres={datos?.nombres} onCerrar={() => setNuevaClase(false)} onListo={() => { setNuevaClase(false); recargar(); }} />
      <FormEvento visible={nuevoEvento} uid={sesion?.user.id ?? ''} nombres={datos?.nombres} onCerrar={() => setNuevoEvento(false)} onListo={() => { setNuevoEvento(false); recargar(); }} />

      <Hoja visible={claseElegida != null} titulo={claseElegida ? nombreClase(claseElegida) : ''} onCerrar={() => setClaseElegida(null)}>
        {claseElegida && (
          <Detalle
            filas={[
              ['calendar-outline', DIAS[claseElegida.dia_semana - 1]],
              ['time-outline', `${hora(claseElegida.hora_inicio)} a ${hora(claseElegida.hora_fin)}`],
              ...(claseElegida.aula ? [['location-outline', claseElegida.aula] as [string, string]] : []),
            ]}
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
            <View style={[est.fecha, urgente && { backgroundColor: colores.marino }]}>
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
                <Insignia texto={cuentaRegresiva(e.fecha)} color={urgente ? colores.amarillo : colores.textoSuave} fondo={urgente ? colores.amarilloFondo : colores.grisFondo} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

function Detalle({ filas, onBorrar, textoBorrar, nota }: { filas: [string, string][]; onBorrar?: () => Promise<void>; textoBorrar: string; nota?: string }) {
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

function SelectorMateria({ nombres, valor, onCambio }: { nombres?: Map<string, string>; valor: string | null; onCambio: (id: string | null) => void }) {
  const lista = [...(nombres?.entries() ?? [])];
  if (!lista.length) return null;
  return (
    <>
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Materia</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espacio.s, paddingBottom: espacio.m }}>
        <Chip texto="Ninguna" elegido={valor == null} onPress={() => onCambio(null)} />
        {lista.map(([id, n]) => (
          <Chip key={id} texto={n} elegido={valor === id} onPress={() => onCambio(id)} />
        ))}
      </ScrollView>
    </>
  );
}

function FormClase({ visible, diaInicial, nombres, onCerrar, onListo }: { visible: boolean; diaInicial: number; nombres?: Map<string, string>; onCerrar: () => void; onListo: () => void }) {
  const [materia, setMateria] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [dia, setDia] = useState(diaInicial);
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [aula, setAula] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setMateria(null); setTitulo(''); setDia(diaInicial); setInicio(''); setFin(''); setAula(''); setError(null); }
  }, [visible, diaInicial]);

  const hi = normalizarHora(inicio);
  const hf = normalizarHora(fin);
  const valido = (materia || titulo.trim()) && hi && hf && hf > hi;

  const guardar = async () => {
    setGuardando(true);
    try {
      await crearClase({ materia_id: materia, titulo: materia ? null : titulo.trim(), dia_semana: dia, hora_inicio: hi!, hora_fin: hf!, aula: aula.trim() || null });
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Nueva clase" onCerrar={onCerrar}>
      <SelectorMateria nombres={nombres} valor={materia} onCambio={setMateria} />
      {!materia && <Campo etiqueta="Nombre" value={titulo} onChangeText={setTitulo} placeholder="Ej. Tutoría de Física" />}
      <Text style={[s.etiqueta, { marginBottom: espacio.s }]}>Día</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginBottom: espacio.m }}>
        {DIAS_CORTOS.slice(0, 6).map((d, i) => <Chip key={d} texto={d} elegido={dia === i + 1} onPress={() => setDia(i + 1)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <Campo etiqueta="Empieza" value={inicio} onChangeText={setInicio} placeholder="07:30" keyboardType="numbers-and-punctuation" maxLength={5} estilo={{ flex: 1 }} />
        <Campo etiqueta="Termina" value={fin} onChangeText={setFin} placeholder="09:30" keyboardType="numbers-and-punctuation" maxLength={5} estilo={{ flex: 1 }} />
      </View>
      {inicio.length >= 4 && fin.length >= 4 && (!hi || !hf || hf <= hi) && <Mensaje texto="Revisá las horas (formato 07:30, y que termine después de empezar)." />}
      <Campo etiqueta="Aula (opcional)" value={aula} onChangeText={setAula} placeholder="Ej. Aula 12" />
      <Mensaje texto={error} />
      <Boton texto="Agregar al horario" icono="add" onPress={guardar} cargando={guardando} deshabilitado={!valido} />
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

function FormEvento({ visible, uid, nombres, onCerrar, onListo }: { visible: boolean; uid: string; nombres?: Map<string, string>; onCerrar: () => void; onListo: () => void }) {
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
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Nueva fecha" onCerrar={onCerrar}>
      <View style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.m, flexWrap: 'wrap' }}>
        {TIPOS.map((t) => <Chip key={t.valor} texto={t.texto} icono={t.icono} elegido={tipo === t.valor} onPress={() => setTipo(t.valor)} />)}
      </View>
      <Campo etiqueta="Qué es" value={titulo} onChangeText={setTitulo} placeholder="Ej. Segundo parcial" />
      <SelectorMateria nombres={nombres} valor={materia} onCambio={setMateria} />
      <View style={{ flexDirection: 'row', gap: espacio.m }}>
        <Campo etiqueta="Fecha" value={fecha} onChangeText={setFecha} placeholder="DD/MM" keyboardType="numbers-and-punctuation" maxLength={10} estilo={{ flex: 1.3 }} />
        <Campo etiqueta="Hora (opcional)" value={horaTxt} onChangeText={setHoraTxt} placeholder="08:00" keyboardType="numbers-and-punctuation" maxLength={5} estilo={{ flex: 1 }} />
      </View>
      {fecha.length >= 3 && !fechaIso && <Mensaje texto="Escribí la fecha como 15/12 o 15/12/2026." />}
      <Mensaje texto={error} />
      <Boton texto="Guardar fecha" icono="add" onPress={guardar} cargando={guardando} deshabilitado={!valido} />
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}

const est = StyleSheet.create({
  dia: { flex: 1, minHeight: 58, paddingVertical: espacio.s, borderRadius: radio.m, alignItems: 'center', backgroundColor: colores.superficieBlanca, ...sombras.suave },
  diaActivo: { backgroundColor: colores.marino },
  diaTexto: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.marino },
  hoy: { fontFamily: fuentes.bold, fontSize: 9, letterSpacing: 0.8, color: colores.azul, marginTop: 2 },
  clase: { flexDirection: 'row', gap: espacio.m, marginBottom: espacio.s },
  claseHora: { width: 48, paddingTop: espacio.m, alignItems: 'flex-end' },
  horaInicio: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.marino },
  horaFin: { fontFamily: fuentes.regular, fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  claseCuerpo: { flex: 1, backgroundColor: colores.superficieBlanca, borderRadius: radio.m, padding: espacio.m, borderLeftWidth: 4, ...sombras.suave },
  claseNombre: { fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto },
  evento: { flexDirection: 'row', gap: espacio.m, alignItems: 'center', backgroundColor: colores.superficieBlanca, borderRadius: radio.l, padding: espacio.m, marginBottom: espacio.s, ...sombras.suave },
  fecha: { width: 54, height: 58, borderRadius: radio.m, backgroundColor: colores.tarjeta, alignItems: 'center', justifyContent: 'center' },
  fechaDia: { fontFamily: fuentes.bold, fontSize: 21, color: colores.marino, lineHeight: 24 },
  fechaMes: { fontFamily: fuentes.semibold, fontSize: 11, color: colores.textoSuave, letterSpacing: 0.8 },
});
