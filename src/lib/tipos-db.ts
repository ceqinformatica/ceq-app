/**
 * Tipos de la base de datos, escritos a mano a partir de
 * supabase/migrations. Cuando el proyecto de Supabase exista se pueden
 * regenerar con:
 *   npx supabase gen types typescript --project-id <id> > src/lib/tipos-db.ts
 */

import type { TramiteNuevo } from './tramites';
import type { CategoriaCalendario } from './calendario';
import type { TipoClase } from './tipo-clase';

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
  /** Último día de clases del semestre (AAAA-MM-DD); después se vacía el horario. */
  fin_clases?: string | null;
}
export type MateriaEstudianteDb = {
  usuario_id: string; materia_id: string; estado: EstadoMateriaDb; nota_final: number | null; fecha: string | null;
  periodo: string | null; updated_at: string; nota_desde_final?: boolean; promedio_firma?: number | null; semestre_opuesto?: boolean;
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
  /** Teoría, RP o Laboratorio; null en las clases cargadas antes de que existiera. */
  tipo_clase: TipoClase | null;
  /** Minutos antes de la clase para avisar; null = sin aviso. */
  aviso_minutos: number | null; avisado_el: string | null;
}
export type EventoDb = {
  id: string; usuario_id: string | null; materia_id: string | null; plan_id: string | null; tipo: TipoEvento;
  titulo: string; fecha: string; aviso_minutos: number; notificado: boolean; created_at: string;
}
export type SocioDb = {
  id: string; usuario_id: string | null; numero_socio: string | null; ci: string; nombre: string;
  vigente_hasta: string | null; foto_path: string | null; updated_at: string;
  codigo_qr: string; activo: boolean; pagado_en: string | null; observacion: string | null; created_at: string;
}
export type EstadoSolicitudCarnet = 'pendiente' | 'aprobada' | 'rechazada';
export type SolicitudCarnetDb = {
  id: string; usuario_id: string; nombre: string; ci: string; numero_socio: string | null; vigente_hasta: string;
  foto_path: string; estado: EstadoSolicitudCarnet; motivo: string | null; revisado_por: string | null; revisado_en: string | null; created_at: string;
}
export type ResultadoVerificacion = 'vigente' | 'vencido' | 'inactivo' | 'no_encontrado';
export type VerificacionCarnet = {
  resultado: ResultadoVerificacion; socio_id?: string; nombre?: string; numero_socio?: string; ci?: string;
  carrera?: string | null; vigente_hasta?: string | null; foto_path?: string | null; con_cuenta?: boolean;
}
/** Una cuenta registrada en la app, para la lista del panel (solo admins). */
export type EstudianteRegistrado = {
  id: string; nombre: string | null; ci: string | null; correo: string | null; carrera: string | null; plan: string | null;
  anio_ingreso: number | null; rol: RolUsuario; registrado_en: string; ultimo_ingreso: string | null; socio_vigente: boolean;
};
export type EstudianteEncontrado = { id: string; nombre: string | null; ci: string | null; correo: string | null; carrera: string | null };
export type AvisoDb = {
  id: string; titulo: string; cuerpo: string; imagen_url: string | null; notificar: boolean; publicado: boolean;
  autor_id: string | null; created_at: string;
  /** Cuándo aparece para los estudiantes (avisos programados). */
  publicar_en?: string; carrera_id?: string | null;
}
export type CalendarioDb = {
  id: string; clave: string | null; anio: number; semestre: number | null; categoria: CategoriaCalendario;
  titulo: string; desde: string; hasta: string; detalle: string | null; created_at: string; updated_at: string;
};
export type TramiteDb = TramiteNuevo & { id: string; orden: number; publicado: boolean; updated_at: string };
export type SugerenciaDb = {
  id: string; usuario_id: string | null; categoria: string | null; texto: string;
  estado: 'recibida' | 'en_revision' | 'respondida'; respuesta: string | null; created_at: string;
}
/** resultados_publicos: true, quien vota ve los porcentajes; false, solo los ve la administración. */
export type EncuestaDb = { id: string; pregunta: string; abierta: boolean; cierra_en: string | null; created_at: string; resultados_publicos: boolean }
export type OpcionEncuestaDb = { id: string; encuesta_id: string; texto: string; orden: number }
export type YaVotaronDb = { encuesta_id: string; usuario_id: string }
/**
 * Para qué se usó un llamado: final (con nota), regularización (1.º o 2.º),
 * recuperatorio (1.º), final rendido esperando la nota ('pendiente') o
 * ausente a la mesa ('ausente'). Solo 'final' lleva nota.
 */
export type TipoExamen = 'final' | 'regularizacion' | 'recuperatorio' | 'pendiente' | 'ausente';
export type ExamenFinalDb = {
  id: string; usuario_id: string; materia_id: string; periodo: string | null; llamado: number | null; fecha: string | null;
  nota: number | null; created_at: string; porcentaje?: number | null;
  tipo?: TipoExamen; cursada_anterior?: boolean;
  /** Sube con cada cambio: detecta si otro dispositivo lo editó. */
  version?: number;
  /** 'extracto' si vino de la importación del EALU (nota_extracto: la nota original). */
  origen?: 'manual' | 'extracto';
  nota_extracto?: number | null;
  /** Rendido en semestre opuesto (queda guardado en el intento). */
  semestre_opuesto?: boolean;
  /** Recu o Regu: la evaluación de Parciales a la que corresponde. */
  evaluacion_id?: string | null;
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
export type PendientesPanel = { carnets_pendientes: number; ventanas_activas: number; horarios_borrador: number; clases_borrador?: number };
export type HorarioClasesDb = {
  id: string; carrera_id: string; plan_anio: number | null; titulo: string; pdf_path: string | null; publicado: boolean; publicado_en: string | null;
  /** Cuándo se avisó a los estudiantes (falta si la migración 20261125010000 no está aplicada). */
  avisado_en?: string | null;
  creado_por: string | null; created_at: string; updated_at: string;
}
export type ClaseOficialDb = {
  id: string; horario_id: string; materia: string; nivel: number | null; seccion: string | null; dia_semana: number;
  hora_inicio: string; hora_fin: string; aula: string | null; tipo_clase: 'teoria' | 'rp' | 'laboratorio' | null; created_at: string;
}
export type HorarioFinalesDb = {
  id: string; carrera_id: string; titulo: string; pdf_path: string | null; publicado: boolean; publicado_en: string | null;
  /** Cuándo se avisó a los estudiantes (falta si la migración 20261125010000 no está aplicada). */
  avisado_en?: string | null;
  creado_por: string | null; created_at: string; updated_at: string;
}
export type FechaFinalDb = {
  id: string; horario_id: string; materia: string; llamado: number; fecha: string; hora: string | null; aula: string | null; created_at: string;
  /** Planes de la mesa ([] = todos). Antes de la migración 20261126020000 no viene. */
  planes?: number[]; semestre_opuesto?: boolean;
}
export type ColorVentana = 'celeste' | 'marino' | 'rojo' | 'amarillo' | 'gris' | 'blanco' | string;
export type FormaVentana = 'centro' | 'abajo' | 'pantalla';
export type FrecuenciaVentana = 'una_vez' | 'diaria' | 'siempre';
export type VentanaDb = {
  id: string; titulo: string; cuerpo: string; imagen_url: string | null; icono: string | null;
  boton_texto: string | null; boton_destino: string | null; color: ColorVentana; forma: FormaVentana;
  alineacion: 'izquierda' | 'centro'; donde: 'inicio' | 'todas'; frecuencia: FrecuenciaVentana; cerrable: boolean;
  carrera_id: string | null; desde: string; hasta: string | null; activa: boolean; prioridad: number;
  creada_por: string | null; created_at: string; updated_at: string;
}
export type DispositivoDb = { token: string; usuario_id: string; plataforma: string | null; updated_at: string }

export type Database = {
  public: {
    Tables: {
      calendario_academico: Tabla<CalendarioDb, 'id' | 'clave' | 'semestre' | 'detalle' | 'created_at' | 'updated_at'>;
      carreras: Tabla<Carrera, 'id' | 'sigla' | 'activa' | 'created_at'>;
      planes: Tabla<Plan, 'id' | 'anio' | 'vigente' | 'unidad_avance' | 'created_at'>;
      grupos_optativas: Tabla<GrupoOptativasDb, 'id' | 'cantidad_exigida'>;
      materias: Tabla<MateriaDb, 'id' | 'codigo' | 'horas' | 'creditos' | 'tiene_laboratorio' | 'grupo_optativa_id' | 'orden'>;
      prerrequisitos: Tabla<PrerrequisitoDb, 'tipo'>;
      reglas_firma: Tabla<ReglaFirmaDb, 'id' | 'materia_id' | 'minimo_teoria' | 'minimo_laboratorio' | 'minimo_asistencia' | 'minimo_asistencia_lab' | 'modo_laboratorio' | 'peso_laboratorio' | 'notas'>;
      perfiles: Tabla<Perfil, 'nombre' | 'ci' | 'carrera_id' | 'plan_id' | 'anio_ingreso' | 'rol' | 'avatar_url' | 'created_at' | 'updated_at'>;
      materias_estudiante: Tabla<MateriaEstudianteDb, 'usuario_id' | 'estado' | 'nota_final' | 'fecha' | 'periodo' | 'updated_at' | 'nota_desde_final' | 'promedio_firma' | 'respaldo_recursada' | 'semestre_opuesto'>;
      evaluaciones: Tabla<EvaluacionDb, 'id' | 'usuario_id' | 'componente' | 'porcentaje' | 'puntaje_obtenido' | 'puntaje_total' | 'rendida' | 'fecha' | 'orden' | 'created_at'>;
      asistencias: Tabla<AsistenciaDb, 'usuario_id' | 'componente' | 'clases_dictadas' | 'clases_asistidas' | 'clases_totales'>;
      horario: Tabla<HorarioDb, 'id' | 'usuario_id' | 'materia_id' | 'titulo' | 'aula' | 'aviso_minutos' | 'avisado_el'>;
      eventos: Tabla<EventoDb, 'id' | 'usuario_id' | 'materia_id' | 'plan_id' | 'tipo' | 'aviso_minutos' | 'notificado' | 'created_at'>;
      socios: Tabla<SocioDb, 'id' | 'usuario_id' | 'numero_socio' | 'vigente_hasta' | 'foto_path' | 'updated_at' | 'codigo_qr' | 'activo' | 'pagado_en' | 'observacion' | 'created_at'>;
      avisos: Tabla<AvisoDb, 'id' | 'imagen_url' | 'notificar' | 'publicado' | 'autor_id' | 'created_at' | 'publicar_en' | 'carrera_id'>;
      notificaciones: Tabla<NotificacionDb, 'id' | 'tipo' | 'ruta' | 'aviso_id' | 'evento_id' | 'usuario_id' | 'carrera_id' | 'plan_id' | 'programada_para' | 'estado' | 'enviada_en' | 'destinatarios' | 'creada_por' | 'created_at'>;
      tramites: Tabla<TramiteDb, 'id' | 'clave' | 'categoria' | 'descripcion' | 'pasos' | 'requisitos' | 'costo' | 'donde' | 'plazo' | 'contacto' | 'modalidad' | 'formulario_url' | 'fuente_url' | 'orden' | 'publicado' | 'updated_at'>;
      sugerencias: Tabla<SugerenciaDb, 'id' | 'usuario_id' | 'categoria' | 'estado' | 'respuesta' | 'created_at'>;
      encuestas: Tabla<EncuestaDb, 'id' | 'abierta' | 'cierra_en' | 'created_at' | 'resultados_publicos'>;
      opciones_encuesta: Tabla<OpcionEncuestaDb, 'id' | 'orden'>;
      ya_votaron: Tabla<YaVotaronDb>;
      examenes_finales: Tabla<ExamenFinalDb, 'id' | 'usuario_id' | 'periodo' | 'llamado' | 'fecha' | 'created_at' | 'porcentaje' | 'tipo' | 'cursada_anterior' | 'version' | 'origen' | 'nota_extracto' | 'semestre_opuesto' | 'evaluacion_id'>;
      solicitudes_carnet: Tabla<SolicitudCarnetDb, 'id' | 'usuario_id' | 'numero_socio' | 'estado' | 'motivo' | 'revisado_por' | 'revisado_en' | 'created_at'>;
      dispositivos: Tabla<DispositivoDb, 'usuario_id' | 'plataforma' | 'updated_at'>;
      horarios_finales: Tabla<HorarioFinalesDb, 'id' | 'avisado_en' | 'pdf_path' | 'publicado' | 'publicado_en' | 'creado_por' | 'created_at' | 'updated_at'>;
      fechas_finales: Tabla<FechaFinalDb, 'id' | 'hora' | 'aula' | 'created_at'>;
      horarios_clases: Tabla<HorarioClasesDb, 'id' | 'avisado_en' | 'plan_anio' | 'pdf_path' | 'publicado' | 'publicado_en' | 'creado_por' | 'created_at' | 'updated_at'>;
      clases_oficiales: Tabla<ClaseOficialDb, 'id' | 'nivel' | 'seccion' | 'aula' | 'tipo_clase' | 'created_at'>;
      ventanas: Tabla<VentanaDb, 'id' | 'cuerpo' | 'imagen_url' | 'icono' | 'boton_texto' | 'boton_destino' | 'color' | 'forma' | 'alineacion' | 'donde' | 'frecuencia' | 'cerrable' | 'carrera_id' | 'desde' | 'hasta' | 'activa' | 'prioridad' | 'creada_por' | 'created_at' | 'updated_at'>;
    };
    Views: {
      resultados_encuesta: { Row: { encuesta_id: string; opcion_id: string; texto: string; votos: number }; Relationships: [] };
    };
    Functions: {
      votar: { Args: { p_encuesta: string; p_opcion: string }; Returns: undefined };
      recursar_materia: { Args: { p_materia: string }; Returns: undefined };
      cursar_semestre_opuesto: { Args: { p_materia: string }; Returns: undefined };
      guardar_llamados: { Args: { p_materia: string; p_periodos: string[]; p_filas: unknown[] }; Returns: undefined };
      guardar_final: { Args: { p_materia: string; p_id: string | null; p_version: number | null; p_fila: Record<string, unknown>; p_reemplaza?: string | null; p_reemplaza_version?: number | null }; Returns: string };
      borrar_final: { Args: { p_id: string; p_version: number }; Returns: undefined };
      guardar_parcial: { Args: { p_materia: string; p_eval_id: string; p_eval: Record<string, unknown>; p_uso: Record<string, unknown> | null; p_liberar?: boolean }; Returns: string };
      borrar_parcial: { Args: { p_eval_id: string; p_liberar?: boolean }; Returns: undefined };
      deshacer_recursada: { Args: { p_materia: string }; Returns: undefined };
      es_admin: { Args: Record<string, never>; Returns: boolean };
      registrar_dispositivo: { Args: { p_token: string; p_plataforma?: string | null }; Returns: undefined };
      alcance_notificacion: { Args: { p_carrera?: string | null }; Returns: number };
      resumen_admin: { Args: Record<string, never>; Returns: ResumenAdmin };
      verificar_carnet: { Args: { p_texto: string }; Returns: VerificacionCarnet };
      renovar_codigo_carnet: { Args: { p_socio: string }; Returns: string };
      poner_foto_carnet: { Args: { p_socio: string; p_path: string | null }; Returns: undefined };
      listar_estudiantes: { Args: Record<string, never>; Returns: EstudianteRegistrado[] };
      buscar_estudiantes: { Args: { p_texto: string }; Returns: EstudianteEncontrado[] };
      solicitar_carnet: { Args: { p_nombre: string; p_ci: string; p_numero: string | null; p_vence: string; p_foto: string }; Returns: string };
      aprobar_solicitud_carnet: { Args: { p_id: string; p_version: string }; Returns: string };
      rechazar_solicitud_carnet: { Args: { p_id: string; p_motivo: string | null }; Returns: undefined };
      eliminar_mi_cuenta: { Args: Record<string, never>; Returns: undefined };
      pendientes_panel: { Args: Record<string, never>; Returns: PendientesPanel };
      publicar_horario_finales: { Args: { p_id: string; p_notificar?: boolean }; Returns: number };
      publicar_horario_clases: { Args: { p_id: string; p_notificar?: boolean }; Returns: number };
      guardar_clases_oficiales: { Args: { p_horario: string; p_clases: { materia: string; nivel: number | null; seccion: string | null; dia_semana: number; hora_inicio: string; hora_fin: string; aula: string | null; tipo_clase: string | null }[] }; Returns: number };
      guardar_fechas_finales: { Args: { p_horario: string; p_fechas: { materia: string; llamado: number; fecha: string; hora: string | null; aula: string | null; planes?: number[]; semestre_opuesto?: boolean }[] }; Returns: number };
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
