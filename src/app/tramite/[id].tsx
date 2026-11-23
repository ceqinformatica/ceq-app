import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';
import { AvisoSinConexion, BarraSuperior, Boton, Cargando, EstadoVacio, Fila, Insignia, Pantalla, s, Seccion, Tarjeta } from '../../components/ui';
import { cargarTramite } from '../../datos/tramites';
import { usarDatos } from '../../datos/usarDatos';
import { esHttps, TEXTO_MODALIDAD } from '../../lib/tramites';
import { colores, crearEstilos, espacio, fondos, fuentes, texto } from '../../tema';
import { useTema } from '../../context/TemaProvider';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/tramites'));

export default function Tramite() {
  useTema();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { datos: t, cargando, error, sinConexion } = usarDatos(() => cargarTramite(id ?? ''), [id], { cache: `tramite:${id}` });

  if (cargando && !t) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Trámite" onVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }
  if (!t) {
    return (
      <Pantalla>
        <BarraSuperior titulo="Trámite" onVolver={volver} />
        <EstadoVacio icono="document-text-outline" titulo="Este trámite ya no está disponible" texto={error ?? undefined} />
      </Pantalla>
    );
  }

  const datosUtiles: { icono: 'location-outline' | 'calendar-outline' | 'cash-outline' | 'mail-outline'; titulo: string; valor: string | null }[] = [
    { icono: 'calendar-outline', titulo: 'Plazo', valor: t.plazo },
    { icono: 'location-outline', titulo: 'Dónde', valor: t.donde },
    { icono: 'cash-outline', titulo: 'Costo', valor: t.costo },
    { icono: 'mail-outline', titulo: 'Contacto', valor: t.contacto },
  ];
  const visibles = datosUtiles.filter((d) => d.valor);

  return (
    <Pantalla>
      <BarraSuperior titulo="Trámite" onVolver={volver} />
      <AvisoSinConexion texto={sinConexion && t ? error : null} />
      <Text style={est.categoria}>{t.categoria}</Text>
      <Text style={[texto.titulo, { color: colores.marino, marginTop: espacio.xs, marginBottom: espacio.s }]} accessibilityRole="header">{t.nombre}</Text>
      {t.modalidad && (
        <View style={{ flexDirection: 'row', marginBottom: espacio.m }}>
          <Insignia texto={TEXTO_MODALIDAD[t.modalidad]} icono={t.modalidad === 'etramite' ? 'globe-outline' : 'business-outline'} />
        </View>
      )}
      {t.descripcion ? <Text style={[s.cuerpo, { marginBottom: espacio.m }]} selectable>{t.descripcion}</Text> : null}

      {visibles.length > 0 && (
        <Tarjeta variante="celeste" estilo={{ paddingVertical: espacio.xs }}>
          {visibles.map((d, i) => (
            <View key={d.titulo} style={[est.dato, i < visibles.length - 1 && est.datoLinea]}>
              <Ionicons name={d.icono} size={19} color={colores.marino} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.filaTitulo}>{d.titulo}</Text>
                <Text style={[s.filaDetalle, { color: colores.texto }]} selectable>{d.valor}</Text>
              </View>
            </View>
          ))}
        </Tarjeta>
      )}

      {t.requisitos.length > 0 && (
        <>
          <Seccion>Qué necesitás</Seccion>
          <Tarjeta>
            {t.requisitos.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: espacio.s, marginBottom: i < t.requisitos.length - 1 ? espacio.s : 0 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colores.verde} style={{ marginTop: 2 }} />
                <Text style={[s.cuerpo, { flex: 1 }]} selectable>{r}</Text>
              </View>
            ))}
          </Tarjeta>
        </>
      )}

      {t.pasos.length > 0 && (
        <>
          <Seccion>Paso a paso</Seccion>
          {t.pasos.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: espacio.m, marginBottom: espacio.m }}>
              <View style={est.paso}><Text style={est.pasoNumero}>{i + 1}</Text></View>
              <Text style={[s.cuerpo, { flex: 1, paddingTop: 3 }]} selectable>{p}</Text>
            </View>
          ))}
        </>
      )}

      {esHttps(t.formulario_url) ? (
        <Boton texto={t.modalidad === 'etramite' ? 'Ir a e-Trámite' : 'Descargar formulario'} icono="download-outline" onPress={() => WebBrowser.openBrowserAsync(t.formulario_url!.trim())} estilo={{ marginTop: espacio.s }} />
      ) : null}
      {esHttps(t.fuente_url) ? (
        <Tarjeta variante="borde" estilo={{ marginTop: espacio.m, paddingVertical: espacio.xs }}>
          <Fila icono="link-outline" titulo="Ver la fuente oficial" detalle="Página de la FCQ de donde salió esta información" onPress={() => WebBrowser.openBrowserAsync(t.fuente_url!.trim())} ultima />
        </Tarjeta>
      ) : null}
      <Text style={[s.filaDetalle, { marginTop: espacio.l, marginBottom: espacio.xl }]}>
        Las fechas y aranceles pueden cambiar. Ante la duda, confirmá en la Mesa de Entrada o la Dirección Académica.
      </Text>
    </Pantalla>
  );
}

const est = crearEstilos(() => ({
  categoria: { fontFamily: fuentes.semibold, fontSize: 12, color: colores.azul, letterSpacing: 0.6, textTransform: 'uppercase' },
  dato: { flexDirection: 'row', gap: espacio.m, paddingVertical: espacio.m },
  datoLinea: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.linea },
  paso: { width: 28, height: 28, borderRadius: 14, backgroundColor: fondos.marino, alignItems: 'center', justifyContent: 'center' },
  pasoNumero: { fontFamily: fuentes.bold, fontSize: 13, color: colores.blanco },
}));
