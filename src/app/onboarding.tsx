import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Boton, Campo, Mensaje, Opcion, Pantalla, Tarjeta, Titulo, s } from '../components/ui';
import { useSesion } from '../context/SesionProvider';
import { salir } from '../lib/auth';
import { listarCarreras, listarPlanes } from '../lib/catalogo';
import type { Carrera, Plan } from '../lib/tipos-db';
import { colores } from '../tema';

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
    listarCarreras().then(setCarreras).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!carreraId) return;
    setPlanes(null);
    setPlanId(null);
    listarPlanes(carreraId)
      .then((ps) => {
        setPlanes(ps);
        const vigente = ps.find((p) => p.vigente);
        if (ps.length === 1 || vigente) setPlanId((vigente ?? ps[0]).id);
      })
      .catch((e) => setError(e.message));
  }, [carreraId]);

  const anioNum = Number(anio);
  const anioValido = !anio || (anioNum >= 1990 && anioNum <= new Date().getFullYear());

  const guardar = async () => {
    setGuardando(true);
    const e = await actualizarPerfil({ nombre: nombre.trim() || null, carrera_id: carreraId, plan_id: planId, anio_ingreso: anio ? anioNum : null });
    setGuardando(false);
    setError(e);
  };

  return (
    <Pantalla>
      <Titulo sub="Con esto armamos tu malla y tu progreso">Contanos qué estudiás</Titulo>

      <Campo etiqueta="Tu nombre" value={nombre} onChangeText={setNombre} />

      <Text style={s.seccion}>Carrera</Text>
      {carreras == null && !error && <ActivityIndicator color={colores.primario} />}
      {carreras?.length === 0 && (
        <Tarjeta>
          <Text style={{ color: colores.textoSuave }}>Todavía no hay carreras cargadas. El CEQ las está preparando.</Text>
        </Tarjeta>
      )}
      {carreras?.map((c) => (
        <Opcion key={c.id} texto={c.nombre} detalle={`${c.semestres} semestres`} elegida={c.id === carreraId} onPress={() => setCarreraId(c.id)} />
      ))}

      {carreraId && (
        <>
          <Text style={s.seccion}>Plan de estudios</Text>
          {planes == null && <ActivityIndicator color={colores.primario} />}
          {planes?.map((p) => (
            <Opcion key={p.id} texto={p.nombre} detalle={p.vigente ? 'Vigente' : undefined} elegida={p.id === planId} onPress={() => setPlanId(p.id)} />
          ))}
        </>
      )}

      <Campo etiqueta="Año de ingreso (opcional)" value={anio} onChangeText={setAnio} keyboardType="number-pad" maxLength={4} />
      {!anioValido && <Mensaje texto="Revisá el año de ingreso." />}

      <Mensaje texto={error} />
      <Boton texto="Continuar" onPress={guardar} cargando={guardando} deshabilitado={!planId || !anioValido} />
      <Boton texto="Cerrar sesión" variante="secundario" onPress={salir} />
    </Pantalla>
  );
}
