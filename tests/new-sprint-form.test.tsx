import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildNewSprintPayload, NewSprintForm } from '../src/components/sprints/new-sprint-form';
import { defaultSprintDates } from '../src/lib/sprints';

describe('NewSprintForm', () => {
  it('pinta nombre, inicio, fin y objetivo con las fechas por defecto (13 días después)', () => {
    const html = renderToStaticMarkup(createElement(NewSprintForm, {
      defaultDates: defaultSprintDates('2026-11-17'),
      onSubmit: () => {},
    }));

    expect(html).toContain('for="sprint-name"');
    expect(html).toMatch(/<input[^>]*id="sprint-name"[^>]*maxLength="200"/);
    expect(html).toContain('for="sprint-start"');
    expect(html).toMatch(/<input[^>]*type="date"[^>]*id="sprint-start"[^>]*value="2026-11-17"/);
    expect(html).toContain('for="sprint-end"');
    expect(html).toMatch(/<input[^>]*type="date"[^>]*id="sprint-end"[^>]*value="2026-11-30"/);
    expect(html).toContain('for="sprint-goal"');
    expect(html).toMatch(/<textarea[^>]*id="sprint-goal"[^>]*maxLength="2000"/);
    expect(html).toContain('Crear sprint');
  });
});

describe('buildNewSprintPayload', () => {
  it('recorta nombre y objetivo', () => {
    expect(buildNewSprintPayload({
      name: '  Sprint 8 ', goal: '  Cerrar filtros  ', startDate: '2026-11-17', endDate: '2026-11-30',
    })).toEqual({ name: 'Sprint 8', goal: 'Cerrar filtros', startDate: '2026-11-17', endDate: '2026-11-30' });
  });

  it('un objetivo vacío se envía como null', () => {
    expect(buildNewSprintPayload({
      name: 'Sprint 8', goal: '   ', startDate: '2026-11-17', endDate: '2026-11-30',
    })).toEqual({ name: 'Sprint 8', goal: null, startDate: '2026-11-17', endDate: '2026-11-30' });
  });
});
