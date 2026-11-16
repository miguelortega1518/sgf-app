import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PullRequestPanel } from '../src/components/tasks/pull-request-panel';
import type { PullRequestView } from '../src/lib/github-pull-request';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function pr(overrides: Partial<PullRequestView> = {}): PullRequestView {
  return {
    url: 'https://github.com/forja/app/pull/7',
    number: 7,
    title: 'Filtros guardados',
    state: 'abierto',
    authorLogin: 'ana',
    openedAt: '2026-11-15T12:00:00.000Z',
    readyAt: null,
    mergedAt: null,
    closedAt: null,
    firstReviewAt: null,
    reviewers: [],
    checks: null,
    ...overrides,
  };
}

function render(value: PullRequestView | null) {
  return renderToStaticMarkup(createElement(PullRequestPanel, { pr: value, now: NOW }));
}

describe('PullRequestPanel', () => {
  it('sin PR no renderiza nada', () => {
    expect(render(null)).toBe('');
  });

  it('enlaza el título y el número en una pestaña nueva con rel=noopener noreferrer', () => {
    const html = render(pr());
    expect(html).toContain('href="https://github.com/forja/app/pull/7"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Filtros guardados');
    expect(html).toContain('#7');
  });

  it('borrador: chip «Borrador» y sin contar tiempo', () => {
    const html = render(pr({ state: 'borrador' }));
    expect(html).toContain('Borrador');
    expect(html).not.toContain('Sin revisión desde hace');
    expect(html).not.toContain('Primera revisión en');
  });

  it('abierto sin revisión: «Sin revisión desde hace 1 d» y «Sin checks»', () => {
    const html = render(pr({ reviewers: [{ login: 'luis', state: 'pendiente' }] }));
    expect(html).toContain('Abierto');
    expect(html).toContain('Sin revisión desde hace 1 d');
    expect(html).toContain('luis');
    expect(html).toContain('Pendiente');
    expect(html).toContain('Sin checks');
  });

  it('aprobado con checks fallando', () => {
    const html = render(pr({
      firstReviewAt: '2026-11-15T14:15:00.000Z',
      reviewers: [{ login: 'luis', state: 'aprobado' }],
      checks: { sha: 'abc', total: 4, success: 3, failure: 1, pending: 0, updatedAt: NOW.toISOString() },
    }));
    expect(html).toContain('Aprobado');
    expect(html).toContain('3/4 en verde · 1 fallando');
    expect(html).toContain('Primera revisión en 2 h 15 min');
  });

  it('checks sólo pendientes', () => {
    const html = render(pr({ checks: { sha: 'abc', total: 2, success: 0, failure: 0, pending: 2, updatedAt: NOW.toISOString() } }));
    expect(html).toContain('2 pendientes');
  });

  it('fusionado: chip «Fusionado» y sin espera', () => {
    const html = render(pr({ state: 'fusionado', mergedAt: '2026-11-16T10:00:00.000Z', closedAt: '2026-11-16T10:00:00.000Z' }));
    expect(html).toContain('Fusionado');
    expect(html).not.toContain('Sin revisión desde hace');
  });

  it('cerrado: chip «Cerrado»', () => {
    expect(render(pr({ state: 'cerrado' }))).toContain('Cerrado');
  });
});
