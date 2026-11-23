import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WipByPersonTable, PersonLoadCard } from '../src/components/dashboard/person-workload';
import { DeliveryMetricsView, type Metrics } from '../src/components/dashboard/delivery-metrics';
import { PanoramaKpis, type DashboardData } from '../src/components/dashboard/panorama-kpis';
import type { PersonLoadRow, WipRow } from '../src/lib/metrics';

const wip: WipRow[] = [
  { personId: 'z', name: 'Zoe', inProgress: 3, inReview: 1, blocked: 1 },
  { personId: 'a', name: 'Ana', inProgress: 1, inReview: 0, blocked: 0 },
];

const load: PersonLoadRow[] = [
  { personId: 'z', name: 'Zoe', open: 4, overdue: 1, completed: 0, total: 4 },
  { personId: 'b', name: 'Beto', open: 1, overdue: 2, completed: 9, total: 10 },
];

const metrics: Metrics = {
  velocity: [{ start: '2026-10-26', tasks: 1, points: 3 }],
  averagePointsPerWeek: 3,
  cycleTime: { count: 0, median: null, p85: null, withoutStart: 0 },
  leadTime: { count: 0, median: null, p85: null },
  wipAging: [],
  wipAgingTotal: 0,
  blockers: [],
  doneByKind: [],
  openTasks: 5,
};

const dashboard: DashboardData = {
  totals: { total: 14, completed: 9, overdue: 3, blocked: 1, completionRate: 64 },
  byStatus: [{ status: 'completada', label: 'Completada', count: 9, color: '#10B981' }],
  byCompany: [{ companyName: 'Acme', total: 14, completed: 9, overdue: 3 }],
};

// Nada que sugiera posiciones o podio (en el texto visible; los colores #10B981 no cuentan).
function expectNoRanking(html: string) {
  const text = html.replace(/<[^>]*>/g, ' ');
  expect(text).not.toContain('#1');
  expect(text).not.toMatch(/(^|\s)1\.\s/);
  expect(html).not.toContain('<ol');
  expect(text).not.toContain('🥇');
  expect(text).not.toContain('🏆');
  expect(text.toLowerCase()).not.toContain('ranking');
}

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('WipByPersonTable', () => {
  it('pinta las filas en el orden recibido, sin posiciones ni medallas', () => {
    const html = render(createElement(WipByPersonTable, { rows: wip }));
    expect(html.indexOf('Zoe')).toBeLessThan(html.indexOf('Ana'));
    expect(html).toContain('En progreso');
    expect(html).toContain('Code review');
    expect(html).toContain('Bloqueadas');
    expectNoRanking(html);
  });

  it('sin filas muestra el texto vacío', () => {
    expect(render(createElement(WipByPersonTable, { rows: [] }))).toContain('Nadie tiene tareas en curso.');
  });
});

describe('PersonLoadCard', () => {
  it('pinta las filas en el orden recibido, sin posiciones ni medallas', () => {
    const html = render(createElement(PersonLoadCard, { rows: load }));
    expect(html).toContain('Por persona');
    expect(html.indexOf('Zoe')).toBeLessThan(html.indexOf('Beto'));
    expect(html).toContain('9/10');
    expectNoRanking(html);
  });

  it('concuerda singular y plural de las vencidas', () => {
    const html = render(createElement(PersonLoadCard, { rows: load }));
    expect(html).toContain('1 vencida');
    expect(html).toContain('2 vencidas');
  });

  it('muestra como mucho 8 personas', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...load[0], personId: `p${i}`, name: `Persona ${i}` }));
    const html = render(createElement(PersonLoadCard, { rows: many }));
    expect(html).toContain('Persona 7');
    expect(html).not.toContain('Persona 8');
  });
});

describe('DeliveryMetricsView', () => {
  it('con datos por persona muestra «Trabajo en curso por persona»', () => {
    const html = render(createElement(DeliveryMetricsView, { metrics, personWorkload: wip }));
    expect(html).toContain('Trabajo en curso por persona');
    expect(html).toContain('Zoe');
  });

  it('con null oculta la tarjeta por persona y mantiene los totales del equipo', () => {
    const html = render(createElement(DeliveryMetricsView, { metrics, personWorkload: null }));
    expect(html).not.toContain('Trabajo en curso por persona');
    expect(html).toContain('Velocidad semanal');
    expect(html).toContain('Qué está bloqueando al equipo');
    expect(html).toContain('Antigüedad del trabajo en curso');
  });
});

describe('PanoramaKpis', () => {
  it('con personLoad null no muestra «Por persona» y sí los totales', () => {
    const html = render(createElement(PanoramaKpis, { dashboard, personLoad: null }));
    expect(html).not.toContain('Por persona');
    expect(html).toContain('Cumplimiento');
    expect(html).toContain('Por estado');
    expect(html).toContain('Por repositorio');
  });

  it('con datos muestra «Por persona»', () => {
    const html = render(createElement(PanoramaKpis, { dashboard, personLoad: load }));
    expect(html).toContain('Por persona');
    expect(html).toContain('Zoe');
    expectNoRanking(html);
  });
});
