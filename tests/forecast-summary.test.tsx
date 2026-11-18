import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ForecastSummary, type ForecastSummaryProps } from '../src/components/forecast/forecast-summary';
import type { Forecast } from '../src/lib/forecast';

const forecast: Forecast = {
  kind: 'forecast',
  remaining: 12,
  p50: '2026-11-10',
  p70: '2026-11-12',
  p85: '2026-11-15',
  probability: 0.7,
  targetDate: '2026-11-12',
};

function render(overrides: Partial<ForecastSummaryProps> = {}) {
  return renderToStaticMarkup(createElement(ForecastSummary, {
    forecast,
    backtest: { hits: 8, total: 10, enough: true },
    today: '2026-11-01',
    ...overrides,
  }));
}

describe('ForecastSummary', () => {
  it('con pronóstico muestra la probabilidad, la fecha al 85 % y el rango completo', () => {
    const html = render();
    expect(html).toContain('Probabilidad de llegar al 12 nov: 70 %. Fecha al 85 %: 15 nov');
    expect(html).toContain('Rango: 50 % 10 nov · 70 % 12 nov · 85 % 15 nov');
  });

  it('añade el año a las fechas de otro año y redondea la probabilidad', () => {
    const html = render({
      forecast: { ...forecast, p50: '2026-12-28', p70: '2027-01-02', p85: '2027-01-05', probability: 0.1234, targetDate: '2026-12-31' },
    });
    expect(html).toContain('Probabilidad de llegar al 31 dic: 12 %. Fecha al 85 %: 5 ene 2027');
    expect(html).toContain('Rango: 50 % 28 dic · 70 % 2 ene 2027 · 85 % 5 ene 2027');
  });

  it('con validación suficiente muestra el acierto hacia atrás', () => {
    expect(render()).toContain('Acierto hacia atrás: 8 de 10 dentro del rango del 85 %');
  });

  it('con validación insuficiente lo indica', () => {
    const html = render({ backtest: { hits: 2, total: 3, enough: false } });
    expect(html).toContain('Acierto hacia atrás: sin casos suficientes (3 de 5)');
    expect(html).not.toContain('2 de 3');
  });

  it('con pocas tareas muestra el aviso de historial sin porcentajes ni fechas', () => {
    const html = render({ forecast: { kind: 'insufficient', closedTasks: 9, historyWeeks: 6 } });
    expect(html).toContain('Pronóstico disponible cuando haya más historial (9 de 15 tareas)');
    expect(html).not.toContain('%');
    expect(html).not.toContain('nov');
    expect(html).not.toContain('Acierto');
  });

  it('con tareas suficientes pero pocas semanas muestra las semanas', () => {
    const html = render({ forecast: { kind: 'insufficient', closedTasks: 20, historyWeeks: 2 } });
    expect(html).toContain('Pronóstico disponible cuando haya más historial (2 de 4 semanas)');
    expect(html).not.toContain('%');
  });

  it('sin throughput reciente', () => {
    const html = render({ forecast: { kind: 'no_throughput' } });
    expect(html).toContain('Sin tareas cerradas en las últimas 8 semanas: no hay pronóstico');
    expect(html).not.toContain('%');
  });

  it('con todo terminado', () => {
    const html = render({ forecast: { kind: 'done' } });
    expect(html).toContain('Todo el trabajo está terminado');
    expect(html).not.toContain('%');
  });
});
