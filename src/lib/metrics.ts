// Métricas de entrega del equipo. Funciones puras: reciben filas y devuelven números.

import { startedAt, type StatusSegment } from '@/lib/status-history';

export type MetricTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  kind: string;
  estimate: number | null;
  createdAt: Date;
  completedAt: Date | null;
  responsibleId: string;
  responsibleName: string;
  blockedByArea: string | null;
};

const DAY = 86_400_000;

/** Lunes (00:00 UTC) de la semana que contiene `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // lunes = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export type WeekBucket = { start: string; tasks: number; points: number };

/** Tareas y puntos terminados por semana, de la más antigua a la actual. */
export function weeklyVelocity(tasks: MetricTask[], weeks: number, now = new Date()): WeekBucket[] {
  const current = weekStart(now).getTime();
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({ start: new Date(current - i * 7 * DAY).toISOString().slice(0, 10), tasks: 0, points: 0 });
  }
  for (const t of tasks) {
    if (t.status !== 'completada' || !t.completedAt) continue;
    const idx = Math.floor((weekStart(t.completedAt).getTime() - (current - (weeks - 1) * 7 * DAY)) / (7 * DAY));
    if (idx < 0 || idx >= weeks) continue;
    buckets[idx].tasks += 1;
    buckets[idx].points += t.estimate ?? 0;
  }
  return buckets;
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Campos mínimos de una tarea para medir el ciclo. */
export type CycleTask = Pick<MetricTask, 'id' | 'status' | 'createdAt' | 'completedAt'>;

/** Terminadas (status 'completada') cuyo cierre cae en los últimos `windowDays`. */
function doneInWindow<T extends Pick<MetricTask, 'status' | 'completedAt'>>(
  tasks: T[], windowDays: number, now: Date,
): (T & { completedAt: Date })[] {
  const since = now.getTime() - windowDays * DAY;
  return tasks.filter((t): t is T & { completedAt: Date } =>
    t.status === 'completada' && t.completedAt !== null && t.completedAt.getTime() >= since);
}

/**
 * Días de ciclo de cada tarea terminada en los últimos `windowDays`, en el orden de
 * entrada y sin redondear. El inicio es el de startedAt (o `createdAt` si no hay
 * inicio registrado, y entonces cuenta en `withoutStart`). Lo comparten cycleTime y
 * el histograma de src/lib/flow-metrics.ts.
 */
export function cycleDays(
  tasks: CycleTask[], histories: Map<string, StatusSegment[]>, windowDays: number, now = new Date(),
): { days: number[]; withoutStart: number } {
  let withoutStart = 0;
  const days = doneInWindow(tasks, windowDays, now).map(t => {
    const start = startedAt(histories.get(t.id) ?? []);
    if (!start) withoutStart += 1;
    return Math.max(0, (t.completedAt.getTime() - (start ?? t.createdAt).getTime()) / DAY);
  });
  return { days, withoutStart };
}

export type LeadStats = { count: number; median: number | null; p85: number | null };
export type CycleStats = LeadStats & { withoutStart: number };

/** Lead time: días entre la creación y el cierre de las tareas terminadas en los últimos `windowDays`. */
export function leadTime(tasks: MetricTask[], windowDays: number, now = new Date()): LeadStats {
  const days = doneInWindow(tasks, windowDays, now)
    .map(t => Math.max(0, (t.completedAt.getTime() - t.createdAt.getTime()) / DAY))
    .sort((a, b) => a - b);
  return { count: days.length, median: round(percentile(days, 50)), p85: round(percentile(days, 85)) };
}

/**
 * Tiempo de ciclo real: días entre el inicio del trabajo (primer paso a en_proceso o
 * en_revision, ver startedAt) y el cierre. Las tareas sin inicio registrado usan
 * `createdAt` y se cuentan en `withoutStart`. En una reapertura cuenta el primer
 * inicio y el último cierre, así que incluye el tiempo que estuvo «hecha» entre medias.
 */
export function cycleTime(
  tasks: CycleTask[], histories: Map<string, StatusSegment[]>, windowDays: number, now = new Date(),
): CycleStats {
  const { days, withoutStart } = cycleDays(tasks, histories, windowDays, now);
  return { ...cycleSummary(days), withoutStart };
}

/** Recuento, mediana y p85 (redondeados a 1 decimal) de una lista de días sin ordenar. */
export function cycleSummary(days: number[]): LeadStats {
  const sorted = [...days].sort((a, b) => a - b);
  return { count: sorted.length, median: round(percentile(sorted, 50)), p85: round(percentile(sorted, 85)) };
}

const WIP_STATUSES: ReadonlySet<string> = new Set(['en_proceso', 'en_revision', 'bloqueada']);

/** ¿La tarea es trabajo en curso (en progreso, en revisión o bloqueada)? */
export function isWip(status: string): boolean {
  return WIP_STATUSES.has(status);
}

export type WipAgingRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  responsibleName: string;
  days: number;
  aged: boolean;
  withoutStart: boolean;
};

/**
 * Antigüedad del trabajo en curso: días desde el inicio (o desde la creación si no
 * hay inicio registrado), de más a menos antigua. Una tarea está «envejecida» si
 * supera estrictamente el p85 del ciclo de los últimos 60 días.
 */
export function wipAging(tasks: MetricTask[], histories: Map<string, StatusSegment[]>, now = new Date()): WipAgingRow[] {
  const threshold = cycleTime(tasks, histories, 60, now).p85;
  return tasks
    .filter(t => isWip(t.status))
    .map(t => {
      const start = startedAt(histories.get(t.id) ?? []);
      const days = round(Math.max(0, (now.getTime() - (start ?? t.createdAt).getTime()) / DAY))!;
      return {
        id: t.id,
        number: t.number,
        title: t.title,
        status: t.status,
        responsibleName: t.responsibleName,
        days,
        aged: threshold !== null && days > threshold,
        withoutStart: start === null,
      };
    })
    .sort((a, b) => b.days - a.days);
}

export type WipRow = { personId: string; name: string; inProgress: number; inReview: number; blocked: number };

/** Trabajo abierto por persona. Ordenado de más a menos carga. */
export function workInProgress(tasks: MetricTask[]): WipRow[] {
  const by = new Map<string, WipRow>();
  for (const t of tasks) {
    if (t.status === 'completada' || t.status === 'no_iniciada') continue;
    const row = by.get(t.responsibleId) ?? { personId: t.responsibleId, name: t.responsibleName, inProgress: 0, inReview: 0, blocked: 0 };
    if (t.status === 'en_proceso') row.inProgress += 1;
    else if (t.status === 'en_revision') row.inReview += 1;
    else if (t.status === 'bloqueada') row.blocked += 1;
    by.set(t.responsibleId, row);
  }
  return [...by.values()].sort((a, b) => (b.inProgress + b.inReview + b.blocked) - (a.inProgress + a.inReview + a.blocked));
}

export function blockersByArea(tasks: MetricTask[]): { area: string; count: number }[] {
  const by = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'bloqueada') continue;
    const area = t.blockedByArea ?? 'otro';
    by.set(area, (by.get(area) ?? 0) + 1);
  }
  return [...by.entries()].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count);
}

/** Cuántas tareas terminadas hay por tipo en los últimos `windowDays`. */
export function doneByKind(tasks: MetricTask[], windowDays: number, now = new Date()): { kind: string; count: number }[] {
  const since = now.getTime() - windowDays * DAY;
  const by = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'completada' || !t.completedAt || t.completedAt.getTime() < since) continue;
    by.set(t.kind, (by.get(t.kind) ?? 0) + 1);
  }
  return [...by.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}
