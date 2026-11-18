// Vocabulario compartido de Forja: etiquetas y estilos de tipos, estados y áreas.
// Los valores de la base de datos se conservan; aquí solo se decide cómo se muestran.

/** Nombre visible del producto. */
export const APP_NAME = 'Forja';

export const STATUS_ORDER = ['no_iniciada', 'en_proceso', 'en_revision', 'completada', 'bloqueada'] as const;
export type TaskStatus = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  no_iniciada: 'Por hacer',
  en_proceso: 'En progreso',
  en_revision: 'En code review',
  completada: 'Hecho',
  bloqueada: 'Bloqueada',
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  no_iniciada: 'bg-gray-400',
  en_proceso: 'bg-sky-500',
  en_revision: 'bg-purple-500',
  completada: 'bg-green-500',
  bloqueada: 'bg-red-500',
};

export const STATUS_CHIP: Record<TaskStatus, string> = {
  no_iniciada: 'bg-gray-100 text-gray-700',
  en_proceso: 'bg-sky-100 text-sky-700',
  en_revision: 'bg-purple-100 text-purple-700',
  completada: 'bg-green-100 text-green-700',
  bloqueada: 'bg-red-100 text-red-700',
};

/**
 * Color de cada estado en los gráficos de flujo (src/components/dashboard). Son
 * variables CSS definidas en los tres bloques de tema de globals.css.
 */
export const STATUS_CHART_VAR: Record<TaskStatus, string> = {
  no_iniciada: 'var(--chart-todo)',
  en_proceso: 'var(--chart-doing)',
  en_revision: 'var(--chart-review)',
  completada: 'var(--chart-done)',
  bloqueada: 'var(--chart-blocked)',
};

/**
 * Colores de los gráficos de sprint (src/components/sprints): burndown (real e ideal)
 * y velocidad (barras y media móvil). Variables CSS de los tres bloques de tema.
 */
export const SPRINT_CHART_VAR = {
  actual: 'var(--chart-bar)',
  ideal: 'var(--chart-marker)',
  average: 'var(--chart-review)',
} as const;

export const KIND_ORDER =['feature', 'bug', 'mejora', 'deuda', 'chore'] as const;
export type TaskKind = (typeof KIND_ORDER)[number];

export const KIND_LABEL: Record<TaskKind, string> = {
  feature: 'Feature',
  bug: 'Bug',
  mejora: 'Mejora',
  deuda: 'Deuda técnica',
  chore: 'Chore',
};

export const KIND_CHIP: Record<TaskKind, string> = {
  feature: 'bg-sky-100 text-sky-700',
  bug: 'bg-red-100 text-red-700',
  mejora: 'bg-green-100 text-green-700',
  deuda: 'bg-amber-100 text-amber-700',
  chore: 'bg-gray-100 text-gray-700',
};

export const PRIORITY_LABEL: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', normal: 'Normal', baja: 'Baja',
};

export const PRIORITY_DOT: Record<string, string> = {
  critica: 'bg-red-500', alta: 'bg-orange-500', normal: 'bg-gray-400', baja: 'bg-gray-300',
};

export const BLOCK_AREAS = [
  { value: 'infraestructura', label: 'Infraestructura / DevOps' },
  { value: 'diseno', label: 'Diseño' },
  { value: 'producto', label: 'Producto / definición' },
  { value: 'qa', label: 'QA' },
  { value: 'seguridad', label: 'Seguridad' },
  { value: 'terceros', label: 'API o equipo externo' },
  { value: 'otro', label: 'Otro' },
] as const;

export const AREA_LABEL: Record<string, string> = {
  ...Object.fromEntries(BLOCK_AREAS.map(a => [a.value, a.label])),
  // Valores heredados de la versión anterior
  compras: 'Compras', operaciones: 'Operaciones', tesoreria: 'Tesorería',
  contabilidad: 'Contabilidad', administracion: 'Administración', presupuesto: 'Presupuesto',
};

export const ESTIMATE_STEPS = [1, 2, 3, 5, 8, 13, 21] as const;

export const SPACE_TYPE_LABEL: Record<string, string> = {
  recurrente: 'Sprint', proyecto: 'Iniciativa', continuo: 'Backlog',
};

// --- Sprints (src/lib/sprints.ts) ---
// No confundir con SPACE_TYPE_LABEL.recurrente: aquí son iteraciones dentro de un proyecto.

export const SPRINT_STATUS_LABEL: Record<'planificado' | 'activo' | 'cerrado', string> = {
  planificado: 'Planificado',
  activo: 'Activo',
  cerrado: 'Cerrado',
};

export const SPRINT_STATUS_CHIP: Record<'planificado' | 'activo' | 'cerrado', string> = {
  planificado: 'bg-gray-100 text-gray-700',
  activo: 'bg-blue-100 text-blue-700',
  cerrado: 'bg-green-100 text-green-700',
};

// --- Auditoría ---
// Acciones que registra logAudit (src/lib/audit.ts). 'space' se muestra como 'Proyecto'.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  task_created: 'Tarea creada',
  status_changed: 'Cambio de estado',
  responsible_changed: 'Cambio de responsable',
  due_date_changed: 'Cambio de fecha límite',
  milestone_date_changed: 'Cambio de fecha de hito',
  milestone_created: 'Hito creado',
  milestone_deleted: 'Hito eliminado',
  milestone_renamed: 'Hito renombrado',
  milestone_completion_changed: 'Cambio de estado de hito',
  task_approved: 'Tarea aprobada',
  factory_pr_merged: 'Cambio de AI Factory integrado en GitHub',
  task_approved_admin_override: 'Aprobada por admin (anulación)',
  comment_edited: 'Comentario editado',
  comment_deleted: 'Comentario eliminado',
  evidence_added: 'Evidencia añadida',
  evidence_removed: 'Evidencia eliminada',
  dependency_added: 'Dependencia añadida',
  dependency_removed: 'Dependencia eliminada',
  subtask_added: 'Subtarea añadida',
  subtask_removed: 'Subtarea eliminada',
  subtask_renamed: 'Subtarea renombrada',
  subtask_completion_changed: 'Cambio de estado de subtarea',
  space_created: 'Proyecto creado',
  space_updated: 'Proyecto actualizado',
  template_updated: 'Plantilla actualizada',
  template_task_created: 'Tarea de plantilla creada',
  template_task_updated: 'Tarea de plantilla actualizada',
  template_task_deleted: 'Tarea de plantilla eliminada',
  template_duplicated: 'Plantilla duplicada',
  pr_linked: 'PR enlazado',
  tasks_imported: 'Tareas importadas',
  email_preferences_changed: 'Preferencias de correo cambiadas',
  sprint_created: 'Sprint creado',
  sprint_updated: 'Sprint actualizado',
  sprint_started: 'Sprint iniciado',
  sprint_closed: 'Sprint cerrado',
  task_sprint_changed: 'Cambio de sprint',
  wip_limit_changed: 'Límite WIP cambiado',
  // Valores heredados: ya no se emiten, pero audit_log puede tener filas antiguas
  space_health_updated: 'Actualización de salud',
  space_closed: 'Proyecto cerrado',
};

export const AUDIT_ACTION_CHIP: Record<string, string> = {
  task_created: 'bg-sky-100 text-sky-700',
  status_changed: 'bg-blue-100 text-blue-700',
  due_date_changed: 'bg-amber-100 text-amber-700',
  milestone_date_changed: 'bg-amber-100 text-amber-700',
  milestone_created: 'bg-sky-100 text-sky-700',
  milestone_deleted: 'bg-red-100 text-red-700',
  milestone_renamed: 'bg-amber-100 text-amber-700',
  milestone_completion_changed: 'bg-green-100 text-green-700',
  responsible_changed: 'bg-purple-100 text-purple-700',
  task_approved: 'bg-green-100 text-green-700',
  factory_pr_merged: 'bg-green-100 text-green-700',
  task_approved_admin_override: 'bg-green-100 text-green-700',
  evidence_added: 'bg-sky-100 text-sky-700',
  evidence_removed: 'bg-red-100 text-red-700',
  dependency_added: 'bg-sky-100 text-sky-700',
  dependency_removed: 'bg-red-100 text-red-700',
  subtask_added: 'bg-sky-100 text-sky-700',
  subtask_removed: 'bg-red-100 text-red-700',
  subtask_renamed: 'bg-amber-100 text-amber-700',
  subtask_completion_changed: 'bg-green-100 text-green-700',
  space_created: 'bg-sky-100 text-sky-700',
  space_updated: 'bg-amber-100 text-amber-700',
  template_updated: 'bg-amber-100 text-amber-700',
  template_task_created: 'bg-sky-100 text-sky-700',
  template_task_updated: 'bg-amber-100 text-amber-700',
  template_task_deleted: 'bg-red-100 text-red-700',
  template_duplicated: 'bg-sky-100 text-sky-700',
  pr_linked: 'bg-sky-100 text-sky-700',
  tasks_imported: 'bg-sky-100 text-sky-700',
  email_preferences_changed: 'bg-amber-100 text-amber-700',
  sprint_created: 'bg-sky-100 text-sky-700',
  sprint_updated: 'bg-amber-100 text-amber-700',
  sprint_started: 'bg-blue-100 text-blue-700',
  sprint_closed: 'bg-green-100 text-green-700',
  task_sprint_changed: 'bg-purple-100 text-purple-700',
  wip_limit_changed: 'bg-amber-100 text-amber-700',
};

const AUDIT_ACTION_FALLBACK = 'Acción registrada';
const AUDIT_CHIP_FALLBACK = 'bg-gray-100 text-gray-600';

/** Etiqueta visible de una acción de auditoría; nunca devuelve el identificador crudo. */
export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_LABEL, action) ? AUDIT_ACTION_LABEL[action] : AUDIT_ACTION_FALLBACK;
}

/**
 * Motivo que guardan las rutas de comentarios cuando un admin edita o borra un
 * comentario ajeno. La redacción de la auditoría (src/lib/audit-redaction.ts)
 * depende de este texto exacto: no cambiarlo sin migrar las filas antiguas.
 */
export const COMMENT_MODERATED_REASON = 'Moderado por admin';

/**
 * Etiqueta de un registro de comentario que llega redactado (sin texto) a quien
 * no es admin. Para cualquier otro caso cae en auditActionLabel.
 */
export function redactedCommentLabel(action: string, reason: string | null): string {
  const moderated = reason === COMMENT_MODERATED_REASON;
  if (action === 'comment_deleted' && moderated) return 'Comentario eliminado por moderación';
  if (action === 'comment_deleted') return 'Comentario eliminado';
  if (action === 'comment_edited' && moderated) return 'Comentario editado por moderación';
  return auditActionLabel(action);
}

/** Clases del chip de una acción de auditoría (gris por defecto). */
export function auditActionChip(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_CHIP, action) ? AUDIT_ACTION_CHIP[action] : AUDIT_CHIP_FALLBACK;
}

// --- Motivos de retraso ---
// Códigos de delayReason (updateTaskStatusSchema y delayReasonEnum de la BD, mismo orden).

export const DELAY_REASON_ORDER = [
  'falta_informacion_terceros',
  'documento_no_recibido_otra_area',
  'error_sistema',
  'capacidad_insuficiente',
  'dependencia_atrasada',
  'repriorizacion',
  'otro',
] as const;
export type DelayReason = (typeof DELAY_REASON_ORDER)[number];

export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  falta_informacion_terceros: 'Falta información de un tercero',
  documento_no_recibido_otra_area: 'Falta una definición de otro equipo',
  error_sistema: 'Fallo de entorno o infraestructura',
  capacidad_insuficiente: 'Capacidad insuficiente',
  dependencia_atrasada: 'Dependencia atrasada',
  repriorizacion: 'Repriorización',
  otro: 'Otro',
};

/**
 * Etiqueta visible de un motivo de retraso. A diferencia de auditActionLabel, si el
 * texto no es un código conocido se devuelve tal cual: audit_log.reason también
 * guarda texto libre (p. ej. 'Moderado por admin'). Object.hasOwn evita resolver
 * claves del prototipo como 'constructor' o '__proto__'.
 */
export function delayReasonLabel(reason: string): string {
  return Object.hasOwn(DELAY_REASON_LABEL, reason) ? DELAY_REASON_LABEL[reason as DelayReason] : reason;
}

// --- Panel «Pull request» ---
// Estados de github_pull_requests.state y de cada revisor (src/lib/github-pull-request.ts).

export const PR_STATE_ORDER = ['abierto', 'borrador', 'fusionado', 'cerrado'] as const;
export type PrStateCode = (typeof PR_STATE_ORDER)[number];

export const PR_STATE_LABEL: Record<PrStateCode, string> = {
  abierto: 'Abierto',
  borrador: 'Borrador',
  fusionado: 'Fusionado',
  cerrado: 'Cerrado',
};

export const PR_STATE_CHIP: Record<PrStateCode, string> = {
  abierto: 'bg-green-100 text-green-700',
  borrador: 'bg-gray-100 text-gray-700',
  fusionado: 'bg-purple-100 text-purple-700',
  cerrado: 'bg-red-100 text-red-700',
};

export const REVIEWER_STATE_ORDER = ['pendiente', 'aprobado', 'cambios', 'comentado'] as const;
export type ReviewerStateCode = (typeof REVIEWER_STATE_ORDER)[number];

export const REVIEWER_STATE_LABEL: Record<ReviewerStateCode, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  cambios: 'Pidió cambios',
  comentado: 'Comentó',
};

export const REVIEWER_STATE_CHIP: Record<ReviewerStateCode, string> = {
  pendiente: 'bg-gray-100 text-gray-700',
  aprobado: 'bg-green-100 text-green-700',
  cambios: 'bg-red-100 text-red-700',
  comentado: 'bg-sky-100 text-sky-700',
};

// --- Notificaciones ---
// Tipos de notifications.type (alineado con TYPE_CONFIG de la página de notificaciones).

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  task_completed: 'Hecho',
  task_review: 'Revisión',
  task_blocked: 'Bloqueada',
  task_assigned: 'Asignada',
  review_assigned: 'Revisión asignada',
  task_approved: 'Aprobada',
};

/** Etiqueta de un tipo de notificación desconocido. */
export const NOTIFICATION_TYPE_FALLBACK = 'Otros avisos';

/** Etiqueta visible de un tipo de notificación; nunca devuelve el identificador crudo. */
export function notificationTypeLabel(type: string): string {
  return Object.hasOwn(NOTIFICATION_TYPE_LABEL, type) ? NOTIFICATION_TYPE_LABEL[type] : NOTIFICATION_TYPE_FALLBACK;
}

// --- Resumen diario por correo (src/lib/daily-digest.ts) ---

export const DIGEST_SECTION_LABEL = {
  dueToday: 'Vence hoy',
  overdue: 'Vencidas',
  review: 'Esperando tu revisión',
  blocked: 'Bloqueadas',
  news: 'Novedades',
} as const;

// --- Métricas de entrega (src/components/dashboard/wip-aging-list.tsx) ---

/** Chip «Envejecida»: tarea en curso que supera el p85 del tiempo de ciclo. */
export const WIP_AGED_CHIP = 'bg-amber-100 text-amber-800';

/** Clave legible de una tarea: FOR-142. */
export function taskKey(n: number | null | undefined): string {
  return n ? `FOR-${n}` : '';
}

/** "https://github.com/org/repo/pull/218" -> "#218"; otros enlaces -> dominio. */
export function prLabel(url: string | null | undefined): string {
  if (!url) return '';
  const m = url.match(/\/(?:pull|pulls|merge_requests)\/(\d+)/);
  if (m) return `#${m[1]}`;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'PR'; }
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}
