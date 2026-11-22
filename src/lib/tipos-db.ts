/**
 * Tipos de la base de datos, escritos a mano a partir de
 * supabase/migrations. Cuando el proyecto de Supabase exista se pueden
 * regenerar con:
 *   npx supabase gen types typescript --project-id <id> > src/lib/tipos-db.ts
 */

import type { TramiteNuevo } from './tramites';

export type RolUsuario = 'estudiante' | 'validador' | 'admin';
export type EstadoMateriaDb = 'pendiente' | 'cursando' | 'firmada' | 'aprobada';
export type ComponenteDb = 'teoria' | 'laboratorio';
export type TipoEvento = 'examen' | 'entrega' | 'recordatorio';

/** Construye Row / Insert / Update: `R` columnas, `O` columnas opcionales al insertar. */
type Tabla<R, O extends keyof R = never> = {
  Row: R;
  Insert: Omit<R, O> & Partial<Pick<R, O>>;
  Update: Partial<R>;
  Relationships: [];
};

export type Carrera = { id: string; nombre: string; sigla: string | null; semestres: number; activa: boolean; created_at: string }
export type Plan = { id: string; carrera_id: string; nombre: string; anio: number | null; vigente: boolean; unidad_avance: 'materias' | 'creditos' | 'horas'; created_at: string }
export type GrupoOptativasDb = { id: string; plan_id: string; nombre: string; cantidad_exigida: number }
export type MateriaDb = {
  id: string; plan_id: string; codigo: string | null; nombre: string; semestre: number; horas: number | null;
  creditos: number | null; tiene_laboratorio: boolean; grupo_optativa_id: string | null; orden: number;
}
export type PrerrequisitoDb = { materia_id: string; requiere_id: string; tipo: 'firmada' | 'aprobada' }
export type ReglaFirmaDb = {
  id: string; plan_id: string; materia_id: string | null; minimo_teoria: number; minimo_laboratorio: number | null;
  minimo_asistencia: number; minimo_asistencia_lab: number | null; modo_laboratorio: 'separado' | 'combinado';
  peso_laboratorio: number | null; notas: string | null;
}
export type Perfil = {
  id: string; nombre: string | null; ci: string | null; carrera_id: string | null; plan_id: string | null;
  anio_ingreso: number | null; rol: RolUsuario; avatar_url: string | null; created_at: string; updated_at: string;
  notif_avisos?: boolean; notif_recordatorios?: boolean;
}
export type MateriaEstudianteDb = {
  usuario_id: string; materia_id: string; estado: EstadoMateriaDb; nota_final: number | null; fecha: string | null;
  periodo: string | null; updated_at: string; nota_desde_final?: boolean; promedio_firma?: number | null;
  respaldo_recursada?: unknown;
}
export type EvaluacionDb = {
  id: string; usuario_id: string; materia_id: string; nombre: string; componente: ComponenteDb; ponderacion: number;
  porcentaje: number | null; puntaje_obtenido: number | null; puntaje_total: number | null; rendida: boolean;
  fecha: string | null; orden: number; created_at: string;
}
export type AsistenciaDb = {
  usuario_id: string; materia_id: string; componente: ComponenteDb; clases_dictadas: number; clases_asistidas: number;
  clases_totales: number | null;
}
export type HorarioDb = {
  id: string; usuario_id: string; materia_id: string | null; titulo: string | null; dia_semana: number;
  hora_inicio: string; hora_fin: string; aula: string | null;
}
export type EventoDb = {
  id: string; usuario_id: string | null; materia_id: string | null; plan_id: string | null; tipo: TipoEvento;
  titulo: string; fecha: string; aviso_minutos: number; notificado: boolean; created_at: string;
}
export type SocioDb = {
  id: string; usuario_id: string | null; numero_socio: string | null; ci: string; nombre: string;
  vigente_hasta: string | null; foto_path: string | null; updated_at: string;
}
export type AvisoDb = {
  id: string; titulo: string; cuerpo: string; imagen_url: string | null; notificar: boolean; publicado: boolean;
  autor_id: string | null; created_at: string;
  /** Cuándo aparece para los estudiantes (avisos programados). */
  publicar_en?: string; carrera_id?: string | null;
}
export type TramiteDb = TramiteNuevo & { id: string; orden: number; publicado: boolean; updated_at: string };
export type SugerenciaDb = {
  id: string; usuario_id: string | null; categoria: string | null; texto: string;
  estado: 'recibida' | 'en_revision' | 'respondida'; respuesta: string | null; created_at: string;
}
export type EncuestaDb = { id: string; pregunta: string; abierta: boolean; cierra_en: string | null; created_at: string }
export type OpcionEncuestaDb = { id: string; encuesta_id: string; texto: string; orden: number }
export type YaVotaronDb = { encuesta_id: string; usuario_id: string }
/** Para qué se usó un llamado: final, regularización (1.º o 2.º) o recuperatorio (1.º). */
export type TipoExamen = 'final' | 'regularizacion' | 'recuperatorio';
export type ExamenFinalDb = {
  id: string; usuario_id: string; materia_id: string; periodo: string | null; llamado: number | null; fecha: string | null;
  nota: number | null; created_at: string; porcentaje?: number | null;
  tipo?: TipoExamen; cursada_anterior?: boolean;
}
export type TipoNotificacion = 'aviso' | 'mensaje' | 'recordatorio';
export type EstadoNotificacion = 'pendiente' | 'enviada' | 'cancelada' | 'sin_destinatarios' | 'error';
export type NotificacionDb = {
  id: string; tipo: TipoNotificacion; titulo: string; cuerpo: string; ruta: string | null; aviso_id: string | null;
  evento_id: string | null; usuario_id: string | null; carrera_id: string | null; plan_id: string | null;
  programada_para: string; estado: EstadoNotificacion; enviada_en: string | null; destinatarios: number | null;
  creada_por: string | null; created_at: string;
}
export type ResumenAdmin = { usuarios: number; celulares: number; sugerencias_nuevas: number; programadas: number };
export type DispositivoDb = { token: string; usuario_id: string; plataforma: string | null; updated_at: string }

export type Database = {
  public: {
    Tables: {
      carreras: Tabla<Carrera, 'id' | 'sigla' | 'activa' | 'created_at'>;
      planes: Tabla<Plan, 'id' | 'anio' | 'vigente' | 'unidad_avance' | 'created_at'>;
      grupos_optativas: Tabla<GrupoOptativasDb, 'id' | 'cantidad_exigida'>;
      materias: Tabla<MateriaDb, 'id' | 'codigo' | 'horas' | 'creditos' | 'tiene_laboratorio' | 'grupo_optativa_id' | 'orden'>;
      prerrequisitos: Tabla<PrerrequisitoDb, 'tipo'>;
      reglas_firma: Tabla<ReglaFirmaDb, 'id' | 'materia_id' | 'minimo_teoria' | 'minimo_laboratorio' | 'minimo_asistencia' | 'minimo_asistencia_lab' | 'modo_laboratorio' | 'peso_laboratorio' | 'notas'>;
      perfiles: Tabla<Perfil, 'nombre' | 'ci' | 'carrera_id' | 'plan_id' | 'anio_ingreso' | 'rol' | 'avatar_url' | 'created_at' | 'updated_at'>;
      materias_estudiante: Tabla<MateriaEstudianteDb, 'usuario_id' | 'estado' | 'nota_final' | 'fecha' | 'periodo' | 'updated_at' | 'nota_desde_final' | 'promedio_firma' | 'respaldo_recursada'>;
      evaluaciones: Tabla<EvaluacionDb, 'id' | 'usuario_id' | 'componente' | 'porcentaje' | 'puntaje_obtenido' | 'puntaje_total' | 'rendida' | 'fecha' | 'orden' | 'created_at'>;
      asistencias: Tabla<AsistenciaDb, 'usuario_id' | 'componente' | 'clases_dictadas' | 'clases_asistidas' | 'clases_totales'>;
      horario: Tabla<HorarioDb, 'id' | 'usuario_id' | 'materia_id' | 'titulo' | 'aula'>;
      eventos: Tabla<EventoDb, 'id' | 'usuario_id' | 'materia_id' | 'plan_id' | 'tipo' | 'aviso_minutos' | 'notificado' | 'created_at'>;
      socios: Tabla<SocioDb, 'id' | 'usuario_id' | 'numero_socio' | 'vigente_hasta' | 'foto_path' | 'updated_at'>;
      avisos: Tabla<AvisoDb, 'id' | 'imagen_url' | 'notificar' | 'publicado' | 'autor_id' | 'created_at' | 'publicar_en' | 'carrera_id'>;
      notificaciones: Tabla<NotificacionDb, 'id' | 'tipo' | 'ruta' | 'aviso_id' | 'evento_id' | 'usuario_id' | 'carrera_id' | 'plan_id' | 'programada_para' | 'estado' | 'enviada_en' | 'destinatarios' | 'creada_por' | 'created_at'>;
      tramites: Tabla<TramiteDb, 'id' | 'clave' | 'categoria' | 'descripcion' | 'pasos' | 'requisitos' | 'costo' | 'donde' | 'plazo' | 'contacto' | 'modalidad' | 'formulario_url' | 'fuente_url' | 'orden' | 'publicado' | 'updated_at'>;
      sugerencias: Tabla<SugerenciaDb, 'id' | 'usuario_id' | 'categoria' | 'estado' | 'respuesta' | 'created_at'>;
      encuestas: Tabla<EncuestaDb, 'id' | 'abierta' | 'cierra_en' | 'created_at'>;
      opciones_encuesta: Tabla<OpcionEncuestaDb, 'id' | 'orden'>;
      ya_votaron: Tabla<YaVotaronDb>;
      examenes_finales: Tabla<ExamenFinalDb, 'id' | 'usuario_id' | 'periodo' | 'llamado' | 'fecha' | 'created_at' | 'porcentaje' | 'tipo' | 'cursada_anterior'>;
      dispositivos: Tabla<DispositivoDb, 'usuario_id' | 'plataforma' | 'updated_at'>;
    };
    Views: {
      resultados_encuesta: { Row: { encuesta_id: string; opcion_id: string; texto: string; votos: number }; Relationships: [] };
    };
    Functions: {
      votar: { Args: { p_encuesta: string; p_opcion: string }; Returns: undefined };
      recursar_materia: { Args: { p_materia: string }; Returns: undefined };
      deshacer_recursada: { Args: { p_materia: string }; Returns: undefined };
      es_admin: { Args: Record<string, never>; Returns: boolean };
      registrar_dispositivo: { Args: { p_token: string; p_plataforma?: string | null }; Returns: undefined };
      alcance_notificacion: { Args: { p_carrera?: string | null }; Returns: number };
      resumen_admin: { Args: Record<string, never>; Returns: ResumenAdmin };
      eliminar_mi_cuenta: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      rol_usuario: RolUsuario;
      estado_materia: EstadoMateriaDb;
      componente_eval: ComponenteDb;
      tipo_evento: TipoEvento;
      requisito_tipo: 'firmada' | 'aprobada';
    };
    CompositeTypes: Record<string, never>;
  };
};
