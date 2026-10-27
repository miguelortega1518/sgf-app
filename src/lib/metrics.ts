// Métricas de entrega del equipo. Funciones puras: reciben filas y devuelven números.

export type MetricTask = {
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

export type CycleStats = { count: number; median: number | null; p85: number | null };

/** Días entre la creación y el cierre de las tareas terminadas en los últimos `windowDays`. */
export function cycleTime(tasks: MetricTask[], windowDays: number, now = new Date()): CycleStats {
  const since = now.getTime() - windowDays * DAY;
  const days = tasks
    .filter(t => t.status === 'completada' && t.completedAt && t.completedAt.getTime() >= since)
    .map(t => Math.max(0, (t.completedAt!.getTime() - t.createdAt.getTime()) / DAY))
    .sort((a, b) => a - b);
  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return { count: days.length, median: round(percentile(days, 50)), p85: round(percentile(days, 85)) };
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
