import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { InsigniaSemaforo, pct, resumenFirma, semaforoVisible } from '../../components/academico';
import { BarraProgreso } from '../../components/graficos';
import { CabeceraMarca, Cargando, EstadoVacio, Insignia, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { useSesion } from '../../context/SesionProvider';
import { aAsistencia, cargarFirmas, cargarMalla, REGLA_POR_DEFECTO, reglaDe, tieneLab } from '../../datos/academico';
import { usarDatos } from '../../datos/usarDatos';
import { evaluarFirma } from '../../lib/firma';
import { esSeminario } from '../../lib/progreso';
import { colores, coloresEstado, coloresSemaforo, espacio, fondos, fuentes } from '../../tema';
import { finalNecesario } from '../../lib/reglamento-fcq';
import { useTema } from '../../context/TemaProvider';
import { Grilla } from '../../components/disposicion';

async function cargar(planId: string, carreraId?: string | null) {
  const malla = await cargarMalla(planId, carreraId);
  // Las que cursa y las que ya firmó (siguen acá hasta que las marque aprobadas).
  // Los seminarios no tienen firma.
  const estadoDe = (id: string) => malla.estados.get(id)?.estado;
  const materias = malla.materiasDb.filter((m) => (estadoDe(m.id) === 'cursando' || estadoDe(m.id) === 'firmada') && !esSeminario(m.nombre));
  const firmas = await cargarFirmas(materias.map((m) => m.id));
  return materias.map((m) => {
    const f = firmas.get(m.id)!;
    const regla = reglaDe(malla.reglas, m.id);
    const resultado = evaluarFirma({
      regla: regla ?? REGLA_POR_DEFECTO,
      recuperado: f.recuperado,
      tieneLaboratorio: tieneLab(f.evaluacionesDb),
      evaluaciones: f.evaluaciones,
      asistencia: aAsistencia(f.asistencia),
      asistenciaLab: aAsistencia(f.asistenciaLab),
    });
    const firmada = estadoDe(m.id) === 'firmada';
    return { materia: m, resultado, semaforo: semaforoVisible(resultado), cargadas: f.evaluaciones.length, firmada, promedioFirma: malla.estados.get(m.id)?.promedioFirma ?? null };
  });
}

export default function Firma() {
  useTema();
  const { perfil } = useSesion();
  const planId = perfil?.plan_id ?? '';
  const { datos, cargando, error, refrescando, recargar, sinConexion } = usarDatos(() => cargar(planId, perfil?.carrera_id), [planId], { cache: `firmas:${planId}` });
  // Datos guardados en caché por una versión anterior no traen `firmada`.
  const cursando = (datos ?? []).filter((d) => !d.firmada);
  const firmadas = (datos ?? []).filter((d) => d.firmada);


  return (
    <Pantalla
      cabecera={
        <CabeceraMarca titulo="Firma" sub="Cuánto te falta para firmar cada materia" sinConexion={sinConexion && datos ? error : null} />
      }
      refrescando={refrescando}
      onRefrescar={recargar}
    >
      <View style={{ marginTop: -espacio.xl }}>
        {cargando && !datos ? (
          <Tarjeta><Cargando /></Tarjeta>
        ) : error && !datos ? (
          <Tarjeta><EstadoVacio icono="cloud-offline-outline" titulo="No pudimos cargar tus materias" texto={error} accion={{ texto: 'Reintentar', onPress: recargar }} /></Tarjeta>
        ) : datos?.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="calculator-outline"
              titulo="Ninguna materia en curso"
              texto='Marcá tus materias como "Cursando" en Mi carrera y acá vas a ver cuánto te falta para firmar.'
              accion={{ texto: 'Ir a Mi carrera', onPress: () => router.navigate('/carrera') }}
            />
          </Tarjeta>
        ) : (
          <>
            {cursando.length > 0 && <Grilla>{cursando.map(({ materia, resultado, semaforo, cargadas }) => {
              const c = coloresSemaforo[semaforo];
              return (
                <Tarjeta key={materia.id} onPress={() => router.push(`/firma/${materia.id}`)} etiqueta={`${materia.nombre}: ${c.nombre}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.filaTitulo, { fontSize: 17, color: colores.texto }]}>{materia.nombre}</Text>
                      <Text style={[s.filaDetalle, { marginTop: 2 }]}>{cargadas ? resumenFirma(resultado) : 'Todavía no cargaste evaluaciones.'}</Text>
                    </View>
                    <InsigniaSemaforo semaforo={semaforo} firma={resultado.firma} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: espacio.l, marginTop: espacio.m }}>
                    <Medidor titulo="Teoría" valor={resultado.teoria.actual} minimo={resultado.teoria.minimo} />
                    {resultado.laboratorio && <Medidor titulo="Lab." valor={resultado.laboratorio.actual} minimo={resultado.laboratorio.minimo} />}
                    <Medidor titulo="Asistencia" valor={resultado.asistencia.porcentaje} minimo={resultado.asistencia.minimo} />
                  </View>
                </Tarjeta>
              );
            })}</Grilla>}

            {firmadas.length > 0 && (
              <>
                <Seccion icono="ribbon-outline">Con firma</Seccion>
                <Grilla>{firmadas.map(({ materia, promedioFirma }) => {
                  const necesario = promedioFirma != null ? finalNecesario(promedioFirma) : null;
                  return (
                    <Tarjeta key={materia.id} onPress={() => router.push(`/firma/${materia.id}`)} etiqueta={`${materia.nombre}: con firma${promedioFirma != null ? ` de ${pct(promedioFirma)}` : ''}`}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espacio.s }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.filaTitulo, { fontSize: 17, color: colores.texto }]}>{materia.nombre}</Text>
                          <Text style={[s.filaDetalle, { marginTop: 2 }]}>
                            {promedioFirma == null
                              ? 'Ya firmaste. Falta el final.'
                              : necesario == null
                                ? `Firmaste con ${pct(promedioFirma)}.`
                                : `Firmaste con ${pct(promedioFirma)}. Para aprobar necesitás ${pct(necesario)} en el final.`}
                          </Text>
                        </View>
                        <Insignia texto="Firma" icono="ribbon" color={coloresEstado.firmada.texto} fondo={coloresEstado.firmada.fondo} />
                      </View>
                    </Tarjeta>
                  );
                })}</Grilla>
              </>
            )}
          </>
        )}
      </View>

      {cursando.length > 0 && (
        <>
          <Seccion icono="information-circle-outline">Cómo se calcula</Seccion>
          <Tarjeta variante="celeste">
            <View style={{ flexDirection: 'row', gap: espacio.s }}>
              <Ionicons name="information-circle" size={20} color={colores.marino} />
              <Text style={[s.cuerpo, { flex: 1, fontSize: 14 }]}>
                Promediamos tus parciales (todos pesan lo mismo) y tu laboratorio, y lo comparamos con el mínimo de tu plan. Si tu materia no tiene una regla propia, usamos el reglamento general de la FCQ: 50 % en teoría, 60 % en prácticos, 60 % de asistencia a teoría y 100 % de las prácticas.
              </Text>
            </View>
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}

function Medidor({ titulo, valor, minimo }: { titulo: string; valor: number | null; minimo: number }) {
  const ok = valor != null && valor >= minimo;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fuentes.medium, fontSize: 11.5, color: colores.textoSuave }}>{titulo}</Text>
        <Text style={{ fontFamily: fuentes.semibold, fontSize: 11.5, color: valor == null ? colores.textoSuave : ok ? colores.verde : colores.amarillo }}>{pct(valor)}</Text>
      </View>
      <BarraProgreso valor={valor} marca={minimo} color={valor == null ? colores.linea : ok ? colores.verde : colores.amarillo} fondo={fondos.lineaSuave} alto={6} />
    </View>
  );
}
