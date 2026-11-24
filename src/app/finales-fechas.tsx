import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AvisoSinConexion, BarraSuperior, Boton, Cargando, EstadoVacio, Insignia, Mensaje, Pantalla, s, Segmentado, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { useTema } from '../context/TemaProvider';
import { agregarFinalesAAgenda, cargarMisFinales, estaEnAgenda, fechaHoraFinal, urlPdfHorario, type FinalOficial } from '../datos/finales-oficiales';
import { usarDatos } from '../datos/usarDatos';
import { textoError } from '../lib/errores';
import { textoLlamado } from '../lib/horario-finales';
import { colores, espacio, fondos, fuentes, radio } from '../tema';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/agenda'));
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fechas de finales que publicó el CEQ, con las materias que te faltan primero. */
export default function FechasDeFinales() {
  useTema();
  const { perfil } = useSesion();
  const { datos, cargando, error, refrescando, recargar, sinConexion } = usarDatos(
    () => cargarMisFinales(perfil?.carrera_id, perfil?.plan_id),
    [perfil?.carrera_id, perfil?.plan_id],
    { cache: perfil?.carrera_id ? `finales-oficiales:${perfil.carrera_id}` : null },
  );
  const [ver, setVer] = useState<'mias' | 'todas'>('mias');
  const [agregando, setAgregando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const tuyas = useMemo(() => (datos?.fechas ?? []).filter((f) => f.tuya), [datos]);
  const lista = ver === 'mias' ? tuyas : datos?.fechas ?? [];
  const porLlamado = useMemo(() => {
    const grupos = new Map<number, FinalOficial[]>();
    for (const f of lista) grupos.set(f.llamado, [...(grupos.get(f.llamado) ?? []), f]);
    return [...grupos.entries()].sort((a, b) => a[0] - b[0]);
  }, [lista]);
  const faltan = tuyas.filter((f) => datos && !estaEnAgenda(f, datos.enAgenda));
  const horario = datos?.horarios[0];

  const agregar = async () => {
    if (!datos) return;
    setAgregando(true);
    setAviso(null);
    try {
      const n = await agregarFinalesAAgenda(faltan, datos.enAgenda);
      setAviso({ tipo: 'exito', texto: n === 1 ? 'Listo: agregamos 1 final a tu agenda. Te avisamos un día antes.' : `Listo: agregamos ${n} finales a tu agenda. Te avisamos un día antes de cada uno.` });
      await recargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: textoError(e, 'No se pudieron agregar.') });
    } finally {
      setAgregando(false);
    }
  };

  const abrirPdf = async () => {
    const url = await urlPdfHorario(horario?.pdf_path ?? null);
    if (url) await WebBrowser.openBrowserAsync(url);
    else setAviso({ tipo: 'error', texto: 'No se pudo abrir el PDF. Probá de nuevo con internet.' });
  };

  return (
    <Pantalla refrescando={refrescando} onRefrescar={recargar}>
      <BarraSuperior titulo="Fechas de finales" onVolver={volver} />
      <AvisoSinConexion texto={sinConexion && datos ? error : null} />
      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.fechas.length ? (
        <EstadoVacio
          icono="school-outline"
          titulo={error ? 'No pudimos cargar las fechas' : 'Todavía no hay fechas de finales'}
          texto={error ?? 'Cuando la Dirección Académica publique el horario de finales de tu carrera, el CEQ lo carga y te llega una notificación.'}
          accion={error ? { texto: 'Reintentar', onPress: recargar } : undefined}
        />
      ) : (
        <>
          {horario && (
            <Tarjeta variante="celeste">
              <Text style={s.filaTitulo}>{horario.titulo}</Text>
              <Text style={[s.filaDetalle, { marginTop: 2 }]}>
                Publicado por el CEQ. Las fechas pueden cambiar: ante cualquier duda, mirá el PDF oficial.
              </Text>
              {horario.pdf_path ? <Boton texto="Ver PDF oficial" icono="document-text-outline" variante="secundario" compacto onPress={abrirPdf} estilo={{ marginTop: espacio.m, alignSelf: 'flex-start' }} /> : null}
            </Tarjeta>
          )}

          <Segmentado
            opciones={[{ valor: 'mias', texto: `Mis materias (${new Set(tuyas.map((f) => f.materia)).size})` }, { valor: 'todas', texto: 'Toda la carrera' }]}
            valor={ver}
            onCambio={setVer}
          />
          <View style={{ height: espacio.m }} />

          {ver === 'mias' && tuyas.length > 0 && (
            faltan.length ? (
              <Boton texto={`Agregar ${faltan.length === 1 ? 'el final' : `los ${faltan.length} finales`} a mi agenda`} icono="calendar" onPress={agregar} cargando={agregando} estilo={{ marginBottom: espacio.m }} />
            ) : (
              <Mensaje tipo="exito" texto="Todos tus finales ya están en tu agenda." />
            )
          )}
          <Mensaje tipo={aviso?.tipo ?? 'error'} texto={aviso?.texto ?? null} />

          {ver === 'mias' && !tuyas.length ? (
            <Tarjeta>
              <EstadoVacio
                icono="checkmark-done-outline"
                titulo="No hay finales de tus materias"
                texto="Mostramos las materias que estás cursando o que firmaste y te falta aprobar. Marcalas en Mi carrera, o mirá toda la carrera."
                accion={{ texto: 'Ver toda la carrera', onPress: () => setVer('todas') }}
              />
            </Tarjeta>
          ) : (
            porLlamado.map(([llamado, filas]) => (
              <View key={llamado}>
                <Seccion>{textoLlamado(llamado)}</Seccion>
                <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
                  {filas.map((f, i) => <FilaFinal key={f.id} f={f} ultima={i === filas.length - 1} enAgenda={estaEnAgenda(f, datos.enAgenda)} />)}
                </Tarjeta>
              </View>
            ))
          )}
        </>
      )}
    </Pantalla>
  );
}

function FilaFinal({ f, ultima, enAgenda }: { f: FinalOficial; ultima: boolean; enAgenda: boolean }) {
  const d = fechaHoraFinal(f);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.m, borderBottomWidth: ultima ? 0 : 1, borderBottomColor: colores.linea }}>
      <View style={{ width: 52, alignItems: 'center', paddingVertical: espacio.xs, borderRadius: radio.m, backgroundColor: fondos.tarjeta }}>
        <Text style={{ fontFamily: fuentes.medium, fontSize: 11, color: colores.textoSuave }}>{DIAS[d.getDay()]}</Text>
        <Text style={{ fontFamily: fuentes.bold, fontSize: 19, color: colores.marino, lineHeight: 22 }}>{d.getDate()}</Text>
        <Text style={{ fontFamily: fuentes.medium, fontSize: 11, color: colores.textoSuave }}>{MESES[d.getMonth()]}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.filaTitulo}>{f.materia}</Text>
        <Text style={[s.filaDetalle, { marginTop: 2 }]}>
          {[f.hora ? `${f.hora.slice(0, 5)} h` : 'Hora a confirmar', f.aula].filter(Boolean).join(' · ')}
        </Text>
        {(f.tuya || enAgenda) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.xs, marginTop: espacio.xs }}>
            {f.estado === 'firmada' && <Insignia texto="Firmada" />}
            {f.estado === 'cursando' && <Insignia texto="Cursando" />}
            {enAgenda && <Insignia texto="En tu agenda" icono="calendar-outline" />}
          </View>
        )}
      </View>
      {enAgenda ? <Ionicons name="notifications-outline" size={18} color={colores.textoSuave} accessibilityLabel="Con recordatorio" /> : null}
    </View>
  );
}
