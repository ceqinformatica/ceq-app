import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { contenidoQr, estadoCarnet, fechaCorta, formatearCi } from '../lib/carnet';
import type { SocioDb } from '../lib/tipos-db';
import { colores, espacio, fuentes, radio, sombras } from '../tema';
import { TramaHex } from './graficos';
import { logoCeq } from './ui';

const ESTADO = {
  vigente: { texto: 'VIGENTE', fondo: 'rgba(95, 211, 141, 0.2)', punto: '#5FD38D', color: '#B8F0CD' },
  vencido: { texto: 'VENCIDO', fondo: 'rgba(255, 122, 110, 0.22)', punto: '#FF7A6E', color: '#FFC2BC' },
  inactivo: { texto: 'DE BAJA', fondo: 'rgba(255, 122, 110, 0.22)', punto: '#FF7A6E', color: '#FFC2BC' },
};

/** Carnet de socio del CEQ: marino con la trama de hexágonos, como credencial. */
export function Carnet({ socio, carrera, conQr = false, foto }: { socio: SocioDb; carrera?: string | null; conQr?: boolean; foto?: string | null }) {
  const [ancho, setAncho] = useState(0);
  const estado = estadoCarnet(socio);
  const marca = ESTADO[estado];
  const vigente = estado === 'vigente';
  return (
    <View style={[est.carnet, sombras.fuerte]} onLayout={(e) => setAncho(e.nativeEvent.layout.width)} accessibilityLabel={`Carnet de socio de ${socio.nombre}, número ${socio.numero_socio ?? 'sin asignar'}, ${marca.texto.toLowerCase()}`}>
      {ancho > 0 && <TramaHex ancho={ancho} alto={conQr ? 560 : 250} opacidad={0.09} tam={40} />}
      <View style={est.fila}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
          <View style={est.logo}><Image source={logoCeq} style={{ width: 30, height: 30 }} /></View>
          <View>
            <Text style={est.marca}>CEQ</Text>
            <Text style={est.marcaSub}>Centro de Estudiantes de Química</Text>
          </View>
        </View>
        <View style={[est.estado, { backgroundColor: marca.fondo }]}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: marca.punto }} />
          <Text style={[est.estadoTexto, { color: marca.color }]}>{marca.texto}</Text>
        </View>
      </View>

      {conQr && (
        <View style={[est.qr, !vigente && { opacity: 0.35 }]}>
          <QRCode value={contenidoQr(socio.codigo_qr)} size={190} color={colores.marinoProfundo} backgroundColor={colores.blanco} />
        </View>
      )}

      <View style={{ marginTop: conQr ? espacio.l : espacio.xl, flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
        {foto ? <Image source={{ uri: foto }} style={est.foto} accessibilityLabel={`Foto de ${socio.nombre}`} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={est.etiqueta}>SOCIO</Text>
          <Text style={est.nombre} numberOfLines={2}>{socio.nombre}</Text>
          {carrera ? <Text style={est.carrera} numberOfLines={1}>{carrera}</Text> : null}
        </View>
      </View>
      <View style={[est.fila, { marginTop: espacio.m }]}>
        <Dato etiqueta="N.º DE SOCIO" valor={socio.numero_socio ?? '—'} />
        <Dato etiqueta="C.I." valor={formatearCi(socio.ci)} />
        <Dato etiqueta="VENCE" valor={socio.vigente_hasta ? fechaCorta(socio.vigente_hasta) : 'Sin venc.'} />
        {!conQr && <Ionicons name="qr-code" size={30} color={colores.blanco} style={{ opacity: 0.9 }} />}
      </View>
    </View>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View>
      <Text style={est.etiqueta}>{etiqueta}</Text>
      <Text style={est.valor}>{valor}</Text>
    </View>
  );
}

const est = StyleSheet.create({
  carnet: { backgroundColor: colores.marinoProfundo, borderRadius: radio.xl, padding: espacio.l + 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(127, 178, 240, 0.25)' },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 40, height: 40, borderRadius: 11, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  marca: { fontFamily: fuentes.bold, fontSize: 17, color: colores.blanco, letterSpacing: 1.5 },
  marcaSub: { fontFamily: fuentes.regular, fontSize: 10.5, color: colores.celeste },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radio.pill },
  estadoTexto: { fontFamily: fuentes.bold, fontSize: 10, letterSpacing: 1 },
  qr: { alignSelf: 'center', backgroundColor: colores.blanco, padding: espacio.m, borderRadius: radio.l, marginTop: espacio.xl },
  etiqueta: { fontFamily: fuentes.semibold, fontSize: 9.5, letterSpacing: 1.2, color: colores.celesteVivo },
  nombre: { fontFamily: fuentes.bold, fontSize: 21, color: colores.blanco, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  foto: { width: 64, height: 80, borderRadius: radio.m, borderWidth: 2, borderColor: colores.blanco, backgroundColor: colores.marino },
  carrera: { fontFamily: fuentes.regular, fontSize: 13, color: colores.cielo, marginTop: 2 },
  valor: { fontFamily: fuentes.semibold, fontSize: 13.5, color: colores.blanco, marginTop: 2 },
});
