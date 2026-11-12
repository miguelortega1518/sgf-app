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

export const KIND_ORDER = ['feature', 'bug', 'mejora', 'deuda', 'chore'] as const;
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

// --- Auditoría ---
// Acciones que registra logAudit (src/lib/audit.ts). 'space' se muestra como 'Proyecto'.

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  task_created: 'Tarea creada',
  status_changed: 'Cambio de estado',
  responsible_changed: 'Cambio de responsable',
  due_date_changed: 'Cambio de fecha límite',
  milestone_date_changed: 'Cambio de fecha de hito',
  task_approved: 'Tarea aprobada',
  task_approved_admin_override: 'Aprobada por admin (anulación)',
  comment_edited: 'Comentario editado',
  comment_deleted: 'Comentario eliminado',
  evidence_added: 'Evidencia añadida',
  evidence_removed: 'Evidencia eliminada',
  dependency_added: 'Dependencia añadida',
  dependency_removed: 'Dependencia eliminada',
  space_created: 'Proyecto creado',
  space_updated: 'Proyecto actualizado',
  // Valores heredados: ya no se emiten, pero audit_log puede tener filas antiguas
  space_health_updated: 'Actualización de salud',
  space_closed: 'Proyecto cerrado',
};

export const AUDIT_ACTION_CHIP: Record<string, string> = {
  task_created: 'bg-sky-100 text-sky-700',
  status_changed: 'bg-blue-100 text-blue-700',
  due_date_changed: 'bg-amber-100 text-amber-700',
  milestone_date_changed: 'bg-amber-100 text-amber-700',
  responsible_changed: 'bg-purple-100 text-purple-700',
  task_approved: 'bg-green-100 text-green-700',
  task_approved_admin_override: 'bg-green-100 text-green-700',
  evidence_added: 'bg-sky-100 text-sky-700',
  evidence_removed: 'bg-red-100 text-red-700',
  dependency_added: 'bg-sky-100 text-sky-700',
  dependency_removed: 'bg-red-100 text-red-700',
  space_created: 'bg-sky-100 text-sky-700',
  space_updated: 'bg-amber-100 text-amber-700',
};

const AUDIT_ACTION_FALLBACK = 'Acción registrada';
const AUDIT_CHIP_FALLBACK = 'bg-gray-100 text-gray-600';

/** Etiqueta visible de una acción de auditoría; nunca devuelve el identificador crudo. */
export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTION_LABEL, action) ? AUDIT_ACTION_LABEL[action] : AUDIT_ACTION_FALLBACK;
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
