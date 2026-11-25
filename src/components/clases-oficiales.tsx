import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { crearClases, DIAS, hora, type Agenda } from '../datos/agenda';
import { horarioOficialDe, PERIODO_HORARIOS_FCQ } from '../datos/horario-oficial';
import { cargarHorarioClasesPublicado, urlPdfHorarioClases } from '../datos/horarios-clases';
import { clasesDeMisMaterias, seccionSugerida } from '../lib/clases-oficiales';
import { textoError } from '../lib/errores';
import { infoTipoClase } from '../lib/tipo-clase';
import type { ClaseOficialDb, HorarioClasesDb } from '../lib/tipos-db';
import { colores, espacio } from '../tema';
import { Boton, Chip, Fila, Hoja, Mensaje, s, Tarjeta } from './ui';

/**
 * Tarjeta de la agenda con el horario oficial de tu carrera. Si el CEQ ya
 * publicó el horario de clases, te deja cargar las de tus materias con un
 * toque; si no, abre el PDF de la facultad para copiarlas a mano.
 */
export function HorarioOficial({ carreraId, planId, datos, onCargadas }: {
  carreraId: string | null | undefined; planId: string | null | undefined; datos: Agenda | null | undefined; onCargadas: () => void;
}) {
  const [oficial, setOficial] = useState<{ horario: HorarioClasesDb; clases: ClaseOficialDb[]; general: boolean } | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const { url, deTuCarrera } = horarioOficialDe(carreraId);

  useEffect(() => {
    let activo = true;
    cargarHorarioClasesPublicado(carreraId, planId)
      .then((r) => activo && setOficial(r))
      .catch(() => activo && setOficial(null));
    return () => {
      activo = false;
    };
  }, [carreraId, planId]);

  // Con un horario publicado que trae su PDF, se abre ese (y se nombra su
  // periodo); si no, el enlace fijo de la facultad con su periodo.
  const conPdf = !!oficial?.horario.pdf_path;
  const abrirPdf = async () => {
    setErrorPdf(null);
    if (!oficial?.horario.pdf_path) {
      WebBrowser.openBrowserAsync(url);
      return;
    }
    try {
      const firmado = await urlPdfHorarioClases(oficial.horario.pdf_path);
      if (!firmado) throw new Error('No se pudo abrir el PDF');
      await WebBrowser.openBrowserAsync(firmado);
    } catch (e) {
      setErrorPdf(textoError(e));
    }
  };

  return (
    <>
      <Tarjeta estilo={{ marginTop: espacio.m, paddingVertical: espacio.xs }}>
        {oficial ? (
          <Fila
            icono="download-outline"
            titulo="Cargar mis clases del horario oficial"
            detalle={`${oficial.horario.titulo}${oficial.general ? ' (horario general de la carrera, no de tu plan)' : ''}. Elegí tus materias y se agregan a la agenda.`}
            onPress={() => setAbierta(true)}
          />
        ) : null}
        <Fila
          icono="document-text-outline"
          titulo={conPdf ? 'PDF original del horario' : deTuCarrera ? 'PDF del horario de tu carrera' : 'Horarios oficiales de la FCQ'}
          detalle={conPdf ? `${oficial!.horario.titulo}. El original que subió el CEQ.` : `${PERIODO_HORARIOS_FCQ}. Abrilo y copiá tus clases con el botón Clase.`}
          onPress={abrirPdf}
          ultima
        />
        {errorPdf ? <Mensaje tipo="error" texto={errorPdf} /> : null}
      </Tarjeta>
      {oficial ? (
        <HojaCargarClases
          visible={abierta}
          clases={oficial.clases}
          datos={datos}
          onCerrar={() => setAbierta(false)}
          onListo={() => {
            setAbierta(false);
            onCargadas();
          }}
        />
      ) : null}
    </>
  );
}

function HojaCargarClases({ visible, clases, datos, onCerrar, onListo }: {
  visible: boolean; clases: ClaseOficialDb[]; datos: Agenda | null | undefined; onCerrar: () => void; onListo: () => void;
}) {
  const mias = useMemo(() => datos?.materias.filter((m) => datos.estados.get(m.id) === 'cursando') ?? [], [datos]);
  const { materias, faltan } = useMemo(() => clasesDeMisMaterias(clases, mias, datos?.horario ?? []), [clases, mias, datos]);
  // Por materia: la sección elegida ('' = sin sección) o null si no se agrega.
  const [eleccion, setEleccion] = useState<Map<string, string | null>>(new Map());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setEleccion(new Map(materias.map((m) => {
      const sugerida = seccionSugerida(m);
      const sec = m.secciones.find((x) => x.seccion === sugerida);
      // Si ya tenés todas esas clases, no se vuelve a agregar.
      return [m.materiaId, sec?.clases.every((c) => c.yaEsta) ? null : sugerida ?? ''];
    })));
  }, [visible, materias]);

  const aAgregar = materias.flatMap((m) => {
    const e = eleccion.get(m.materiaId);
    if (e == null) return [];
    const sec = m.secciones.find((x) => (x.seccion ?? '') === e);
    return (sec?.clases ?? []).filter((c) => !c.yaEsta).map((c) => ({ materiaId: m.materiaId, c }));
  });

  const agregar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await crearClases(aAgregar.map(({ materiaId, c }) => ({
        materia_id: materiaId,
        titulo: null,
        dia_semana: c.dia_semana,
        hora_inicio: hora(c.hora_inicio) + ':00',
        hora_fin: hora(c.hora_fin) + ':00',
        aula: c.aula,
        tipo_clase: c.tipo_clase,
        aviso_minutos: null,
      })));
      onListo();
    } catch (e) {
      setError(textoError(e, 'No se pudieron agregar las clases.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Hoja visible={visible} titulo="Cargar mis clases" onCerrar={onCerrar}>
      {!mias.length ? (
        <Mensaje tipo="info" texto='Primero marcá qué materias cursás este semestre (botón "Clase" o en Mi carrera).' />
      ) : !materias.length ? (
        <Mensaje tipo="info" texto="Ninguna de las materias que cursás está en el horario oficial publicado. Cargalas a mano con el botón Clase." />
      ) : (
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>Estas son las clases de las materias que cursás. Si hay secciones, elegí la tuya.</Text>
      )}
      {materias.map((m) => {
        const e = eleccion.get(m.materiaId);
        const incluida = e != null;
        const sec = m.secciones.find((x) => (x.seccion ?? '') === (e ?? seccionSugerida(m) ?? ''));
        return (
          <Tarjeta key={m.materiaId} estilo={{ marginBottom: espacio.m }}>
            <Pressable
              onPress={() => setEleccion((mapa) => new Map(mapa).set(m.materiaId, incluida ? null : seccionSugerida(m) ?? ''))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: incluida }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}
            >
              <Ionicons name={incluida ? 'checkbox' : 'square-outline'} size={24} color={incluida ? colores.marino : colores.textoSuave} />
              <Text style={[s.filaTitulo, { flex: 1 }]}>{m.nombre}</Text>
            </Pressable>
            {m.secciones.length > 1 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginTop: espacio.s }}>
                {m.secciones.map((x) => (
                  <Chip key={x.seccion ?? ''} texto={`Sección ${x.seccion ?? 'única'}`} elegido={incluida && (x.seccion ?? '') === e} onPress={() => setEleccion((mapa) => new Map(mapa).set(m.materiaId, x.seccion ?? ''))} />
                ))}
              </View>
            )}
            {(sec?.clases ?? []).map((c, i) => (
              <Text key={i} style={[s.filaDetalle, { marginTop: espacio.xs, opacity: incluida ? 1 : 0.5 }]}>
                {DIAS[c.dia_semana - 1]} {hora(c.hora_inicio)} a {hora(c.hora_fin)}
                {infoTipoClase(c.tipo_clase) ? ` · ${infoTipoClase(c.tipo_clase)!.texto}` : ''}
                {c.aula ? ` · ${c.aula}` : ''}
                {c.yaEsta ? ' · ya está en tu agenda' : ''}
              </Text>
            ))}
          </Tarjeta>
        );
      })}
      {faltan.length > 0 && materias.length > 0 && (
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>No están en el horario oficial: {faltan.join(', ')}. Esas cargalas a mano.</Text>
      )}
      <Mensaje texto={error} />
      {materias.length > 0 && (
        <Boton
          texto={aAgregar.length ? `Agregar ${aAgregar.length} ${aAgregar.length === 1 ? 'clase' : 'clases'}` : 'No hay clases nuevas'}
          icono="add"
          onPress={agregar}
          cargando={guardando}
          deshabilitado={!aAgregar.length || guardando}
        />
      )}
      <View style={{ height: espacio.l }} />
    </Hoja>
  );
}
