/**
 * Pronóstico Monte Carlo «sin IA» (docs/PLAN-PRODUCTO.md §5). Funciones puras, sin BD
 * ni hooks: remuestrean el throughput diario de las últimas 8 semanas y simulan cuándo
 * se termina el trabajo pendiente. El resultado es siempre un rango (50/70/85 %).
 */

import { toDateRD } from '@/lib/date-utils';
import { percentile } from '@/lib/metrics';

export const FORECAST_TRIALS = 10000;
export const THROUGHPUT_WINDOW_DAYS = 56;
export const MIN_CLOSED_TASKS = 15;
export const MIN_HISTORY_WEEKS = 4;
export const BACKTEST_MIN_CASES = 5;
/** Casos más recientes que se evalúan en la validación hacia atrás. */
export const BACKTEST_MAX_CASES = 20;
/** Tope de días por prueba: evita bucles eternos con throughput casi nulo. */
export const MAX_SIMULATION_DAYS = 3650;
/** Semilla fija en producción: el pronóstico no cambia al recargar la página. */
export const DEFAULT_SEED = 20261118;

export type ForecastTask = {
  id: string;
  status: string;
  completedAt: Date | string | null;
  createdAt: Date | string;
  sprintId: string | null;
  milestoneId: string | null;
  archived?: boolean;
};

export type ForecastSprint = { id: string; status: string; startDate: string; endDate: string };

export type ForecastMilestone = {
  id: string;
  completed: boolean;
  targetDate: string;
  createdAt: Date | string;
};

export type Forecast =
  | { kind: 'insufficient'; closedTasks: number; historyWeeks: number }
  | { kind: 'no_throughput' }
  | { kind: 'done' }
  | {
      kind: 'forecast';
      remaining: number;
      p50: string;
      p70: string;
      p85: string;
      probability: number;
      targetDate: string;
    };

export type SimulationResult = Extract<Forecast, { kind: 'no_throughput' | 'done' | 'forecast' }>;

export type BacktestResult = { hits: number; total: number; enough: boolean };

export type ProjectForecast = {
  activeSprint: { id: string; forecast: Forecast } | null;
  milestones: { id: string; forecast: Forecast }[];
  backtest: BacktestResult;
};

export type Eligibility = { eligible: boolean; closedTasks: number; historyWeeks: number };

const DAY_MS = 86_400_000;

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Suma `days` días a una fecha 'YYYY-MM-DD' con aritmética Date.UTC (independiente de la TZ). */
function addDays(iso: string, days: number): string {
  const target = new Date(isoToUtc(iso) + days * DAY_MS);
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, '0');
  const day = String(target.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Días de calendario de `from` a `to` (negativo si `to` es anterior). */
function diffDays(from: string, to: string): number {
  return Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS);
}

/** PRNG determinista mulberry32: devuelve números en [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isClosed(t: ForecastTask): t is ForecastTask & { completedAt: Date | string } {
  return t.status === 'completada' && t.completedAt != null;
}

/** Fechas RD de cierre de las tareas terminadas ('completada' con completedAt). */
export function completionDates(tasks: ForecastTask[]): string[] {
  return tasks.filter(isClosed).map(t => toDateRD(t.completedAt));
}

/**
 * Cierres por día de calendario RD en los `windowDays` días que terminan el día anterior
 * a `asOf` (de asOf−windowDays a asOf−1). Los días sin cierres cuentan como 0.
 */
export function dailyThroughput(
  completionDates: string[],
  asOf: string,
  windowDays: number = THROUGHPUT_WINDOW_DAYS,
): number[] {
  const samples = new Array<number>(windowDays).fill(0);
  const start = addDays(asOf, -windowDays);
  for (const date of completionDates) {
    const idx = diffDays(start, date);
    if (idx >= 0 && idx < windowDays) samples[idx] += 1;
  }
  return samples;
}

/**
 * Umbral mínimo de datos: ≥ 15 tareas cerradas antes de `asOf` y la primera cerrada al
 * menos 4 semanas antes. Los cierres en `asOf` o después no cuentan.
 */
export function forecastEligibility(completionDates: string[], asOf: string): Eligibility {
  const past = completionDates.filter(d => d < asOf);
  if (past.length === 0) return { eligible: false, closedTasks: 0, historyWeeks: 0 };
  const first = past.reduce((min, d) => (d < min ? d : min));
  const historyDays = diffDays(first, asOf);
  return {
    eligible: past.length >= MIN_CLOSED_TASKS && historyDays >= MIN_HISTORY_WEEKS * 7,
    closedTasks: past.length,
    historyWeeks: Math.floor(historyDays / 7),
  };
}

export type SimulationInput = {
  samples: number[];
  remaining: number;
  asOf: string;
  targetDate: string;
  trials?: number;
  seed: number;
};

/**
 * Monte Carlo: en cada prueba suma, día a día desde `asOf`, muestras de throughput elegidas
 * al azar (con reemplazo) hasta alcanzar `remaining`. El fin es asOf + (días − 1).
 */
export function simulateCompletion({
  samples, remaining, asOf, targetDate, trials = FORECAST_TRIALS, seed,
}: SimulationInput): SimulationResult {
  if (remaining <= 0) return { kind: 'done' };
  const n = samples.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i];
  if (sum <= 0) return { kind: 'no_throughput' };

  const rng = createRng(seed);
  const pool = Int32Array.from(samples);
  const days = new Int32Array(trials);
  // Días máximos para terminar en la fecha objetivo (≤ 0 si el objetivo es anterior a asOf).
  const maxDaysOnTarget = diffDays(asOf, targetDate) + 1;
  let onTarget = 0;

  for (let t = 0; t < trials; t++) {
    let done = 0;
    let d = 0;
    while (done < remaining && d < MAX_SIMULATION_DAYS) {
      done += pool[(rng() * n) | 0];
      d++;
    }
    days[t] = d;
    if (d <= maxDaysOnTarget) onTarget++;
  }

  days.sort();
  const sorted = Array.from(days);
  const dateAt = (p: number) => addDays(asOf, (percentile(sorted, p) ?? 1) - 1);

  return {
    kind: 'forecast',
    remaining,
    p50: dateAt(50),
    p70: dateAt(70),
    p85: dateAt(85),
    probability: onTarget / trials,
    targetDate,
  };
}

/** Pronóstico completo para `remaining` tareas desde `asOf`, usando sólo cierres anteriores. */
export function forecastFor(
  dates: string[],
  remaining: number,
  asOf: string,
  targetDate: string,
  seed: number = DEFAULT_SEED,
): Forecast {
  if (remaining <= 0) return { kind: 'done' };
  const eligibility = forecastEligibility(dates, asOf);
  if (!eligibility.eligible) {
    return { kind: 'insufficient', closedTasks: eligibility.closedTasks, historyWeeks: eligibility.historyWeeks };
  }
  return simulateCompletion({ samples: dailyThroughput(dates, asOf), remaining, asOf, targetDate, seed });
}

type BacktestCase = { start: string; target: string; tasks: ForecastTask[] };

/**
 * Validación hacia atrás: rehace el pronóstico de cada sprint cerrado y cada hito completado
 * con asOf = su inicio (sólo cierres anteriores) y comprueba si terminó dentro del p85.
 * Usa la pertenencia actual de las tareas: no hay historial de sprintId/milestoneId.
 */
export function backtest(
  tasks: ForecastTask[],
  sprints: ForecastSprint[],
  milestones: ForecastMilestone[],
  today: string,
  seed: number = DEFAULT_SEED,
): BacktestResult {
  const live = tasks.filter(t => !t.archived);
  const dates = completionDates(live);

  const cases: BacktestCase[] = [
    ...sprints
      .filter(s => s.status === 'cerrado')
      .map(s => ({ start: s.startDate, target: s.endDate, tasks: live.filter(t => t.sprintId === s.id) })),
    ...milestones
      .filter(m => m.completed)
      .map(m => ({ start: toDateRD(m.createdAt), target: m.targetDate, tasks: live.filter(t => t.milestoneId === m.id) })),
  ]
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(-BACKTEST_MAX_CASES);

  let hits = 0;
  let total = 0;

  for (const c of cases) {
    if (c.tasks.length === 0) continue;
    const pending = c.tasks.filter(t => !(isClosed(t) && toDateRD(t.completedAt) < c.start));
    if (pending.length === 0) continue;

    // Sin fuga de datos futuros: sólo los cierres anteriores al inicio del caso.
    const past = dates.filter(d => d < c.start);
    const forecast = forecastFor(past, pending.length, c.start, c.target, seed);
    if (forecast.kind !== 'forecast') continue;

    if (c.tasks.every(isClosed)) {
      const actual = c.tasks.reduce((max, t) => {
        const d = toDateRD(t.completedAt);
        return d > max ? d : max;
      }, '');
      total++;
      if (actual <= forecast.p85) hits++;
    } else if (forecast.p85 < today) {
      total++;
    }
    // Con tareas abiertas y p85 aún por llegar, el caso está pendiente: se omite.
  }

  return { hits, total, enough: total >= BACKTEST_MIN_CASES };
}

export type ProjectForecastInput = {
  tasks: ForecastTask[];
  sprints: ForecastSprint[];
  milestones: ForecastMilestone[];
  today: string;
  seed?: number;
};

/** Pronóstico del sprint activo y de los hitos sin completar, más el acierto hacia atrás. */
export function buildProjectForecast({
  tasks, sprints, milestones, today, seed = DEFAULT_SEED,
}: ProjectForecastInput): ProjectForecast {
  const live = tasks.filter(t => !t.archived);
  const dates = completionDates(live);
  const open = live.filter(t => t.status !== 'completada');

  const active = sprints.find(s => s.status === 'activo');
  const activeSprint = active
    ? {
        id: active.id,
        forecast: forecastFor(dates, open.filter(t => t.sprintId === active.id).length, today, active.endDate, seed),
      }
    : null;

  return {
    activeSprint,
    milestones: milestones
      .filter(m => !m.completed)
      .map(m => ({
        id: m.id,
        forecast: forecastFor(dates, open.filter(t => t.milestoneId === m.id).length, today, m.targetDate, seed),
      })),
    backtest: backtest(live, sprints, milestones, today, seed),
  };
}
