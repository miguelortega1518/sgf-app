/**
 * Lógica pura de sprints (sin BD ni hooks): sirve en servidor y en cliente.
 */

export const SPRINT_NAME_MAX = 200;
export const SPRINT_GOAL_MAX = 2000;
/** Duración por defecto de un sprint nuevo: 2 semanas, contando el día de inicio. */
export const SPRINT_DEFAULT_DAYS = 14;

export const SPRINT_STATUSES = ['planificado', 'activo', 'cerrado'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** Suma `days` días a una fecha 'YYYY-MM-DD' con aritmética Date.UTC (independiente de la TZ). */
function addDaysToIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, '0');
  const day = String(target.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Fechas por defecto de un sprint nuevo que empieza `today` (fecha RD 'YYYY-MM-DD'). */
export function defaultSprintDates(today: string): { startDate: string; endDate: string } {
  return { startDate: today, endDate: addDaysToIso(today, SPRINT_DEFAULT_DAYS - 1) };
}

/** Sólo se permite planificado → activo y activo → cerrado. */
export function canTransitionSprint(from: SprintStatus, to: SprintStatus): boolean {
  return (from === 'planificado' && to === 'activo') || (from === 'activo' && to === 'cerrado');
}

/** Fechas 'YYYY-MM-DD': la comparación de cadenas equivale a la cronológica. */
export function isValidSprintRange(startDate: string, endDate: string): boolean {
  return endDate >= startDate;
}

export type SprintTaskLike = {
  id: string;
  sprintId: string | null;
  status: string;
  estimate: number | null;
};

export type SprintLike = {
  id: string;
  status: SprintStatus;
  startDate: string;
};

export type SprintTaskGroup<T> = { tasks: T[]; estimateTotal: number };
export type SprintGroup<S, T> = SprintTaskGroup<T> & { sprint: S };

export type GroupedSprintTasks<S, T> = {
  backlog: SprintTaskGroup<T>;
  active: SprintGroup<S, T> | null;
  planned: SprintGroup<S, T>[];
};

/** Suma de estimaciones; las tareas sin estimar cuentan como 0. */
export function sumEstimates(tasks: { estimate: number | null }[]): number {
  return tasks.reduce((total, t) => total + (t.estimate ?? 0), 0);
}

/**
 * Agrupa las tareas de un proyecto en backlog, sprint activo y sprints planificados.
 * El backlog son las tareas sin sprint que no están terminadas. Los sprints cerrados
 * no se devuelven: sus tareas no salen en ningún grupo.
 */
export function groupTasksBySprint<T extends SprintTaskLike, S extends SprintLike>(
  tasks: T[],
  sprints: S[],
): GroupedSprintTasks<S, T> {
  const group = (sprint: S): SprintGroup<S, T> => {
    const own = tasks.filter(t => t.sprintId === sprint.id);
    return { sprint, tasks: own, estimateTotal: sumEstimates(own) };
  };

  const backlogTasks = tasks.filter(t => t.sprintId == null && t.status !== 'completada');
  const activeSprint = sprints.find(s => s.status === 'activo');
  const planned = sprints
    .filter(s => s.status === 'planificado')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(group);

  return {
    backlog: { tasks: backlogTasks, estimateTotal: sumEstimates(backlogTasks) },
    active: activeSprint ? group(activeSprint) : null,
    planned,
  };
}
