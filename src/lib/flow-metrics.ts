// Métricas de flujo: diagrama de flujo acumulado (CFD) e histograma del tiempo de
// ciclo. Funciones puras, sin BD ni React: reciben las tareas, sus historiales
// (buildStatusHistory) y `now`. La carga de datos está en src/app/api/metrics/flow.

import { STATUS_ORDER, type TaskStatus } from '@/lib/labels';
import { cycleDays, cycleSummary } from '@/lib/metrics';
import { buildStatusHistory, type StatusSegment } from '@/lib/status-history';
import { shiftDateRD, toDateRD } from '@/lib/date-utils';

export type FlowTask = { id: string; status: string; createdAt: Date; completedAt: Date | null };

export type CfdEntry = { date: string; counts: Record<TaskStatus, number>; total: number };

/**
 * Desfase fijo de RD respecto a UTC (−04:00). America/Santo_Domingo no tiene
 * horario de verano, así que el final de un día RD es siempre las 03:59:59.999Z
 * del día siguiente. Si eso cambiara habría que calcularlo con Intl.
 */
const RD_OFFSET_HOURS = 4;

/** Instante final (23:59:59.999 −04:00) del día RD `date` (YYYY-MM-DD). */
export function rdDayEnd(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, RD_OFFSET_HOURS) - 1);
}

/** Instante inicial (00:00 −04:00) del día RD `date`. */
function rdDayStart(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, RD_OFFSET_HOURS));
}

/** Estado del tramo que contiene `at`, o null si `at` es anterior a la creación. */
export function statusAt(history: StatusSegment[], at: Date): TaskStatus | null {
  const ms = at.getTime();
  const seg = history.find(s => s.from.getTime() <= ms && (s.to === null || ms < s.to.getTime()));
  return seg ? seg.status : null;
}

const VALID_STATUS: ReadonlySet<string> = new Set(STATUS_ORDER);

/**
 * Reconcilia un historial incompleto con el estado actual de la tarea. Las tareas
 * antiguas o de semilla pueden no tener eventos 'status_changed' en audit_log, y
 * entonces el último tramo no coincide con `task.status`. Es una aproximación: en
 * datos heredados el CFD puede mostrar transiciones «instantáneas».
 * - Completada con `completedAt`: pasa a 'completada' desde `completedAt`.
 * - Si no: se sustituye el estado del último tramo (se usa su `from`).
 */
export function reconcileHistory(task: FlowTask, history: StatusSegment[]): StatusSegment[] {
  const last = history.at(-1);
  if (!last || last.status === task.status || !VALID_STATUS.has(task.status)) return history;
  const status = task.status as TaskStatus;

  if (status === 'completada' && task.completedAt) {
    const cut = task.completedAt.getTime();
    const out: StatusSegment[] = [];
    for (const s of history) {
      if (s.from.getTime() >= cut) break;
      out.push({ ...s, to: s.to === null || s.to.getTime() > cut ? task.completedAt : s.to });
    }
    if (out.length === 0) return [{ status, from: history[0].from, to: null }];
    return mergeTail(out, { status, from: task.completedAt, to: null });
  }

  return mergeTail(history.slice(0, -1).map(s => ({ ...s })), { status, from: last.from, to: null });
}

// Añade `seg` al final fusionándolo con el tramo anterior si tiene el mismo estado.
function mergeTail(segments: StatusSegment[], seg: StatusSegment): StatusSegment[] {
  const prev = segments.at(-1);
  if (prev && prev.status === seg.status) prev.to = seg.to;
  else segments.push(seg);
  return segments;
}

const emptyCounts = (): Record<TaskStatus, number> =>
  Object.fromEntries(STATUS_ORDER.map(s => [s, 0])) as Record<TaskStatus, number>;

/**
 * Recuento diario por estado de los últimos `days` días RD, del más antiguo a hoy.
 * El corte de cada día es su final en RD; el de hoy, `now`. Una tarea cuenta si
 * `createdAt <= corte`, en el estado del tramo que contiene el corte. Las tareas
 * completadas antes del inicio de la ventana cuentan como 'completada' todos los
 * días, sin necesidad de historial. O(days × tareas).
 */
export function cumulativeFlow(
  tasks: FlowTask[], histories: Map<string, StatusSegment[]>, days: number, now: Date,
): CfdEntry[] {
  const today = toDateRD(now);
  const dates = Array.from({ length: days }, (_, i) => shiftDateRD(today, i - (days - 1)));
  const cutoffs = dates.map((date, i) => (i === dates.length - 1 ? now : rdDayEnd(date)).getTime());
  const windowStart = dates.length > 0 ? rdDayStart(dates[0]).getTime() : now.getTime();

  const entries: CfdEntry[] = dates.map(date => ({ date, counts: emptyCounts(), total: 0 }));

  for (const task of tasks) {
    const createdMs = task.createdAt.getTime();
    if (task.status === 'completada' && task.completedAt && task.completedAt.getTime() < windowStart) {
      for (let i = 0; i < entries.length; i++) {
        if (createdMs <= cutoffs[i]) entries[i].counts.completada += 1;
      }
      continue;
    }
    const history = reconcileHistory(task, histories.get(task.id) ?? buildStatusHistory(task, []));
    for (let i = 0; i < entries.length; i++) {
      if (createdMs > cutoffs[i]) continue;
      const status = statusAt(history, new Date(cutoffs[i]));
      if (status) entries[i].counts[status] += 1;
    }
  }

  for (const e of entries) e.total = STATUS_ORDER.reduce((s, k) => s + e.counts[k], 0);
  return entries;
}

export type CycleBucket = { label: string; from: number; to: number | null };

/** Cubos del histograma de ciclo, en días: límite inferior inclusivo y superior exclusivo. */
export const CYCLE_BUCKETS: readonly CycleBucket[] = [
  { label: '0–1', from: 0, to: 1 },
  { label: '1–2', from: 1, to: 2 },
  { label: '2–3', from: 2, to: 3 },
  { label: '3–5', from: 3, to: 5 },
  { label: '5–8', from: 5, to: 8 },
  { label: '8–13', from: 8, to: 13 },
  { label: '13+', from: 13, to: null },
];

export type CycleHistogram = {
  buckets: (CycleBucket & { count: number })[];
  count: number;
  median: number | null;
  p85: number | null;
  withoutStart: number;
};

function bucketIndex(value: number): number {
  const idx = CYCLE_BUCKETS.findIndex(b => b.to === null || value < b.to);
  return idx === -1 ? CYCLE_BUCKETS.length - 1 : idx;
}

/**
 * Histograma del tiempo de ciclo real de las tareas terminadas en los últimos
 * `windowDays`. count, median, p85 y withoutStart salen de la misma lógica que
 * cycleTime() (cycleDays + cycleSummary): mediana y p85, nunca promedios.
 */
export function cycleTimeHistogram(
  tasks: FlowTask[], histories: Map<string, StatusSegment[]>, windowDays = 60, now = new Date(),
): CycleHistogram {
  const { days, withoutStart } = cycleDays(tasks, histories, windowDays, now);
  const buckets = CYCLE_BUCKETS.map(b => ({ ...b, count: 0 }));
  for (const d of days) buckets[bucketIndex(d)].count += 1;
  return { buckets, ...cycleSummary(days), withoutStart };
}

/**
 * Posición continua (0 a 7) de una línea de mediana o p85 sobre el eje de cubos:
 * índice del cubo + fracción dentro de él. El cubo abierto '13+' se dibuja como si
 * abarcara 13 días: 6 + min(1, (v − 13) / 13).
 */
export function histogramMarkerPosition(value: number): number {
  const v = Math.max(0, value);
  const idx = bucketIndex(v);
  const b = CYCLE_BUCKETS[idx];
  if (b.to === null) return idx + Math.min(1, (v - b.from) / b.from);
  return idx + (v - b.from) / (b.to - b.from);
}
