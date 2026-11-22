import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Boton, CabeceraMarca, Campo, Cargando, EstadoVacio, Mensaje, Opcion, Pantalla, s, Seccion, Tarjeta } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { db, MODO_DEMO } from '../datos/demo';
import { salir } from '../lib/auth';
import { listarCarreras, listarPlanes } from '../lib/catalogo';
import type { Carrera, Plan } from '../lib/tipos-db';
import { colores, espacio, fuentes } from '../tema';

const carreras$ = () => (MODO_DEMO ? Promise.resolve(db.carreras) : listarCarreras());
const planes$ = (id: string) => (MODO_DEMO ? Promise.resolve(db.planes.filter((p) => p.carrera_id === id)) : listarPlanes(id));

/** Primera vez: elegir carrera, plan y año de ingreso. */
export default function Onboarding() {
  const { perfil, actualizarPerfil } = useSesion();
  const [carreras, setCarreras] = useState<Carrera[] | null>(null);
  const [planes, setPlanes] = useState<Plan[] | null>(null);
  const [carreraId, setCarreraId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [anio, setAnio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    carreras$().then(setCarreras).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!carreraId) return;
    setPlanes(null);
    setPlanId(null);
    planes$(carreraId)
      .then((ps) => {
        setPlanes(ps);
        const vigente = ps.find((p) => p.vigente);
        if (ps.length === 1 || vigente) setPlanId((vigente ?? ps[0]).id);
      })
      .catch((e) => setError(e.message));
  }, [carreraId]);

  const anioNum = Number(anio);
  const anioValido = !anio || (anioNum >= 1990 && anioNum <= new Date().getFullYear());
  const paso = !carreraId ? 1 : !planId ? 2 : 3;

  const guardar = async () => {
    setGuardando(true);
    const e = await actualizarPerfil({ nombre: nombre.trim() || null, carrera_id: carreraId, plan_id: planId, anio_ingreso: anio ? anioNum : null });
    setGuardando(false);
    setError(e);
  };

  return (
    <Pantalla cabecera={<CabeceraMarca titulo="Contanos qué estudiás" sub="Con esto armamos tu malla y tu progreso" compacta />}>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: espacio.l, marginBottom: espacio.s }} accessibilityLabel={`Paso ${paso} de 3`}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: n <= paso ? colores.marino : colores.linea }} />
        ))}
      </View>

      <Seccion>Tus datos</Seccion>
      <Campo etiqueta="Nombre y apellido" value={nombre} onChangeText={setNombre} autoComplete="name" />
      <Campo etiqueta="Año de ingreso (opcional)" value={anio} onChangeText={setAnio} keyboardType="number-pad" maxLength={4} placeholder={String(new Date().getFullYear())} />
      {!anioValido && <Mensaje texto="Revisá el año de ingreso." />}

      <Seccion>Carrera</Seccion>
      {carreras == null && !error && <Cargando />}
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
          {planes == null && <Cargando />}
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
      <Boton texto="Empezar" icono="arrow-forward" onPress={guardar} cargando={guardando} deshabilitado={!planId || !anioValido} estilo={{ marginTop: espacio.l }} />
      <Boton texto="Cerrar sesión" variante="fantasma" onPress={salir} />
      <Text style={{ fontFamily: fuentes.regular, fontSize: 11, color: colores.textoTenue, textAlign: 'center', marginTop: espacio.m }}>CEQ · FCQ</Text>
    </Pantalla>
  );
}
