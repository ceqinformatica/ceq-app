import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { BarraSuperior, Boton, Campo, Cargando, Dato, EstadoVacio, Fila, Hoja, Insignia, Mensaje, Pantalla, s, Segmentado, Tarjeta } from '../../components/ui';
import { cargarEstudiantes } from '../../datos/admin';
import { usarDatos } from '../../datos/usarDatos';
import { formatearCi, normalizarCi } from '../../lib/carnet';
import { describirCuando } from '../../lib/programacion';
import type { EstudianteRegistrado } from '../../lib/tipos-db';
import { colores, crearEstilos, espacio, fondos } from '../../tema';
import { useTema } from '../../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/admin'));

type Filtro = 'todos' | 'nuevos' | 'sin_carrera' | 'socios';

/** De a cuántos se muestran, para que la lista no se trabe con cientos de cuentas. */
const PAGINA = 60;
const SEMANA = 7 * 86400000;

const nombreDe = (e: EstudianteRegistrado) => e.nombre?.trim() || e.correo || 'Sin nombre';
const fecha = (iso: string) => {
  const f = new Date(iso);
  return `${f.getDate()}/${f.getMonth() + 1}/${f.getFullYear()}`;
};

/** Todas las cuentas registradas en la app. Solo para admins: la base rechaza a cualquier otra cuenta. */
export default function EstudiantesAdmin() {
  useTema();
  const { datos, cargando, error, refrescando, recargar } = usarDatos(cargarEstudiantes, []);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [cuantos, setCuantos] = useState(PAGINA);
  const [elegido, setElegido] = useState<EstudianteRegistrado | null>(null);

  // Se toma una vez al abrir la pantalla: alcanza para "registrados esta semana".
  const [ahora] = useState(() => Date.now());
  const todos = useMemo(() => datos ?? [], [datos]);
  const esNuevo = useCallback((e: EstudianteRegistrado) => ahora - new Date(e.registrado_en).getTime() < SEMANA, [ahora]);
  const nuevos = todos.filter(esNuevo).length;
  const socios = todos.filter((e) => e.socio_vigente).length;

  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const ci = normalizarCi(t);
    return todos.filter((e) => {
      if (filtro === 'nuevos' && !esNuevo(e)) return false;
      if (filtro === 'sin_carrera' && e.carrera) return false;
      if (filtro === 'socios' && !e.socio_vigente) return false;
      if (!t) return true;
      return [e.nombre, e.correo, e.carrera].some((v) => (v ?? '').toLowerCase().includes(t)) || (!!ci && (e.ci ?? '').includes(ci));
    });
  }, [todos, busqueda, filtro, esNuevo]);

  const cambiarFiltro = (f: Filtro) => {
    setFiltro(f);
    setCuantos(PAGINA);
  };
  const buscar = (t: string) => {
    setBusqueda(t);
    setCuantos(PAGINA);
  };

  return (
    <View style={{ flex: 1 }}>
      <Pantalla refrescando={refrescando} onRefrescar={recargar}>
        <BarraSuperior titulo="Estudiantes registrados" onVolver={volver} />
        <Text style={[s.filaDetalle, { marginBottom: espacio.m }]}>
          Todas las cuentas que entraron a la app. Solo lo ven las cuentas de administración.
        </Text>
        {datos && (
          <Tarjeta>
            <View style={{ flexDirection: 'row', gap: espacio.m }}>
              <Dato valor={String(todos.length)} etiqueta="Registrados" />
              <Dato valor={String(nuevos)} etiqueta="Esta semana" color={colores.azul} />
              <Dato valor={String(socios)} etiqueta="Socios al día" color={colores.verde} />
            </View>
          </Tarjeta>
        )}
        <Campo etiqueta="Buscar" value={busqueda} onChangeText={buscar} placeholder="Nombre, correo, C.I. o carrera" autoCorrect={false} autoCapitalize="none" limpiable />
        <Segmentado<Filtro>
          opciones={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'nuevos', texto: 'Nuevos' },
            { valor: 'sin_carrera', texto: 'Sin carrera' },
            { valor: 'socios', texto: 'Socios' },
          ]}
          valor={filtro}
          onCambio={cambiarFiltro}
        />
        <View style={{ height: espacio.m }} />
        <Mensaje texto={datos ? error : null} />
        {cargando && !datos ? (
          <Cargando />
        ) : !todos.length ? (
          <EstadoVacio
            icono="people-outline"
            titulo={error ? 'No pudimos cargar la lista' : 'Todavía no hay cuentas'}
            texto={error ?? 'Cuando alguien entre a la app por primera vez, aparece acá.'}
            accion={error ? { texto: 'Reintentar', onPress: recargar } : undefined}
          />
        ) : !lista.length ? (
          <EstadoVacio icono="search-outline" titulo="No encontramos a nadie" texto="Probá con otro nombre, correo o filtro." />
        ) : (
          <>
            <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
              {lista.length === todos.length ? `${lista.length} ${lista.length === 1 ? 'cuenta' : 'cuentas'}, de la más nueva a la más vieja` : `${lista.length} de ${todos.length}`}
            </Text>
            <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
              {lista.slice(0, cuantos).map((e, i, arr) => (
                <Fila
                  key={e.id}
                  icono={e.rol === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
                  titulo={nombreDe(e)}
                  detalle={[e.carrera ?? 'Sin carrera elegida', `desde el ${fecha(e.registrado_en)}`].join(' · ')}
                  derecha={e.socio_vigente ? <Insignia texto="Socio" color={colores.verde} fondo={fondos.verdeFondo} /> : undefined}
                  onPress={() => setElegido(e)}
                  ultima={i === arr.length - 1}
                />
              ))}
            </Tarjeta>
            {lista.length > cuantos && (
              <Boton texto={`Ver ${Math.min(PAGINA, lista.length - cuantos)} más`} variante="fantasma" icono="chevron-down" onPress={() => setCuantos(cuantos + PAGINA)} />
            )}
          </>
        )}
        <View style={{ height: espacio.xl }} />
      </Pantalla>
      <Detalle e={elegido} onCerrar={() => setElegido(null)} />
    </View>
  );
}

const ROLES: Record<EstudianteRegistrado['rol'], string> = { estudiante: 'Estudiante', validador: 'Valida carnets', admin: 'Administración' };

function Detalle({ e, onCerrar }: { e: EstudianteRegistrado | null; onCerrar: () => void }) {
  const filas: [string, string][] = e
    ? [
        ['Correo', e.correo ?? '—'],
        ['C.I.', e.ci ? formatearCi(e.ci) : 'No la cargó'],
        ['Carrera', e.carrera ?? 'Todavía no eligió'],
        ['Plan', e.plan ?? '—'],
        ['Año de ingreso', e.anio_ingreso ? String(e.anio_ingreso) : '—'],
        ['Cuenta', ROLES[e.rol] ?? e.rol],
        ['Carnet del CEQ', e.socio_vigente ? 'Socio al día' : 'Sin carnet vigente'],
        ['Se registró', fecha(e.registrado_en)],
        ['Último ingreso', e.ultimo_ingreso ? describirCuando(e.ultimo_ingreso) : '—'],
      ]
    : [];
  return (
    <Hoja visible={!!e} titulo={e ? nombreDe(e) : ''} onCerrar={onCerrar}>
      <Tarjeta estilo={{ paddingVertical: espacio.xs }}>
        {filas.map(([k, v], i) => (
          <View key={k} style={[est.dato, i === filas.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={[s.filaDetalle, { flex: 1 }]}>{k}</Text>
            <Text style={[s.cuerpo, est.valor]} selectable>{v}</Text>
          </View>
        ))}
      </Tarjeta>
      <Boton texto="Cerrar" variante="secundario" onPress={onCerrar} />
    </Hoja>
  );
}

const est = crearEstilos(() => ({
  dato: { flexDirection: 'row', alignItems: 'center', gap: espacio.m, paddingVertical: espacio.s + 2, borderBottomWidth: 1, borderBottomColor: colores.linea },
  valor: { flex: 1.6, textAlign: 'right', color: colores.marino },
}));
