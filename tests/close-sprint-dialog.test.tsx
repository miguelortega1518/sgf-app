import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CloseSprintDialog, type CloseSprintDialogProps } from '../src/components/sprints/close-sprint-dialog';

const nextId = '0b6f6c1e-6c1d-4b8e-9d55-2f0f3c0a9a11';

/** Etiqueta <input type="radio"> con ese value (el orden de atributos no importa). */
function radio(html: string, value: string): string | undefined {
  return html.match(/<input[^>]*type="radio"[^>]*\/?>/g)?.find(tag => tag.includes(`value="${value}"`));
}

function render(overrides: Partial<CloseSprintDialogProps> = {}) {
  return renderToStaticMarkup(createElement(CloseSprintDialog, {
    sprintName: 'Sprint 3',
    pending: { tasks: 2, points: 5 },
    nextPlanned: { id: nextId, name: 'Sprint 4' },
    onConfirm: () => {},
    onCancel: () => {},
    ...overrides,
  }));
}

describe('CloseSprintDialog', () => {
  it('es un diálogo accesible con título y botones Cancelar / Cerrar sprint', () => {
    const html = render();
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain('Cerrar «Sprint 3»');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Cancelar<\/button>/);
    expect(html).toMatch(/<button[^>]*>Cerrar sprint<\/button>/);
  });

  it('con pendientes indica cuántas tareas y puntos quedan (plural)', () => {
    const html = render({ pending: { tasks: 2, points: 5 } });
    expect(html).toContain('Quedan 2 tareas sin completar (5 puntos)');
  });

  it('con 1 pendiente y 1 punto concuerda en singular', () => {
    const html = render({ pending: { tasks: 1, points: 1 } });
    expect(html).toContain('Queda 1 tarea sin completar (1 punto)');
    expect(html).not.toContain('1 tareas');
    expect(html).not.toContain('1 puntos');
  });

  it('ofrece el siguiente planificado (marcado por defecto) y el backlog, con label', () => {
    const html = render();
    expect(html).toContain('Al siguiente sprint planificado (Sprint 4)');
    expect(html).toContain('Al backlog');
    expect(radio(html, nextId)).toContain('checked=""');
    expect(radio(html, 'backlog')).toBeDefined();
    expect(radio(html, 'backlog')).not.toContain('checked');
    expect(html.match(/<label/g)?.length).toBe(2);
  });

  it('sin sprint planificado sólo ofrece el backlog', () => {
    const html = render({ nextPlanned: null });
    expect(html).not.toContain('Al siguiente sprint planificado');
    expect(html).toContain('Al backlog');
    expect(radio(html, 'backlog')).toContain('checked=""');
  });

  it('sin pendientes sólo pide confirmar', () => {
    const html = render({ pending: { tasks: 0, points: 0 } });
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('Quedan');
    expect(html).toContain('Todas las tareas del sprint están completadas');
    expect(html).toContain('Cerrar sprint');
  });
});
