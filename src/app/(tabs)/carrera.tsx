import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FichaMateria, LeyendaMalla, nombreSemestre, nota, type EstadoVisual } from '../../components/academico';
import { AnilloProgreso, BarraProgreso } from '../../components/graficos';
import { CabeceraMarca, Cargando, Chip, Dato, EstadoVacio, Mensaje, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { cargarMalla } from '../../datos/academico';
import { usarDatos } from '../../datos/usarDatos';
import { calcularProgreso, promedioGeneral, requisitosFaltantes } from '../../lib/progreso';
import { colores, espacio, fuentes } from '../../tema';

type Filtro = 'todas' | 'disponibles' | 'cursando' | 'aprobadas';
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'disponibles', texto: 'Puedo cursar' },
  { valor: 'cursando', texto: 'Cursando' },
  { valor: 'aprobadas', texto: 'Aprobadas' },
];

export default function Carrera() {
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos: malla, cargando, error, refrescando, recargar } = usarDatos(() => cargarMalla(planId, perfil?.carrera_id), [planId, perfil?.carrera_id]);
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const vista = useMemo(() => {
    if (!malla) return null;
    const progreso = calcularProgreso(malla.materias, malla.grupos, malla.estados, malla.unidad);
    const promedio = promedioGeneral(malla.materias, malla.estados);
    const cursando = malla.materias.filter((m) => malla.estados.get(m.id)?.estado === 'cursando').length;
    const estadoDe = (id: string): { estado: EstadoVisual; faltan: number } => {
      const e = malla.estados.get(id)?.estado ?? 'pendiente';
      if (e !== 'pendiente') return { estado: e, faltan: 0 };
      const faltan = requisitosFaltantes(id, malla.prerrequisitos, malla.estados).length;
      return { estado: faltan ? 'bloqueada' : 'pendiente', faltan };
    };
    const semestres = new Map<number, typeof malla.materiasDb>();
    for (const m of malla.materiasDb) {
      const { estado } = estadoDe(m.id);
      const pasa =
        filtro === 'todas' ||
        (filtro === 'disponibles' && estado === 'pendiente') ||
        (filtro === 'cursando' && estado === 'cursando') ||
        (filtro === 'aprobadas' && estado === 'aprobada');
      if (!pasa) continue;
      semestres.set(m.semestre, [...(semestres.get(m.semestre) ?? []), m]);
    }
    return { progreso, promedio, cursando, estadoDe, semestres: [...semestres.entries()].sort((a, b) => a[0] - b[0]) };
  }, [malla, filtro]);

  const sub = [malla?.carrera, malla?.plan?.nombre].filter(Boolean).join(' · ') || 'Tu malla y tu avance';

  return (
    <Pantalla cabecera={<CabeceraMarca titulo="Mi carrera" sub={sub} />} refrescando={refrescando} onRefrescar={recargar}>
      {cargando && !malla ? (
        <Tarjeta estilo={{ marginTop: -espacio.xxl }}><Cargando texto="Cargando tu malla…" /></Tarjeta>
      ) : error && !malla ? (
        <Tarjeta estilo={{ marginTop: -espacio.xxl }}>
          <EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tu malla" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} />
        </Tarjeta>
      ) : malla && vista && malla.materias.length === 0 ? (
        <Tarjeta estilo={{ marginTop: -espacio.xxl }}>
          <EstadoVacio icono="construct-outline" titulo="Malla en preparación" texto="El CEQ todavía está cargando las materias de tu plan. Volvé a mirar pronto." />
        </Tarjeta>
      ) : malla && vista ? (
        <>
          <Tarjeta estilo={{ marginTop: -espacio.xxl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.l }}>
              <AnilloProgreso porcentaje={vista.progreso.porcentaje} tamano={112} etiqueta="de la carrera" />
              <View style={{ flex: 1, gap: espacio.m }}>
                <View style={{ flexDirection: 'row' }}>
                  <Dato valor={`${vista.progreso.obligatoriasAprobadas}/${vista.progreso.obligatoriasTotales}`} etiqueta="Obligatorias" />
                  <Dato valor={nota(vista.promedio)} etiqueta="Promedio" />
                </View>
                <View style={{ flexDirection: 'row' }}>
                  <Dato valor={String(vista.cursando)} etiqueta="Cursando" color={colores.amarillo} />
                  <Dato
                    valor={vista.progreso.optativas.reduce((a, o) => a + Math.min(o.aprobadas, o.exigidas), 0) + '/' + vista.progreso.optativas.reduce((a, o) => a + o.exigidas, 0)}
                    etiqueta="Optativas"
                  />
                </View>
              </View>
            </View>
          </Tarjeta>

          {vista.progreso.optativas.length > 0 && (
            <Tarjeta variante="celeste">
              {vista.progreso.optativas.map((o) => (
                <View key={o.grupo.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[s.filaTitulo, { color: colores.marino }]}>{o.grupo.nombre}</Text>
                    <Text style={s.filaDetalle}>{Math.min(o.aprobadas, o.exigidas)} de {o.exigidas}</Text>
                  </View>
                  <BarraProgreso valor={(Math.min(o.aprobadas, o.exigidas) / Math.max(1, o.exigidas)) * 100} fondo={colores.blanco} />
                </View>
              ))}
            </Tarjeta>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s, marginTop: espacio.s, marginBottom: espacio.m }}>
            {FILTROS.map((f) => (
              <Chip key={f.valor} texto={f.texto} elegido={filtro === f.valor} onPress={() => setFiltro(f.valor)} />
            ))}
          </View>
          <LeyendaMalla />
          {error && <Mensaje texto={error} />}

          {vista.semestres.length === 0 && (
            <EstadoVacio icono="filter-outline" titulo="Nada por acá" texto="No hay materias con este filtro." />
          )}

          {vista.semestres.map(([sem, materias]) => {
            const aprobadas = materias.filter((m) => malla.estados.get(m.id)?.estado === 'aprobada').length;
            const filas: (typeof materias)[] = [];
            for (let i = 0; i < materias.length; i += 2) filas.push(materias.slice(i, i + 2));
            return (
              <View key={sem} style={{ marginBottom: espacio.s }}>
                <Seccion>
                  {nombreSemestre(sem)}
                  <Text style={{ fontFamily: fuentes.regular, fontSize: 13, color: colores.textoSuave }}>{'   '}{aprobadas}/{materias.length} aprobadas</Text>
                </Seccion>
                {filas.map((fila, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: espacio.s, marginBottom: espacio.s }}>
                    {fila.map((m) => {
                      const { estado, faltan } = vista.estadoDe(m.id);
                      return (
                        <FichaMateria
                          key={m.id}
                          nombre={m.nombre}
                          codigo={m.grupo_optativa_id ? 'OPTATIVA' : m.codigo}
                          estado={estado}
                          faltan={faltan}
                          notaFinal={malla.estados.get(m.id)?.notaFinal}
                          onPress={() => router.push(`/materia/${m.id}`)}
                        />
                      );
                    })}
                    {fila.length === 1 && <View style={{ flex: 1 }} />}
                  </View>
                ))}
              </View>
            );
          })}
        </>
      ) : null}
    </Pantalla>
  );
}
