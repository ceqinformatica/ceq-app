import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { nombreSemestre, pct, SelectorEstado } from '../../components/academico';
import { TarjetaFinales } from '../../components/finales';
import { esSeminario } from '../../lib/finales';
import { BarraSuperior, Boton, Campo, Cargando, EstadoVacio, Fila, Insignia, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { cargarMalla, deshacerRecursada, guardarEstadoMateria } from '../../datos/academico';
import { usarDatos } from '../../datos/usarDatos';
import { cumpleRequisito, requisitosFaltantes, seDesbloquean, type EstadoMateria } from '../../lib/progreso';
import { colores, coloresEstado, espacio, fondos, fuentes, texto } from '../../tema';
import { useTema } from '../../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/carrera'));

export default function DetalleMateria() {
  useTema();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos: malla, cargando, error, setDatos, recargar } = usarDatos(() => cargarMalla(planId, perfil?.carrera_id), [planId]);

  const materia = malla?.materiasDb.find((m) => m.id === id);
  const actual = malla?.estados.get(id ?? '');
  const [estado, setEstado] = useState<EstadoMateria>('pendiente');
  const [notaTxt, setNotaTxt] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'error' | 'exito' } | null>(null);

  useEffect(() => {
    setEstado(actual?.estado ?? 'pendiente');
    setNotaTxt(actual?.notaFinal != null ? String(actual.notaFinal) : '');
  }, [actual?.estado, actual?.notaFinal]);

  const info = useMemo(() => {
    if (!malla || !id) return null;
    const nombre = (mid: string) => malla.materiasDb.find((m) => m.id === mid)?.nombre ?? 'Materia';
    const requisitos = malla.prerrequisitos.filter((p) => p.materiaId === id).map((p) => ({ ...p, nombre: nombre(p.requiereId), ok: cumpleRequisito(malla.estados.get(p.requiereId)?.estado, p.tipo) }));
    const habilita = malla.prerrequisitos.filter((p) => p.requiereId === id).map((p) => ({ ...p, nombre: nombre(p.materiaId) }));
    const faltan = requisitosFaltantes(id, malla.prerrequisitos, malla.estados).length;
    return { requisitos, habilita, faltan, nombre };
  }, [malla, id]);

  const seminario = materia ? esSeminario(materia.nombre) : false;
  const notaNum = seminario || notaTxt.trim() === '' ? null : Number(notaTxt.replace(',', '.'));
  const notaValida = notaNum == null || (Number.isFinite(notaNum) && notaNum >= 1 && notaNum <= 5);
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
      else estados.set(id, { estado, notaFinal: estado === 'aprobada' ? notaNum : null, promedioFirma: actual?.promedioFirma ?? null });
      setDatos({ ...malla, estados });
      setMsg({ tipo: 'exito', texto: nuevos.length ? `Guardado. Ahora podés cursar: ${nuevos.join(', ')}.` : 'Guardado.' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' });
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

  const c = coloresEstado[estado === 'pendiente' && info.faltan ? 'bloqueada' : estado];

  return (
    <Pantalla>
      <BarraSuperior titulo={nombreSemestre(materia.semestre)} onVolver={volver} />

      <Tarjeta>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.s, flexWrap: 'wrap' }}>
          <Insignia texto={c.nombre} color={c.texto} fondo={c.fondo} icono={c.icono as never} />
          {materia.grupo_optativa_id && <Insignia texto="Optativa" />}
          {materia.tiene_laboratorio && <Insignia texto="Con laboratorio" icono="flask" />}
        </View>
        <Text style={[texto.titulo, { color: colores.marino }]} accessibilityRole="header">{materia.nombre}</Text>
        <Text style={[s.filaDetalle, { marginTop: 4 }]}>
          {[materia.codigo, materia.horas ? `${materia.horas} horas` : null, materia.creditos ? `${materia.creditos} créditos` : null].filter(Boolean).join(' · ')}
        </Text>
      </Tarjeta>

      <Seccion>¿Cómo vas con esta materia?</Seccion>
      <SelectorEstado valor={estado} onCambio={setEstado} sinFirma={seminario} bloqueada={info.faltan > 0 && (actual?.estado ?? 'pendiente') === 'pendiente'} />
      {seminario && <Mensaje tipo="info" texto="Los seminarios no llevan nota: se aprueban o no. No tienen firma ni final y no cuentan para tu promedio." />}
      {info.faltan > 0 && (actual?.estado ?? 'pendiente') === 'pendiente' && (
        <Mensaje tipo="info" texto={`Te ${info.faltan === 1 ? 'falta 1 requisito' : `faltan ${info.faltan} requisitos`} para cursarla.`} />
      )}
      {estado === 'aprobada' && !seminario && (
        <Campo
          etiqueta="Nota final (1 a 5)"
          value={notaTxt}
          onChangeText={setNotaTxt}
          keyboardType="decimal-pad"
          maxLength={4}
          placeholder="Ej. 4"
          estilo={{ marginTop: espacio.m }}
        />
      )}
      {!notaValida && <Mensaje texto="La nota va de 1 a 5." />}
      <Boton texto="Guardar" icono="checkmark" onPress={guardar} cargando={guardando} deshabilitado={!cambio || !notaValida} estilo={{ marginTop: espacio.m }} />
      {(estado === 'firmada' || estado === 'aprobada') && actual?.promedioFirma != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginTop: espacio.m }}>
          <Ionicons name="ribbon" size={18} color={colores.marino} />
          <Text style={[s.cuerpo, { fontFamily: fuentes.semibold, color: colores.marino }]}>Tu firma: {pct(actual.promedioFirma)}</Text>
        </View>
      )}
      {(estado === 'cursando' || estado === 'firmada') && !seminario && (
        <Boton texto={estado === 'firmada' ? 'Ver mi firma' : 'Calcular mi firma'} variante="secundario" icono="calculator-outline" onPress={() => router.push(`/firma/${materia.id}`)} />
      )}
      {msg && <Mensaje texto={msg.texto} tipo={msg.tipo} />}
      {actual?.puedeDeshacerRecursada && estado === 'cursando' && (
        <Tarjeta estilo={{ marginTop: espacio.m }}>
          <Text style={s.cuerpo}>Marcaste que volvés a cursar esta materia.</Text>
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
                setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo deshacer.' });
              } finally {
                setGuardando(false);
              }
            }}
          />
        </Tarjeta>
      )}

      {(actual?.estado === 'firmada' || actual?.estado === 'aprobada') && !seminario && (
        <>
          <Seccion estilo={{ marginTop: espacio.xl }}>Finales</Seccion>
          <TarjetaFinales materiaId={materia.id} firma={actual.promedioFirma ?? null} aprobada={actual.estado === 'aprobada'} onGuardado={() => recargar()} />
        </>
      )}

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

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: espacio.s }}>
        <Ionicons name="information-circle-outline" size={15} color={colores.textoSuave} />
        <Text style={[s.filaDetalle, { flex: 1, fontFamily: fuentes.regular }]}>Lo que marcás acá es solo tuyo y no reemplaza tu historial oficial.</Text>
      </View>
    </Pantalla>
  );
}
