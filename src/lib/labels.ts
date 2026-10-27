// Vocabulario compartido de Forja: etiquetas y estilos de tipos, estados y áreas.
// Los valores de la base de datos se conservan; aquí solo se decide cómo se muestran.

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
