/**
 * Carnet de socio: alta y verificación desde el panel del CEQ, y lo que
 * el propio socio puede hacer con su carnet (foto y renovar el QR).
 * Todo pasa por RLS y funciones de la base: si la cuenta no tiene
 * permiso, Supabase lo rechaza aunque alguien llegue a estas pantallas.
 */
import { Platform } from 'react-native';
import { estadoCarnet, leerQr, normalizarCi, type FormularioSocio } from '../lib/carnet';
import { supabase } from '../lib/supabase';
import type { EstudianteEncontrado, SocioDb, VerificacionCarnet } from '../lib/tipos-db';
import { db, esperar, idDemo, MODO_DEMO, UID_DEMO } from './demo';

function lanzar(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

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
  lanzar(e2);
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
