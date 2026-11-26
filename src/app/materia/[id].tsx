import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { nombreEstadoMateria, nombreNivel, pct, SelectorEstado, type VistaMateria } from '../../components/academico';
import { TarjetaFinales, TarjetaNotaNecesaria } from '../../components/finales';
import { FormEvaluacion, ICONO_TIPO } from '../../components/form-evaluacion';
import { clasesEnAgendaDe, PreguntaFinClases } from '../../components/pregunta-fin-clases';
import { esRecuperatorio, esRegularizacion } from '../../lib/reglamento-fcq';
import { esSeminario } from '../../lib/finales';
import { AvisoSinConexion, BarraSuperior, Boton, Campo, Cargando, EstadoVacio, Fila, Insignia, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { aAsistencia, aEvaluacion, cargarFirmas, tipoEvaluacion, cargarMalla, deshacerRecursada, guardarEstadoMateria, guardarFirma, REGLA_POR_DEFECTO, reglaDe, tieneLab } from '../../datos/academico';
import { evaluarFirma, porcentajeEvaluacion, promedioFirma } from '../../lib/firma';
import type { EvaluacionDb } from '../../lib/tipos-db';
import { promedioGeneralFcq } from '../../lib/reglamento-fcq';
import { usarDatos } from '../../datos/usarDatos';
import { cumpleRequisito, requisitosFaltantes, seDesbloquean, type EstadoMateria } from '../../lib/progreso';
import { colores, coloresEstado, espacio, fondos, fuentes, texto } from '../../tema';
import { vibrar } from '../../components/movimiento';
import { useTema } from '../../context/TemaProvider';
import { textoError } from '../../lib/errores';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/carrera'));

export default function DetalleMateria() {
  useTema();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos: malla, cargando, error, setDatos, recargar, sinConexion } = usarDatos(() => cargarMalla(planId, perfil?.carrera_id), [planId], { cache: `malla:${planId}` });

  const materia = malla?.materiasDb.find((m) => m.id === id);
  const actual = malla?.estados.get(id ?? '');
  const [estado, setEstado] = useState<EstadoMateria>('pendiente');
  const [notaTxt, setNotaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);
  // Después de registrar la firma: clases de la materia en la agenda (para preguntar si terminaron).
  const [clasesEnAgenda, setClasesEnAgenda] = useState(0);
  // Cambia cuando se borran finales desde acá: la tarjeta de finales se vuelve a cargar.
  const [versionFinales, setVersionFinales] = useState(0);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);
  // Qué pestaña se ve: Pendiente, Cursando, Firma o Finales (no se guarda sola).
  const [vista, setVista] = useState<VistaMateria>('pendiente');
  // En Finales: aprobada sin cargar los finales, solo con la nota.
  const [soloNota, setSoloNota] = useState(false);
  // Firma sin promedio guardado: la que lleva según sus parciales.
  const [firmaEstimada, setFirmaEstimada] = useState<{ id: string; valor: number | null; aviso?: string; error?: boolean } | null>(null);

  const seminario = materia ? esSeminario(materia.nombre) : false;
  const sinFinalesCargados = !(malla?.intentos ?? []).some((i) => i.materiaId === id);
  useEffect(() => {
    const e = actual?.estado ?? 'pendiente';
    setEstado(e);
    setVista(e === 'aprobada' && !seminario ? 'finales' : e);
    // Aprobada sin finales cargados (por ejemplo, marcada en bloque): se ve su nota.
    setSoloNota(e === 'aprobada' && sinFinalesCargados);
    setNotaTxt(actual?.notaFinal != null ? String(actual.notaFinal) : '');
    // Solo al cambiar el estado guardado: cargar un aplazo en Finales no tiene que sacarla de ahí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual?.estado, actual?.notaFinal, seminario]);

  const cambiarVista = (v: VistaMateria) => {
    setVista(v);
    setMsg(null);
    if (v === 'finales') {
      // Finales no cambia el estado: se aprueba al cargar un final aprobado.
      setEstado(actual?.estado ?? 'pendiente');
      setSoloNota((actual?.estado === 'aprobada') && sinFinalesCargados);
    } else setEstado(v);
  };
  const elegirSoloNota = (si: boolean) => {
    setSoloNota(si);
    setEstado(si ? 'aprobada' : actual?.estado ?? 'pendiente');
  };

  const info = useMemo(() => {
    if (!malla || !id) return null;
    const nombre = (mid: string) => malla.materiasDb.find((m) => m.id === mid)?.nombre ?? 'Materia';
    const requisitos = malla.prerrequisitos.filter((p) => p.materiaId === id).map((p) => ({ ...p, nombre: nombre(p.requiereId), ok: cumpleRequisito(malla.estados.get(p.requiereId)?.estado, p.tipo) }));
    const habilita = malla.prerrequisitos.filter((p) => p.requiereId === id).map((p) => ({ ...p, nombre: nombre(p.materiaId) }));
    const faltan = requisitosFaltantes(id, malla.prerrequisitos, malla.estados).length;
    return { requisitos, habilita, faltan, nombre };
  }, [malla, id]);

  const firmaGuardada = actual?.promedioFirma ?? null;
  const verParciales = vista === 'firmada' && !seminario;
  const estimar = verParciales && firmaGuardada == null;
  // Las evaluaciones cargadas, para la lista de la pestaña Parciales.
  // Estados explícitos: cargando (null o de otra materia), lista, o error con reintento.
  const [evaluaciones, setEvaluaciones] = useState<{ id: string; lista: EvaluacionDb[] | null; error?: string } | null>(null);
  const [intentoEvaluaciones, setIntentoEvaluaciones] = useState(0);
  // Hoja de evaluación abierta: una para editar o 'nueva'.
  const [editando, setEditando] = useState<EvaluacionDb | 'nueva' | null>(null);

  useEffect(() => {
    if (!verParciales || !malla || !id) return;
    let vivo = true;
    setEvaluaciones((e) => (e?.id === id && e.error ? null : e));
    cargarFirmas([id])
      .then((firmas) => {
        if (!vivo) return;
        const f = firmas.get(id);
        setEvaluaciones({ id, lista: f?.evaluacionesDb ?? [] });
        if (!f) {
          if (estimar) setFirmaEstimada({ id, valor: null });
          return;
        }
        if (!estimar) return;
        const regla = reglaDe(malla.reglas, id) ?? REGLA_POR_DEFECTO;
        const r = evaluarFirma({
          regla,
          recuperado: f.recuperado,
          tieneLaboratorio: tieneLab(f.evaluacionesDb),
          evaluaciones: f.evaluaciones,
          asistencia: aAsistencia(f.asistencia),
          asistenciaLab: aAsistencia(f.asistenciaLab),
        });
        // Laboratorio combinado con la teoría: la calculadora tampoco saca un promedio de firma.
        if (tieneLab(f.evaluacionesDb) && regla.modoLaboratorio === 'combinado') {
          setFirmaEstimada({ id, valor: null });
          return;
        }
        // Con todo cargado, la firma; si falta algo, el promedio de lo que lleva.
        const parcial = promedioGeneralFcq(r.teoria.actual, r.laboratorio?.actual ?? null);
        const debajo = [r.teoria, r.laboratorio].filter((c) => c != null && c.actual != null && c.actual < c.minimo) as { minimo: number }[];
        const aviso = r.teoria.imposible || r.laboratorio?.imposible
          ? 'Con lo que llevás ya no llegás a la firma. Fijate en "Ver parciales" si te corresponde el Recu o la Regu.'
          : debajo.length
            ? `Con lo que llevás todavía no llegás a la firma (teoría ${r.teoria.minimo} %${r.laboratorio ? `, laboratorio ${r.laboratorio.minimo} %` : ''}). La tabla es para cuando firmes.`
            : undefined;
        setFirmaEstimada({ id, valor: promedioFirma(r, { recuperado: f.recuperado }) ?? (parcial == null ? null : Math.round(parcial + 1e-9)), aviso });
      })
      .catch((e) => {
        if (!vivo) return;
        setEvaluaciones({ id, lista: null, error: textoError(e, 'No pudimos cargar tus evaluaciones.') });
        if (estimar) setFirmaEstimada({ id, valor: null, error: true });
      });
    return () => {
      vivo = false;
    };
  }, [verParciales, estimar, malla, id, intentoEvaluaciones]);
  const notaNum = seminario || notaTxt.trim() === '' ? null : Number(notaTxt.replace(',', '.'));
  const notaValida = notaNum == null || (Number.isFinite(notaNum) && notaNum >= 1 && notaNum <= 5);
  // Deja de estar aprobada con un final aprobado cargado: ese final se borra al guardar.
  const finalesAprobados = actual?.estado === 'aprobada' && estado !== 'aprobada'
    ? (malla?.intentos ?? []).filter((i) => i.materiaId === id && i.nota >= 2)
    : [];
  const cambio = estado !== (actual?.estado ?? 'pendiente') || (estado === 'aprobada' && notaNum !== (actual?.notaFinal ?? null));

  const guardar = async () => {
    if (!malla || !id) return;
    setGuardando(true);
    setMsg(null);
    try {
      const nuevos = seDesbloquean(id, estado, malla.prerrequisitos, malla.estados).map(info!.nombre);
      await guardarEstadoMateria(id, estado, notaNum);
      const estados = new Map(malla.estados);
      if (estado === 'pendiente') estados.delete(id);
      else estados.set(id, { estado, notaFinal: estado === 'aprobada' ? notaNum : null, promedioFirma: actual?.promedioFirma ?? null, periodo: actual?.periodo ?? null, semestreOpuesto: actual?.semestreOpuesto });
      setDatos({ ...malla, estados });
      // Se borraron finales aprobados: recarga para que el promedio quede al día.
      if (finalesAprobados.length) {
        recargar();
        setVersionFinales((v) => v + 1);
      }
      vibrar('exito');
      const firmo = estado === 'firmada' && actual?.estado !== 'firmada';
      setMsg({
        tipo: 'exito',
        texto: nuevos.length
          ? `${firmo ? 'Firma registrada' : 'Guardado'}. Ahora podés cursar: ${nuevos.join(', ')}.`
          : firmo ? `Firma registrada en ${materia?.nombre ?? 'la materia'}.` : 'Guardado.',
      });
      // Recién firmada: si tiene clases en la agenda, preguntar si ya terminaron.
      if (firmo) setClasesEnAgenda(await clasesEnAgendaDe(id));
    } catch (e) {
      setMsg({ tipo: 'error', texto: textoError(e, 'No se pudo guardar.') });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando && !malla) return <Pantalla><BarraSuperior titulo="Materia" onVolver={volver} /><Cargando /></Pantalla>;
  if (!materia || !info) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Materia" onVolver={volver} />
        <EstadoVacio icono="help-circle-outline" titulo="No encontramos esta materia" texto={error ?? undefined} />
      </Pantalla>
    );
  }

  // La insignia muestra lo guardado, no lo que se está eligiendo abajo.
  const guardado = actual?.estado ?? 'pendiente';
  const claveEstado = guardado === 'pendiente' && info.faltan ? 'bloqueada' : guardado;
  const c = coloresEstado[claveEstado];

  return (
    <Pantalla>
      <BarraSuperior titulo={nombreNivel(materia.semestre)} onVolver={volver} />
      <AvisoSinConexion texto={sinConexion && malla ? error : null} />

      <Tarjeta>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.s, flexWrap: 'wrap' }}>
          <Insignia texto={nombreEstadoMateria(claveEstado, c.nombre)} color={c.texto} fondo={c.fondo} icono={c.icono as never} />
          {materia.grupo_optativa_id && <Insignia texto="Optativa" />}
          {materia.tiene_laboratorio && <Insignia texto="Con laboratorio" icono="flask" />}
        </View>
        <Text style={[texto.titulo, { color: colores.marino }]} accessibilityRole="header">{materia.nombre}</Text>
        <Text style={[s.filaDetalle, { marginTop: 4 }]}>
          {[materia.codigo, materia.horas ? `${materia.horas} horas` : null, materia.creditos ? `${materia.creditos} créditos` : null].filter(Boolean).join(' · ')}
        </Text>
      </Tarjeta>

      <Seccion>¿Cómo vas con esta materia?</Seccion>
      <SelectorEstado valor={vista} onCambio={cambiarVista} sinFirma={seminario} bloqueada={info.faltan > 0 && (actual?.estado ?? 'pendiente') === 'pendiente'} />
      {seminario && <Mensaje tipo="info" texto="Los seminarios no llevan nota: se aprueban o no. No tienen firma ni final y no cuentan para tu promedio." />}
      {info.faltan > 0 && (actual?.estado ?? 'pendiente') === 'pendiente' && (
        <Mensaje tipo="info" texto={`Te ${info.faltan === 1 ? 'falta 1 requisito' : `faltan ${info.faltan} requisitos`} para cursarla.`} />
      )}

      {/* Finales: se cargan los finales; con uno aprobado la materia queda aprobada sola. */}
      {vista === 'finales' && !soloNota && (
        <>
          <TarjetaFinales
            key={versionFinales}
            materiaId={materia.id}
            periodoFirma={actual?.periodo}
            semestreOpuesto={actual?.semestreOpuesto}
            anioPlan={malla?.plan?.anio}
            firma={firmaGuardada}
            aprobada={actual?.estado === 'aprobada'}
            onGuardado={() => recargar()}
            onSoloNota={sinFinalesCargados ? () => elegirSoloNota(true) : undefined}
          />
        </>
      )}
      {vista === 'finales' && soloNota && (
        <>
          <Campo
            etiqueta="Nota final (1 a 5)"
            value={notaTxt}
            onChangeText={setNotaTxt}
            keyboardType="decimal-pad"
            maxLength={4}
            placeholder="Ej. 4"
            estilo={{ marginTop: espacio.m }}
          />
          {!notaValida && <Mensaje texto="La nota va de 1 a 5." />}
          <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!cambio || !notaValida} />
          <Boton texto="Cargar los finales" variante="fantasma" compacto icono="create-outline" onPress={() => elegirSoloNota(false)} />
        </>
      )}

      {vista !== 'finales' && !verParciales && (
        <>
          {finalesAprobados.length > 0 && (
            <Mensaje
              tipo="info"
              texto={`Al guardar se borra ${finalesAprobados.length === 1 ? `el final aprobado que cargaste (nota ${finalesAprobados[0].nota})` : 'los finales aprobados que cargaste'} y deja de contar en tu promedio. Los aplazos se conservan.`}
            />
          )}
          {cambio && <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} estilo={{ marginTop: espacio.m }} />}
        </>
      )}
      {msg && <Mensaje texto={msg.texto} tipo={msg.tipo} />}

      {/* Cursando: los parciales y cuánto le falta para la firma. */}
      {vista === 'cursando' && !seminario && (
        <Boton texto="Ver parciales" variante="secundario" icono="calculator-outline" onPress={() => router.push(`/firma/${materia.id}`)} />
      )}
      {actual?.puedeDeshacerRecursada && vista === 'cursando' && (
        <Tarjeta estilo={{ marginTop: espacio.m }}>
          <Text style={s.cuerpo}>Marcaste que volvés a cursar esta materia{actual.semestreOpuesto ? ' en el semestre opuesto' : ''}.</Text>
          <Text style={[s.filaDetalle, { marginTop: 4 }]}>
            {confirmarDeshacer
              ? '¿Seguro? La materia vuelve a como estaba antes, con tu firma, tus parciales y tus finales.'
              : '¿Fue un error? Lo podés deshacer mientras no cargues parciales, asistencia ni finales nuevos.'}
          </Text>
          <Boton
            texto={confirmarDeshacer ? 'Sí, deshacer' : 'Deshacer'}
            icono="arrow-undo"
            variante="secundario"
            compacto
            cargando={guardando}
            estilo={{ marginTop: espacio.s, alignSelf: 'flex-start' }}
            onPress={async () => {
              if (!confirmarDeshacer) {
                setConfirmarDeshacer(true);
                return;
              }
              setConfirmarDeshacer(false);
              setGuardando(true);
              setMsg(null);
              try {
                await deshacerRecursada(materia.id);
                recargar();
                setMsg({ tipo: 'exito', texto: 'Listo, la materia volvió a como estaba.' });
              } catch (e) {
                setMsg({ tipo: 'error', texto: textoError(e, 'No se pudo deshacer.') });
              } finally {
                setGuardando(false);
              }
            }}
          />
        </Tarjeta>
      )}


      {/* Parciales: las evaluaciones, registrar la firma y cuánto necesita en el final. */}
      {verParciales && (
        <>
          <Seccion icono="document-text-outline" accion={evaluaciones?.id === materia.id && evaluaciones.lista ? { texto: '+ Agregar', onPress: () => setEditando('nueva') } : undefined}>Evaluaciones</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {evaluaciones?.id !== materia.id ? (
              <Text style={[s.filaDetalle, { paddingVertical: espacio.m }]}>Cargando…</Text>
            ) : evaluaciones.lista == null ? (
              <View style={{ paddingVertical: espacio.m }}>
                <Text style={s.filaDetalle}>{evaluaciones.error ?? 'No pudimos cargar tus evaluaciones.'}</Text>
                <Boton texto="Reintentar" variante="fantasma" compacto icono="refresh" onPress={() => setIntentoEvaluaciones((n) => n + 1)} estilo={{ marginTop: espacio.s }} />
              </View>
            ) : evaluaciones.lista.length === 0 ? (
              <View style={{ paddingVertical: espacio.m }}>
                <Text style={s.filaDetalle}>Todavía no cargaste parciales{materia.tiene_laboratorio ? ' ni el laboratorio' : ''}.</Text>
                <Boton texto="Agregar evaluación" variante="fantasma" compacto icono="add" onPress={() => setEditando('nueva')} estilo={{ marginTop: espacio.s, alignSelf: 'flex-start' }} />
              </View>
            ) : (
              (['teoria', 'laboratorio'] as const).map((comp) => {
                const lista = evaluaciones.lista!.filter((e) => e.componente === comp);
                if (!lista.length) return null;
                return (
                  <View key={comp} style={{ paddingTop: espacio.s }}>
                    <Text style={[s.filaDetalle, { fontFamily: fuentes.semibold }]}>{comp === 'teoria' ? 'Teoría' : 'Laboratorio'}</Text>
                    {lista.map((e, i) => {
                      const p = porcentajeEvaluacion(aEvaluacion(e));
                      return (
                        <Fila
                          key={e.id}
                          icono={ICONO_TIPO[tipoEvaluacion(e)]}
                          simple
                          titulo={e.nombre}
                          derecha={
                            e.rendida && p != null
                              ? <Text style={{ fontFamily: fuentes.semibold, fontSize: 15, color: colores.texto }}>{pct(Math.round(p * 10) / 10)}</Text>
                              : <Insignia texto="Pendiente" color={colores.gris} fondo={fondos.grisFondo} />
                          }
                          onPress={() => setEditando(e)}
                          ultima={i === lista.length - 1}
                        />
                      );
                    })}
                  </View>
                );
              })
            )}
          </Tarjeta>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/firma/${materia.id}`)} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: espacio.xs, marginTop: espacio.xs }}>
            <Text style={{ fontFamily: fuentes.semibold, fontSize: 13, color: colores.azul }}>Ver detalle y asistencia</Text>
          </Pressable>
          <FormEvaluacion
            visible={editando != null}
            evaluacion={editando === 'nueva' ? null : editando}
            materiaId={materia.id}
            onCerrar={() => setEditando(null)}
            onGuardado={() => {
              setEditando(null);
              vibrar('exito');
              setIntentoEvaluaciones((n) => n + 1);
            }}
            sinRecuperatorio={actual?.semestreOpuesto}
            cursaOpuesto={actual?.semestreOpuesto}
            otrasRecuRegu={(evaluaciones?.lista ?? []).filter((e) => (esRecuperatorio(e) || esRegularizacion(e)) && e.rendida && (editando === 'nueva' || e.id !== editando?.id)).length}
          />
          {guardado !== 'firmada' && (
            <Boton
              texto="Registrar firma obtenida"
              icono="checkmark"
              onPress={guardar}
              cargando={guardando}
              deshabilitado={!cambio}
              estilo={{ marginTop: espacio.m }}
            />
          )}
          {guardado !== 'firmada' && finalesAprobados.length > 0 && (
            <Mensaje
              tipo="info"
              texto={`Al registrar la firma se borra ${finalesAprobados.length === 1 ? `el final aprobado que cargaste (nota ${finalesAprobados[0].nota})` : 'los finales aprobados que cargaste'} y deja de contar en tu promedio. Los aplazos se conservan.`}
            />
          )}
          <Seccion icono="calculator-outline" estilo={{ marginTop: espacio.l }}>¿Cuánto necesitás en el final?</Seccion>
          <TarjetaNotaNecesaria
            firma={firmaGuardada ?? (firmaEstimada?.id === materia.id ? firmaEstimada.valor : null)}
            estimada={firmaGuardada == null}
            aviso={firmaGuardada == null && firmaEstimada?.id === materia.id ? firmaEstimada.aviso : undefined}
            sinDatos={firmaEstimada?.id !== materia.id ? 'Calculando…' : 'No pudimos calcularlo ahora. Revisá tu conexión y volvé a entrar.'}
            // Sin firma guardada ni parciales cargados: deja escribir con cuánto firmó.
            onGuardarFirma={firmaGuardada == null && (firmaEstimada?.id !== materia.id || firmaEstimada.error) ? undefined : async (f) => {
              const yaFirmada = actual?.estado === 'firmada';
              await guardarFirma(materia.id, f);
              recargar();
              // Recién firmada: si tiene clases en la agenda, preguntar si ya terminaron.
              if (!yaFirmada && actual?.estado !== 'aprobada') setClasesEnAgenda(await clasesEnAgendaDe(materia.id));
            }}
          />
        </>
      )}

      {(vista === 'pendiente' || vista === 'cursando' || seminario) && (
        <>
      <Seccion estilo={{ marginTop: espacio.xl }}>Prerrequisitos</Seccion>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        {info.requisitos.length === 0 ? (
          <Fila icono="sparkles-outline" titulo="Sin prerrequisitos" detalle="Podés cursarla cuando quieras." ultima />
        ) : (
          info.requisitos.map((r, i) => (
            <Fila
              key={r.requiereId}
              icono={r.ok ? 'checkmark' : 'lock-closed'}
              colorIcono={r.ok ? colores.verde : colores.gris}
              fondoIcono={r.ok ? fondos.verdeFondo : fondos.grisFondo}
              titulo={r.nombre}
              detalle={`Tenerla ${r.tipo}`}
              onPress={() => router.push(`/materia/${r.requiereId}`)}
              ultima={i === info.requisitos.length - 1}
            />
          ))
        )}
      </Tarjeta>

      {info.habilita.length > 0 && (
        <>
          <Seccion>Te habilita para</Seccion>
          <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
            {info.habilita.map((h, i) => (
              <Fila
                key={h.materiaId}
                icono="arrow-forward"
                titulo={h.nombre}
                detalle={`Pide esta materia ${h.tipo}`}
                onPress={() => router.push(`/materia/${h.materiaId}`)}
                ultima={i === info.habilita.length - 1}
              />
            ))}
          </Tarjeta>
        </>
      )}

        </>
      )}

      <PreguntaFinClases
        materiaId={materia.id}
        nombre={materia.nombre}
        clases={clasesEnAgenda}
        onCerrar={() => setClasesEnAgenda(0)}
        onQuitada={() => setMsg({ tipo: 'exito', texto: `Firma registrada. Quitamos ${materia.nombre} de tu agenda.` })}
        onError={(texto) => setMsg({ tipo: 'error', texto })}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: espacio.s }}>
        <Ionicons name="information-circle-outline" size={15} color={colores.textoSuave} />
        <Text style={[s.filaDetalle, { flex: 1, fontFamily: fuentes.regular }]}>Lo que marcás acá es solo tuyo y no reemplaza tu historial oficial.</Text>
      </View>
    </Pantalla>
  );
}
