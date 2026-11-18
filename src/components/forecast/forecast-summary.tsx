import { formatShortDateRD } from '@/lib/date-utils';
import {
  BACKTEST_MIN_CASES,
  MIN_CLOSED_TASKS,
  MIN_HISTORY_WEEKS,
  type BacktestResult,
  type Forecast,
} from '@/lib/forecast';

export type ForecastSummaryProps = {
  forecast: Forecast;
  backtest: BacktestResult;
  /** Hoy en RD ('YYYY-MM-DD'): decide si las fechas llevan año. */
  today: string;
};

function percent(p: number): string {
  return `${Math.round(p * 100)} %`;
}

function message(forecast: Exclude<Forecast, { kind: 'forecast' }>): string {
  switch (forecast.kind) {
    case 'insufficient':
      return forecast.closedTasks < MIN_CLOSED_TASKS
        ? `Pronóstico disponible cuando haya más historial (${forecast.closedTasks} de ${MIN_CLOSED_TASKS} tareas)`
        : `Pronóstico disponible cuando haya más historial (${forecast.historyWeeks} de ${MIN_HISTORY_WEEKS} semanas)`;
    case 'no_throughput':
      return 'Sin tareas cerradas en las últimas 8 semanas: no hay pronóstico';
    case 'done':
      return 'Todo el trabajo está terminado';
  }
}

/**
 * Pronóstico Monte Carlo de un sprint o hito (presentación pura, sin hooks ni fetch).
 * Siempre muestra el rango completo y, junto a él, el acierto de la validación hacia atrás.
 */
export function ForecastSummary({ forecast, backtest, today }: ForecastSummaryProps) {
  if (forecast.kind !== 'forecast') {
    return <p className="mt-2 text-xs text-[var(--text-muted)]">{message(forecast)}</p>;
  }

  const short = (date: string) => formatShortDateRD(date, today);
  const accuracy = backtest.enough
    ? `Acierto hacia atrás: ${backtest.hits} de ${backtest.total} dentro del rango del 85 %`
    : `Acierto hacia atrás: sin casos suficientes (${backtest.total} de ${BACKTEST_MIN_CASES})`;

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      <span className="text-[var(--text-secondary)]">
        {`Probabilidad de llegar al ${short(forecast.targetDate)}: ${percent(forecast.probability)}. Fecha al 85 %: ${short(forecast.p85)}`}
      </span>
      <span className="text-[var(--text-muted)]">
        {`Rango: 50 % ${short(forecast.p50)} · 70 % ${short(forecast.p70)} · 85 % ${short(forecast.p85)}`}
      </span>
      <span className="text-[var(--text-muted)]">{accuracy}</span>
    </div>
  );
}
