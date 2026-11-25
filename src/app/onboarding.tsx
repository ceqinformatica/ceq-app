import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, CabeceraMarca, Campo, Cargando, EstadoVacio, Mensaje, Opcion, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { db, MODO_DEMO } from '../datos/demo';
import { salir } from '../lib/auth';
import { listarCarreras, listarPlanes } from '../lib/catalogo';
import type { Carrera, Plan } from '../lib/tipos-db';
import { colores, espacio, fondos, fuentes } from '../tema';
import { useTema } from '../context/TemaProvider';

const carreras$ = () => (MODO_DEMO ? Promise.resolve(db.carreras) : listarCarreras());
const planes$ = (id: string) => (MODO_DEMO ? Promise.resolve(db.planes.filter((p) => p.carrera_id === id)) : listarPlanes(id));

/** Primera vez: elegir carrera, plan y año de ingreso. */
export default function Onboarding() {
  useTema();
  const { perfil, actualizarPerfil } = useSesion();
  const [carreras, setCarreras] = useState<Carrera[] | null>(null);
  const [planes, setPlanes] = useState<Plan[] | null>(null);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [anio, setAnio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errores de carga, aparte del de guardar: cada lista ofrece Reintentar.
  const [errorCarreras, setErrorCarreras] = useState<string | null>(null);
  const [errorPlanes, setErrorPlanes] = useState<string | null>(null);
  const [intentoCarreras, setIntentoCarreras] = useState(0);
  const [intentoPlanes, setIntentoPlanes] = useState(0);

  useEffect(() => {
    let vigente = true;
    setErrorCarreras(null);
    carreras$()
      .then((cs) => vigente && setCarreras(cs))
      .catch((e) => vigente && setErrorCarreras(e?.message ?? 'No pudimos cargar las carreras.'));
    return () => {
      vigente = false;
    };
  }, [intentoCarreras]);

  useEffect(() => {
    if (!carreraId) return;
    // Si elige rápido dos carreras, la respuesta de la primera llega tarde y
    // no debe pisar los planes (ni el plan elegido) de la segunda.
    let vigente = true;
    setPlanes(null);
    setPlanId(null);
    setErrorPlanes(null);
    planes$(carreraId)
      .then((ps) => {
        if (!vigente) return;
        const propios = ps.filter((p) => p.carrera_id === carreraId);
        setPlanes(propios);
        const v = propios.find((p) => p.vigente);
        if (propios.length === 1 || v) setPlanId((v ?? propios[0]).id);
      })
      .catch((e) => vigente && setErrorPlanes(e?.message ?? 'No pudimos cargar los planes.'));
    return () => {
      vigente = false;
    };
  }, [carreraId, intentoPlanes]);

  // El plan elegido tiene que ser de la carrera elegida.
  const planValido = !!planId && !!planes?.some((p) => p.id === planId && p.carrera_id === carreraId);

  const anioNum = Number(anio);
  const anioValido = !anio || (anioNum >= 1990 && anioNum <= new Date().getFullYear());
  const paso = !carreraId ? 1 : !planId ? 2 : 3;

  const guardar = async () => {
    if (!planValido) return;
    setGuardando(true);
    const e = await actualizarPerfil({ nombre: nombre.trim() || null, carrera_id: carreraId, plan_id: planId, anio_ingreso: anio ? anioNum : null });
    setGuardando(false);
    setError(e);
  };

  return (
    <Pantalla cabecera={<CabeceraMarca titulo="Contanos qué estudiás" sub="Con esto armamos tu malla y tu progreso" compacta sinPerfil />}>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: espacio.l, marginBottom: espacio.s }} accessibilityLabel={`Paso ${paso} de 3`}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: n <= paso ? fondos.marino : fondos.linea }} />
        ))}
      </View>

      <Seccion>Tus datos</Seccion>
      <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoComplete="name" />
      <Campo etiqueta="Año de ingreso (opcional)" value={anio} onChangeText={setAnio} keyboardType="number-pad" maxLength={4} placeholder={String(new Date().getFullYear())} />
      {!anioValido && <Mensaje texto="Revisá el año de ingreso." />}

      <Seccion>Carrera</Seccion>
      {carreras == null && !errorCarreras && <Cargando />}
      {errorCarreras && (
        <>
          <Mensaje texto={`No pudimos cargar las carreras: ${errorCarreras}`} />
          <Boton texto="Reintentar" variante="fantasma" compacto icono="refresh" onPress={() => setIntentoCarreras((n) => n + 1)} />
        </>
      )}
      {carreras?.length === 0 && (
        <Tarjeta>
          <EstadoVacio icono="construct-outline" titulo="Carreras en preparación" texto="El CEQ está cargando las carreras. Volvé a entrar en un rato." />
        </Tarjeta>
      )}
      {carreras?.map((c) => (
        <Opcion key={c.id} icono="school-outline" texto={c.nombre} detalle={`${c.semestres} semestres`} elegida={c.id === carreraId} onPress={() => setCarreraId(c.id)} />
      ))}

      {carreraId && (
        <>
          <Seccion>Plan de estudios</Seccion>
          {planes == null && !errorPlanes && <Cargando />}
          {errorPlanes && (
            <>
              <Mensaje texto={`No pudimos cargar los planes: ${errorPlanes}`} />
              <Boton texto="Reintentar" variante="fantasma" compacto icono="refresh" onPress={() => setIntentoPlanes((n) => n + 1)} />
            </>
          )}
          {planes?.length === 0 && <Text style={s.filaDetalle}>Esta carrera todavía no tiene planes cargados.</Text>}
          {planes?.map((p) => (
            <Opcion key={p.id} icono="git-network-outline" texto={p.nombre} detalle={[p.anio ? `Desde ${p.anio}` : null, p.vigente ? 'Vigente' : null].filter(Boolean).join(' · ') || undefined} elegida={p.id === planId} onPress={() => setPlanId(p.id)} />
          ))}
          <Text style={[s.filaDetalle, { marginBottom: espacio.s }]}>
            ¿No sabés cuál es tu plan? Fijate en tu año de ingreso o preguntá en el CEQ. Lo podés cambiar después desde tu perfil.
          </Text>
        </>
      )}

      <Mensaje texto={error} />
      <Boton texto="Empezar" icono="arrow-forward" onPress={guardar} cargando={guardando} deshabilitado={!planValido || !anioValido} estilo={{ marginTop: espacio.l }} />
      <Boton texto="Cerrar sesión" variante="fantasma" onPress={async () => setError(await salir())} />
      <Text style={{ fontFamily: fuentes.regular, fontSize: 11, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.m }}>CEQ · FCQ</Text>
    </Pantalla>
  );
}
