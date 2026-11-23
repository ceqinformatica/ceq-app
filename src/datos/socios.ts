/**
 * Carnet de socio: alta y verificación desde el panel del CEQ, y lo que
 * el propio socio puede hacer con su carnet (foto y renovar el QR).
 * Todo pasa por RLS y funciones de la base: si la cuenta no tiene
 * permiso, Supabase lo rechaza aunque alguien llegue a estas pantallas.
 */
import { Platform } from 'react-native';
import { estadoCarnet, leerQr, normalizarCi, type FormularioSocio } from '../lib/carnet';
import { supabase } from '../lib/supabase';
import type { EstudianteEncontrado, SocioDb, SolicitudCarnetDb, VerificacionCarnet } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';
import { lanzar } from '../lib/errores';

const todosDemo = () => [...(db.socio ? [db.socio] : []), ...db.otrosSocios];

/* ---------------- Panel: lista y alta ---------------- */

export async function cargarSocios(): Promise<SocioDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return todosDemo();
  }
  const { data, error } = await supabase.from('socios').select('*').order('created_at', { ascending: false }).limit(1000);
  lanzar(error);
  return data ?? [];
}

export async function cargarSocioPorId(id: string): Promise<SocioDb | null> {
  if (MODO_DEMO) return todosDemo().find((s) => s.id === id) ?? null;
  const { data, error } = await supabase.from('socios').select('*').eq('id', id).maybeSingle();
  lanzar(error);
  return data;
}

export async function guardarSocio(id: string | null, f: FormularioSocio): Promise<void> {
  const fila = {
    nombre: f.nombre.trim(),
    ci: normalizarCi(f.ci),
    numero_socio: f.numero_socio.trim() || null,
    vigente_hasta: f.vigente_hasta,
    usuario_id: f.usuario_id,
    pagado_en: f.pagado_en,
    observacion: f.observacion.trim() || null,
    activo: f.activo,
  };
  if (MODO_DEMO) {
    await esperar(250);
    if (id) {
      const s = todosDemo().find((x) => x.id === id);
      if (s) Object.assign(s, fila, { numero_socio: fila.numero_socio ?? s.numero_socio });
    } else {
      db.otrosSocios.unshift({ ...fila, id: idDemo(), numero_socio: fila.numero_socio ?? `CEQ-0${430 + db.otrosSocios.length}`, foto_path: null, codigo_qr: idDemo(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() });
    }
    return;
  }
  const { error } = id
    ? await supabase.from('socios').update(fila).eq('id', id)
    : await supabase.from('socios').insert(fila);
  if (error?.code === '23505') {
    if (error.message.includes('usuario_id')) throw new Error('Esa cuenta ya tiene un carnet.');
    if (error.message.includes('numero_socio')) throw new Error('Ese número de socio ya está usado.');
    throw new Error('Ya hay un socio con esa cédula.');
  }
  lanzar(error);
}

export async function buscarEstudiantes(texto: string): Promise<EstudianteEncontrado[]> {
  if (MODO_DEMO) {
    await esperar(150);
    const t = texto.toLowerCase();
    return [{ id: UID_DEMO, nombre: 'Ana Giménez', ci: '5123456', correo: 'ana@ejemplo.com', carrera: 'Química' }].filter((e) =>
      [e.nombre, e.ci, e.correo].some((v) => v.toLowerCase().includes(t)),
    );
  }
  const { data, error } = await supabase.rpc('buscar_estudiantes', { p_texto: texto });
  lanzar(error);
  return (data as EstudianteEncontrado[] | null) ?? [];
}

/* ---------------- Verificación ---------------- */

export async function verificarCarnet(texto: string): Promise<VerificacionCarnet> {
  if (MODO_DEMO) {
    await esperar(300);
    const t = leerQr(texto);
    const s = todosDemo().find((x) => x.codigo_qr === t.toLowerCase() || x.numero_socio?.toUpperCase() === t.toUpperCase() || x.ci === normalizarCi(t));
    if (!s) return { resultado: 'no_encontrado' };
    return { resultado: estadoCarnet(s), socio_id: s.id, nombre: s.nombre, numero_socio: s.numero_socio ?? '', ci: s.ci, carrera: s.usuario_id ? 'Química' : null, vigente_hasta: s.vigente_hasta, foto_path: s.foto_path, con_cuenta: Boolean(s.usuario_id) };
  }
  const { data, error } = await supabase.rpc('verificar_carnet', { p_texto: texto });
  lanzar(error);
  return data as VerificacionCarnet;
}

/* ---------------- Foto y QR del socio ---------------- */

/** Enlace temporal (1 hora) a la foto del carnet, que está en un bucket privado. */
export async function urlFoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (MODO_DEMO) return path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('file:') ? path : null;
  const { data } = await supabase.storage.from('carnets').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Sube la foto elegida (uri local) y la pone en el carnet. */
export async function subirFoto(socio: SocioDb, uri: string, tipo: string | undefined): Promise<string> {
  if (MODO_DEMO) {
    await esperar(300);
    const s = todosDemo().find((x) => x.id === socio.id);
    if (s) s.foto_path = uri;
    return uri;
  }
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Volvé a iniciar sesión.');
  const ext = tipo?.includes('png') ? 'png' : 'jpg';
  const path = `${uid}/foto-${Date.now()}.${ext}`;
  const cuerpo = Platform.OS === 'web' ? await (await fetch(uri)).blob() : await bytesDe(uri);
  const { error } = await supabase.storage.from('carnets').upload(path, cuerpo, { contentType: tipo ?? 'image/jpeg', upsert: false });
  lanzar(error);
  const { error: e2 } = await supabase.rpc('poner_foto_carnet', { p_socio: socio.id, p_path: path });
  if (e2) {
    // que no quede una foto suelta en el bucket
    await supabase.storage.from('carnets').remove([path]).catch(() => undefined);
    lanzar(e2);
  }
  if (socio.foto_path && socio.foto_path !== path && socio.foto_path.startsWith(`${uid}/`)) {
    await supabase.storage.from('carnets').remove([socio.foto_path]);
  }
  return path;
}

async function bytesDe(uri: string): Promise<ArrayBuffer> {
  const { File } = await import('expo-file-system');
  const archivo = new File(uri);
  const b = await archivo.bytes();
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Cambia el código del QR: el anterior (y cualquier captura) deja de servir. */
export async function renovarCodigo(socioId: string): Promise<string> {
  if (MODO_DEMO) {
    await esperar(250);
    const nuevo = idDemo().replace(/-/g, '');
    const s = todosDemo().find((x) => x.id === socioId);
    if (s) s.codigo_qr = nuevo;
    return nuevo;
  }
  const { data, error } = await supabase.rpc('renovar_codigo_carnet', { p_socio: socioId });
  lanzar(error);
  return data as string;
}

/* ---------------- Validar el carnet físico con una foto ---------------- */

const BUCKET_SOLICITUDES = 'solicitudes-carnet';

/** La última solicitud del estudiante (pendiente, aprobada o rechazada). */
export async function cargarMiSolicitud(uid: string): Promise<SolicitudCarnetDb | null> {
  if (MODO_DEMO) return db.solicitudesCarnet.filter((x) => x.usuario_id === UID_DEMO).at(-1) ?? null;
  const { data, error } = await supabase.from('solicitudes_carnet').select('*').eq('usuario_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
  lanzar(error);
  return data;
}

export interface DatosSolicitud {
  nombre: string;
  ci: string;
  numero_socio: string;
  vigente_hasta: string;
}

/** Sube la foto del carnet físico y envía la solicitud al CEQ. */
export async function enviarSolicitud(datos: DatosSolicitud, foto: { uri: string; tipo?: string }): Promise<void> {
  if (MODO_DEMO) {
    await esperar(400);
    db.solicitudesCarnet = db.solicitudesCarnet.filter((x) => !(x.usuario_id === UID_DEMO && x.estado === 'pendiente'));
    db.solicitudesCarnet.push({
      id: idDemo(), usuario_id: UID_DEMO, nombre: datos.nombre, ci: normalizarCi(datos.ci), numero_socio: datos.numero_socio || null,
      vigente_hasta: datos.vigente_hasta, foto_path: foto.uri, estado: 'pendiente', motivo: null, revisado_por: null, revisado_en: null, created_at: new Date().toISOString(),
    });
    return;
  }
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Volvé a iniciar sesión.');
  const ext = foto.tipo?.includes('png') ? 'png' : 'jpg';
  const path = `${uid}/carnet-${Date.now()}.${ext}`;
  const cuerpo = Platform.OS === 'web' ? await (await fetch(foto.uri)).blob() : await bytesDe(foto.uri);
  const { error } = await supabase.storage.from(BUCKET_SOLICITUDES).upload(path, cuerpo, { contentType: foto.tipo ?? 'image/jpeg', upsert: false });
  lanzar(error);
  const { data: anterior } = await supabase.from('solicitudes_carnet').select('foto_path').eq('usuario_id', uid).eq('estado', 'pendiente').maybeSingle();
  const { error: e2 } = await supabase.rpc('solicitar_carnet', {
    p_nombre: datos.nombre.trim(), p_ci: datos.ci, p_numero: datos.numero_socio.trim() || null, p_vence: datos.vigente_hasta, p_foto: path,
  });
  if (e2) {
    await supabase.storage.from(BUCKET_SOLICITUDES).remove([path]).catch(() => undefined);
    lanzar(e2);
  }
  // La foto de la solicitud que se reemplazó ya no sirve.
  if (anterior?.foto_path && anterior.foto_path !== path) {
    await supabase.storage.from(BUCKET_SOLICITUDES).remove([anterior.foto_path]).catch(() => undefined);
  }
}

/** Panel: si al aprobar se va a vincular un socio que el CEQ cargó sin cuenta. */
export async function socioSinCuentaConCi(ci: string): Promise<SocioDb | null> {
  if (MODO_DEMO) return todosDemo().find((x) => x.ci === ci && !x.usuario_id) ?? null;
  const { data } = await supabase.from('socios').select('*').eq('ci', ci).is('usuario_id', null).maybeSingle();
  return data;
}

/** Panel: solicitudes pendientes, la más vieja primero. */
export async function cargarSolicitudesPendientes(): Promise<SolicitudCarnetDb[]> {
  if (MODO_DEMO) {
    await esperar();
    return db.solicitudesCarnet.filter((x) => x.estado === 'pendiente');
  }
  const { data, error } = await supabase.from('solicitudes_carnet').select('*').eq('estado', 'pendiente').order('created_at').limit(200);
  lanzar(error);
  return data ?? [];
}

export async function urlFotoSolicitud(path: string): Promise<string | null> {
  if (MODO_DEMO) return /^(https?|data|blob|file):/.test(path) ? path : null;
  const { data } = await supabase.storage.from(BUCKET_SOLICITUDES).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function aprobarSolicitud(id: string, version: string): Promise<void> {
  if (MODO_DEMO) {
    await esperar(300);
    const x = db.solicitudesCarnet.find((y) => y.id === id);
    if (x) {
      x.estado = 'aprobada';
      db.otrosSocios.unshift({ id: idDemo(), usuario_id: x.usuario_id, numero_socio: x.numero_socio ?? 'CEQ-0500', ci: x.ci, nombre: x.nombre, vigente_hasta: x.vigente_hasta, foto_path: null, updated_at: new Date().toISOString(), codigo_qr: idDemo(), activo: true, pagado_en: null, observacion: null, created_at: new Date().toISOString() });
    }
    return;
  }
  const { error } = await supabase.rpc('aprobar_solicitud_carnet', { p_id: id, p_version: version });
  lanzar(error);
}

export async function rechazarSolicitud(id: string, motivo: string): Promise<void> {
  if (MODO_DEMO) {
    await esperar(300);
    const x = db.solicitudesCarnet.find((y) => y.id === id);
    if (x) Object.assign(x, { estado: 'rechazada', motivo });
    return;
  }
  const { error } = await supabase.rpc('rechazar_solicitud_carnet', { p_id: id, p_motivo: motivo });
  lanzar(error);
}
