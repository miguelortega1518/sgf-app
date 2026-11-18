// Métricas de sprint: burndown por sprint y velocidad de los últimos sprints cerrados.
// Funciones puras, sin BD ni React: reciben los sprints, las tareas (no archivadas),
// sus historiales de estado (buildStatusHistory) y los eventos 'task_sprint_changed'.
// La carga está en src/app/api/spaces/[id]/sprint-metrics y src/lib/sprint-history-query.ts.
// Nunca lanzan: un reason inválido o un nombre desconocido se degradan como se indica.
//
// Instante de cierre: closedAt = sprint.updatedAt. PATCH /api/sprints/[id] rechaza con
// 409 cualquier cambio a un sprint cerrado, así que su updatedAt es el instante en que
// se cerró. Si algún día se permite editar sprints cerrados, hace falta una columna
// closed_at.
//
// Las estimaciones no tienen historial: el peso de cada tarea es su `estimate` actual.
//
// Pendiente con la 3/8 (arrastre al cerrar): si mueve las tareas no terminadas con
// eventos 'task_sprint_changed' cuyo timestamp es anterior a updatedAt, el último corte
// del burndown cerrado caería a 0. Esos eventos deberían marcarse (p. ej. "carry": true
// en el reason) e ignorarse aquí. La velocidad no se ve afectada: sólo cuenta completadas.

import { rdDayEnd, rdDayStart, reconcileHistory, statusAt } from '@/lib/flow-metrics';
import { buildStatusHistory, type StatusSegment } from '@/lib/status-history';
import { shiftDateRD, toDateRD } from '@/lib/date-utils';

/** Sprints cerrados que entran en la velocidad. */
export const VELOCITY_SPRINTS = 6;
/** Ventana de la media móvil de la velocidad (suavizado de la tendencia). */
export const MOVING_AVERAGE_WINDOW = 3;
/** Días máximos de un sprint para calcular su burndown (acota el coste O(días × tareas)). */
export const MAX_BURNDOWN_DAYS = 366;

/** Fila de audit_log con action='task_sprint_changed'. */
export type SprintEvent = {
  taskId: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  at: Date;
};

export type MetricsSprint = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  updatedAt: Date;
};

export type MetricsTask = {
  id: string;
  status: string;
  estimate: number | null;
  sprintId: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type ResolvedSprintEvent = { from: string | null; to: string | null; at: Date };

const BACKLOG_NAME = 'Backlog';

/** Id de sprint válido del JSON de reason: null o un id de un sprint del proyecto. */
function ownSprintRef(obj: object, key: string, ids: ReadonlySet<string>): string | null | undefined {
  if (!Object.hasOwn(obj, key)) return undefined;
  const v: unknown = (obj as Record<string, unknown>)[key];
  if (v === null) return null;
  return typeof v === 'string' && ids.has(v) ? v : undefined;
}

/** { from, to } del JSON de reason, o null si no es válido. */
function parseReason(reason: string | null, sprints: MetricsSprint[]): { from: string | null; to: string | null } | null {
  if (!reason) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reason);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const ids = new Set(sprints.map(s => s.id));
  const from = ownSprintRef(parsed, 'from', ids);
  const to = ownSprintRef(parsed, 'to', ids);
  if (from === undefined || to === undefined) return null;
  return { from, to };
}

/** Mayor startDate ≤ date entre los candidatos, o null. */
function latestStartedBy(candidates: MetricsSprint[], date: string): MetricsSprint | null {
  let best: MetricsSprint | null = null;
  for (const s of candidates) {
    if (s.startDate <= date && (!best || s.startDate > best.startDate)) best = s;
  }
  return best;
}

/**
 * Id del sprint con ese nombre (eventos antiguos, sin ids en el reason). 'Backlog' y
 * los nombres desconocidos son null. Si varios sprints se llaman igual, gana el que
 * contiene la fecha RD del evento; si ninguno o varios la contienen, el de mayor
 * startDate ≤ esa fecha.
 */
function sprintIdByName(name: string | null, at: Date, sprints: MetricsSprint[]): string | null {
  if (!name || name === BACKLOG_NAME) return null;
  const matches = sprints.filter(s => s.name === name);
  if (matches.length <= 1) return matches[0]?.id ?? null;
  const date = toDateRD(at);
  const containing = matches.filter(s => s.startDate <= date && date <= s.endDate);
  if (containing.length === 1) return containing[0].id;
  return latestStartedBy(containing.length > 1 ? containing : matches, date)?.id ?? null;
}

/**
 * Sprint de origen y destino de un evento 'task_sprint_changed'. Usa el JSON
 * { from, to } del reason si es un objeto con esas claves propias e ids del proyecto
 * (o null); si no, resuelve por nombre.
 */
export function resolveSprintEvent(
  event: SprintEvent, sprints: MetricsSprint[],
): { from: string | null; to: string | null } {
  return parseReason(event.reason, sprints) ?? {
    from: sprintIdByName(event.previousValue, event.at, sprints),
    to: sprintIdByName(event.newValue, event.at, sprints),
  };
}

/**
 * Función «¿en qué sprint estaba la tarea en el instante t?» (null = backlog o la tarea
 * aún no existía). Antes del primer evento está en su `from`; después de cada evento, en
 * su `to`; después del último, en el `sprintId` actual. Sin eventos, en el actual.
 */
export function sprintMembershipAt(
  task: { createdAt: Date; sprintId: string | null }, events: ResolvedSprintEvent[],
): (at: Date) => string | null {
  const createdMs = task.createdAt.getTime();
  // Array.prototype.sort es estable: los empates conservan el orden de entrada.
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  return (at: Date) => {
    const ms = at.getTime();
    if (ms < createdMs) return null;
    if (sorted.length === 0) return task.sprintId;
    if (ms < sorted[0].at.getTime()) return sorted[0].from;
    let i = 0;
    while (i + 1 < sorted.length && sorted[i + 1].at.getTime() <= ms) i++;
    return i === sorted.length - 1 ? task.sprintId : sorted[i].to;
  };
}

/** Línea de tiempo de una tarea: sprint y estado en cualquier instante. */
type TaskTimeline = {
  task: MetricsTask;
  sprintAt: (at: Date) => string | null;
  /** Instantes de sus eventos de sprint (ms), ordenados. */
  eventTimes: number[];
  isCompletedAt: (at: Date) => boolean;
};

export type SprintMetricsInput = {
  sprints: MetricsSprint[];
  tasks: MetricsTask[];
  statusHistories: Map<string, StatusSegment[]>;
  sprintEvents: Map<string, SprintEvent[]>;
};

function buildTimelines({ sprints, tasks, statusHistories, sprintEvents }: SprintMetricsInput): TaskTimeline[] {
  return tasks.map(task => {
    const events = (sprintEvents.get(task.id) ?? []).map(e => ({ ...resolveSprintEvent(e, sprints), at: e.at }));
    const history = reconcileHistory(task, statusHistories.get(task.id) ?? buildStatusHistory(task, []));
    return {
      task,
      sprintAt: sprintMembershipAt(task, events),
      eventTimes: events.map(e => e.at.getTime()).sort((a, b) => a - b),
      isCompletedAt: (at: Date) => statusAt(history, at) === 'completada',
    };
  });
}

/** ¿Perteneció la tarea al sprint en algún instante de [fromMs, toMs]? */
function belongedDuring(t: TaskTimeline, sprintId: string, fromMs: number, toMs: number): boolean {
  const start = Math.max(fromMs, t.task.createdAt.getTime());
  if (start > toMs) return false;
  if (t.sprintAt(new Date(start)) === sprintId) return true;
  return t.eventTimes.some(ms => ms >= start && ms <= toMs && t.sprintAt(new Date(ms)) === sprintId);
}

export type BurndownUnit = 'puntos' | 'tareas';

export type BurndownPoint = {
  /** Fecha RD 'YYYY-MM-DD' (la del primer día en el punto «Inicio»). */
  date: string;
  isStart: boolean;
  /** null en los días futuros del sprint activo. */
  remaining: number | null;
  scope: number | null;
  ideal: number;
};

export type BurndownResult =
  | { kind: 'empty' }
  /** El sprint supera MAX_BURNDOWN_DAYS: no se calcula para acotar el coste. */
  | { kind: 'too_long' }
  | { kind: 'data'; unit: BurndownUnit; points: BurndownPoint[] };

const DAY_MS = 86_400_000;

/** Fecha 'YYYY-MM-DD' como número de día (aritmética de calendario, sin zona horaria). */
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Días del sprint (startDate..endDate inclusive) calculados sin recorrerlos. */
function sprintLength(sprint: MetricsSprint): number {
  return dayNumber(sprint.endDate) - dayNumber(sprint.startDate) + 1;
}

/** Días RD del sprint, de startDate a endDate inclusive. */
function sprintDays(sprint: MetricsSprint): string[] {
  const days: string[] = [];
  for (let d = sprint.startDate; d <= sprint.endDate; d = shiftDateRD(d, 1)) days.push(d);
  return days;
}

function closedAt(sprint: MetricsSprint): Date | null {
  return sprint.status === 'cerrado' ? sprint.updatedAt : null;
}

function burndownFromTimelines(sprint: MetricsSprint, timelines: TaskTimeline[], now: Date): BurndownResult {
  // El coste es O(días × tareas): un sprint desmesurado no se recorre.
  const length = sprintLength(sprint);
  if (!Number.isFinite(length)) return { kind: 'empty' };
  if (length > MAX_BURNDOWN_DAYS) return { kind: 'too_long' };
  const days = sprintDays(sprint);
  const n = days.length;
  if (n === 0) return { kind: 'empty' };

  const closed = closedAt(sprint);
  const today = toDateRD(now);
  // Corte de cada día: su final en RD. En el sprint cerrado, nunca después del cierre;
  // si no está cerrado, hoy se corta en `now` y los días futuros no tienen corte.
  const cutoffs: (number | null)[] = days.map(date => {
    const end = rdDayEnd(date).getTime();
    if (closed) return Math.min(end, closed.getTime());
    if (date > today) return null;
    return date === today ? now.getTime() : end;
  });

  const windowStart = rdDayStart(sprint.startDate).getTime();
  const lastCut = cutoffs.filter((c): c is number => c !== null).at(-1) ?? now.getTime();
  const windowEnd = Math.max(windowStart, lastCut);

  const members = timelines.filter(t => belongedDuring(t, sprint.id, windowStart, windowEnd));
  if (members.length === 0) return { kind: 'empty' };

  const unit: BurndownUnit = members.some(t => t.task.estimate != null) ? 'puntos' : 'tareas';
  const weight = (t: TaskTimeline) => (unit === 'puntos' ? t.task.estimate ?? 0 : 1);

  const measure = (cut: number) => {
    const at = new Date(cut);
    let remaining = 0;
    let scope = 0;
    for (const t of members) {
      if (t.sprintAt(at) !== sprint.id) continue;
      scope += weight(t);
      if (!t.isCompletedAt(at)) remaining += weight(t);
    }
    return { remaining, scope };
  };

  // Inicio: alcance al final del primer día sin las tareas ya completadas al empezar.
  const startCut = cutoffs[0] ?? now.getTime();
  const sprintStart = new Date(windowStart);
  const startAt = new Date(startCut);
  let start = 0;
  for (const t of members) {
    if (t.sprintAt(startAt) === sprint.id && !t.isCompletedAt(sprintStart)) start += weight(t);
  }

  const ideal = (k: number) => start * (1 - k / n);
  const points: BurndownPoint[] = [
    { date: sprint.startDate, isStart: true, remaining: start, scope: start, ideal: ideal(0) },
    ...days.map((date, i) => {
      const cut = cutoffs[i];
      const m = cut === null ? { remaining: null, scope: null } : measure(cut);
      return { date, isStart: false, ...m, ideal: ideal(i + 1) };
    }),
  ];
  return { kind: 'data', unit, points };
}

export type BurndownInput = SprintMetricsInput & { sprint: MetricsSprint; now: Date };

/**
 * Burndown de un sprint de N días: N+1 puntos (Inicio y el corte de cada día).
 * `remaining` suma el peso de las tareas que en el corte pertenecen al sprint y no
 * están completadas; `scope`, el de todas las que pertenecen. Unidad 'puntos'
 * (peso = estimate ?? 0) si alguna tarea que perteneció al sprint tiene estimación;
 * si no, 'tareas' (peso 1). La ideal baja en línea recta del Inicio a 0.
 * O(días × tareas).
 */
export function sprintBurndown(input: BurndownInput): BurndownResult {
  return burndownFromTimelines(input.sprint, buildTimelines(input), input.now);
}

export type VelocityRow = {
  sprintId: string;
  name: string;
  startDate: string;
  endDate: string;
  points: number;
  tasks: number;
  avgPoints: number;
  avgTasks: number;
};

export type VelocityReport = { enough: boolean; closedCount: number; rows: VelocityRow[] };

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Media de values[max(0, i − ventana + 1)..i], redondeada a 1 decimal. */
function movingAverage(values: number[], i: number): number {
  const window = values.slice(Math.max(0, i - MOVING_AVERAGE_WINDOW + 1), i + 1);
  return round1(window.reduce((s, v) => s + v, 0) / window.length);
}

function velocityFromTimelines(sprints: MetricsSprint[], timelines: TaskTimeline[]): VelocityReport {
  const closed = sprints.filter(s => s.status === 'cerrado');
  const recent = [...closed]
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, VELOCITY_SPRINTS)
    .reverse();

  const totals = recent.map(sprint => {
    const at = sprint.updatedAt;
    let points = 0;
    let tasks = 0;
    for (const t of timelines) {
      if (t.sprintAt(at) !== sprint.id || !t.isCompletedAt(at)) continue;
      points += t.task.estimate ?? 0;
      tasks += 1;
    }
    return { sprint, points, tasks };
  });

  const pointValues = totals.map(r => r.points);
  const taskValues = totals.map(r => r.tasks);
  const rows = totals.map(({ sprint, points, tasks }, i) => ({
    sprintId: sprint.id,
    name: sprint.name,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    points,
    tasks,
    avgPoints: movingAverage(pointValues, i),
    avgTasks: movingAverage(taskValues, i),
  }));

  return { enough: closed.length >= 2, closedCount: closed.length, rows };
}

/**
 * Velocidad de los VELOCITY_SPRINTS sprints cerrados más recientes (endDate y, si
 * empatan, updatedAt), en orden cronológico. Cuenta las tareas que al cierre
 * pertenecen al sprint y están completadas: puntos (estimate ?? 0) y recuento, con
 * la media móvil de MOVING_AVERAGE_WINDOW (sólo suaviza la tendencia; la medida
 * central del ciclo sigue siendo mediana y p85). `enough` con 2 o más cerrados.
 */
export function sprintVelocity(input: SprintMetricsInput): VelocityReport {
  return velocityFromTimelines(input.sprints, buildTimelines(input));
}

export type ProjectSprintMetrics = { burndowns: Record<string, BurndownResult>; velocity: VelocityReport };

/** Burndown del sprint activo y de los cerrados, y la velocidad, con una sola reconstrucción. */
export function projectSprintMetrics(input: SprintMetricsInput & { now: Date }): ProjectSprintMetrics {
  const timelines = buildTimelines(input);
  const burndowns: Record<string, BurndownResult> = {};
  for (const sprint of input.sprints) {
    if (sprint.status !== 'activo' && sprint.status !== 'cerrado') continue;
    burndowns[sprint.id] = burndownFromTimelines(sprint, timelines, input.now);
  }
  return { burndowns, velocity: velocityFromTimelines(input.sprints, timelines) };
}
