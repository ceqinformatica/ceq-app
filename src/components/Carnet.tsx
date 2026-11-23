import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { contenidoQr, estadoCarnet, formatearCi, textoSemestre } from '../lib/carnet';
import type { SocioDb } from '../lib/tipos-db';
import { colores, crearEstilos, espacio, fondos, fuentes, radio, sombras } from '../tema';
import { logoCeq } from './ui';

/** Solo se marca cuando hay un problema: un carnet al día no necesita cartel. */
const AVISO = {
  vencido: { texto: 'VENCIDO', fondo: 'rgba(255, 255, 255, 0.92)', color: '#B23A3A' },
  inactivo: { texto: 'DE BAJA', fondo: 'rgba(255, 255, 255, 0.92)', color: '#B23A3A' },
};

/** Carnet de socio del CEQ: celeste liso, como la credencial física. */
export function Carnet({ socio, carrera, conQr = false, foto }: { socio: SocioDb; carrera?: string | null; conQr?: boolean; foto?: string | null }) {
  const estado = estadoCarnet(socio);
  const aviso = estado === 'vigente' ? null : AVISO[estado];
  const vence = socio.vigente_hasta ? textoSemestre(socio.vigente_hasta) : null;
  return (
    <View style={[est.carnet, sombras.media]} accessibilityLabel={`Carnet de socio de ${socio.nombre}${vence ? `, vence el ${vence}` : ''}${aviso ? `, ${aviso.texto.toLowerCase()}` : ''}`}>
      <View style={est.fila}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }}>
          <View style={est.logo}><Image source={logoCeq} style={{ width: 30, height: 30 }} /></View>
          <View>
            <Text style={est.marca}>CEQ</Text>
            <Text style={est.marcaSub}>Centro de Estudiantes de Química</Text>
          </View>
        </View>
        {aviso && (
          <View style={[est.estado, { backgroundColor: aviso.fondo }]}>
            <Text style={[est.estadoTexto, { color: aviso.color }]}>{aviso.texto}</Text>
          </View>
        )}
      </View>

      {conQr && (
        <View style={[est.qr, aviso && { opacity: 0.35 }]}>
          <QRCode value={contenidoQr(socio.codigo_qr)} size={190} color={colores.marinoFijo} backgroundColor={fondos.blanco} />
        </View>
      )}

      <View style={{ marginTop: conQr ? espacio.l : espacio.xl, flexDirection: 'row', alignItems: 'center', gap: espacio.m }}>
        {foto ? <Image source={{ uri: foto }} style={est.foto} accessibilityLabel={`Foto de ${socio.nombre}`} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={est.nombre} numberOfLines={2}>{socio.nombre}</Text>
          {carrera ? <Text style={est.carrera} numberOfLines={1}>{carrera}</Text> : null}
        </View>
      </View>
      <View style={[est.fila, { marginTop: espacio.m, justifyContent: 'flex-start', gap: espacio.xl }]}>
        <Dato etiqueta="C.I." valor={formatearCi(socio.ci)} />
        <Dato etiqueta="Vence" valor={vence ?? 'Sin vencimiento'} />
        {!conQr && <Ionicons name="qr-code" size={30} color={colores.blanco} style={{ marginLeft: 'auto', opacity: 0.9 }} />}
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

const est = crearEstilos(() => ({
  carnet: { backgroundColor: fondos.celesteMarca, borderRadius: radio.xl, padding: espacio.l + 2, overflow: 'hidden' },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 40, height: 40, borderRadius: 11, backgroundColor: fondos.blanco, alignItems: 'center', justifyContent: 'center' },
  marca: { fontFamily: fuentes.bold, fontSize: 17, color: colores.blanco, letterSpacing: 1.5 },
  marcaSub: { fontFamily: fuentes.regular, fontSize: 11, color: '#EAF6FD' },
  estado: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radio.s },
  estadoTexto: { fontFamily: fuentes.bold, fontSize: 10.5, letterSpacing: 1 },
  qr: { alignSelf: 'center', backgroundColor: fondos.blanco, padding: espacio.m, borderRadius: radio.l, marginTop: espacio.xl },
  etiqueta: { fontFamily: fuentes.medium, fontSize: 11, color: '#EAF6FD' },
  nombre: { fontFamily: fuentes.bold, fontSize: 20, color: colores.blanco },
  foto: { width: 64, height: 80, borderRadius: radio.m, borderWidth: 2, borderColor: colores.blanco, backgroundColor: fondos.marino },
  carrera: { fontFamily: fuentes.regular, fontSize: 13.5, color: '#EAF6FD', marginTop: 2 },
  valor: { fontFamily: fuentes.semibold, fontSize: 14, color: colores.blanco, marginTop: 1 },
}));
