import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SprintCapacityTable, type SprintCapacityTableProps } from '../src/components/sprints/sprint-capacity-table';
import type { CapacityRow } from '../src/lib/sprint-capacity';

function row(overrides: Partial<CapacityRow> = {}): CapacityRow {
  return {
    personId: crypto.randomUUID(), name: 'Ana', points: 8, isDefault: false, assigned: 5, overloaded: false,
    ...overrides,
  };
}

function render(overrides: Partial<SprintCapacityTableProps> = {}) {
  return renderToStaticMarkup(createElement(SprintCapacityTable, {
    sprintName: 'Sprint 4',
    rows: [],
    canEdit: false,
    onSave: () => {},
    ...overrides,
  }));
}

describe('SprintCapacityTable', () => {
  it('muestra nombre, capacidad y asignado en una tabla con cabeceras', () => {
    const html = render({ rows: [row({ name: 'Ana', points: 8, assigned: 5 })] });
    expect(html).toContain('<table');
    expect(html).toContain('Persona');
    expect(html).toContain('Capacidad');
    expect(html).toContain('Asignado');
    expect(html).toContain('Ana');
    expect(html).toContain('8 puntos');
    expect(html).toContain('5 puntos');
    expect(html).not.toContain('Supera su capacidad');
  });

  it('aviso «Supera su capacidad en 3 puntos» cuando overloaded', () => {
    const html = render({ rows: [row({ points: 5, assigned: 8, overloaded: true })] });
    expect(html).toContain('Supera su capacidad en 3 puntos');
  });

  it('aviso en singular «en 1 punto»', () => {
    const html = render({ rows: [row({ points: 5, assigned: 6, overloaded: true })] });
    expect(html).toContain('Supera su capacidad en 1 punto<');
    expect(html).not.toContain('1 puntos');
  });

  it('el asignado y la capacidad concuerdan en singular', () => {
    const html = render({ rows: [row({ points: 1, assigned: 1 })] });
    expect(html).toContain('1 punto<');
    expect(html).not.toContain('1 puntos');
  });

  it('capacidad vacía → «Sin datos» y nunca aviso', () => {
    const html = render({ rows: [row({ points: null, isDefault: true, assigned: 20, overloaded: false })] });
    expect(html).toContain('Sin datos');
    expect(html).not.toContain('Supera su capacidad');
  });

  it('la capacidad por defecto se marca como «(media de los últimos sprints)»', () => {
    const def = render({ rows: [row({ points: 10, isDefault: true })] });
    expect(def).toContain('(media de los últimos sprints)');
    const saved = render({ rows: [row({ points: 10, isDefault: false })] });
    expect(saved).not.toContain('(media de los últimos sprints)');
  });

  it('sin canEdit no hay campos editables', () => {
    const html = render({ rows: [row()] });
    expect(html).not.toContain('<input');
  });

  it('con canEdit la capacidad es un campo numérico 0..999 con etiqueta accesible', () => {
    const html = render({ canEdit: true, rows: [row({ name: 'Ana', points: 8 })] });
    expect(html).toMatch(/<input[^>]*type="number"/);
    expect(html).toMatch(/<input[^>]*min="0"/);
    expect(html).toMatch(/<input[^>]*max="999"/);
    expect(html).toMatch(/<input[^>]*aria-label="Capacidad de Ana en Sprint 4"/);
    expect(html).toMatch(/<input[^>]*value="8"/);
  });

  it('con canEdit y capacidad vacía el campo queda vacío con «Sin datos» de ayuda', () => {
    const html = render({ canEdit: true, rows: [row({ points: null, isDefault: true })] });
    expect(html).toMatch(/<input[^>]*placeholder="Sin datos"/);
    expect(html).toMatch(/<input[^>]*value=""/);
  });

  it('sin filas muestra un texto vacío', () => {
    const html = render({ rows: [] });
    expect(html).toContain('No hay personas en este proyecto');
  });
});
