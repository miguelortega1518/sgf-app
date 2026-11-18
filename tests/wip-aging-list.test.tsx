import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WipAgingList, CycleTimeSummary } from '../src/components/dashboard/wip-aging-list';
import { STATUS_LABEL } from '../src/lib/labels';

type Item = Parameters<typeof WipAgingList>[0]['items'][number];

const item = (over: Partial<Item>): Item => ({
  id: 'id-1', number: 1, title: 'Tarea', status: 'en_proceso', responsibleName: 'Ana', days: 1, aged: false, withoutStart: false, ...over,
});

const renderList = (items: Item[], total = items.length) => renderToStaticMarkup(createElement(WipAgingList, { items, total }));
const count = (html: string, s: string) => html.split(s).length - 1;

describe('WipAgingList', () => {
  it('pinta una fila por tarea con enlace, clave, título, estado y días', () => {
    const html = renderList([
      item({ id: 'aaa', number: 12, title: 'Migrar pagos', status: 'en_revision', days: 3, aged: true }),
      item({ id: 'bbb', number: 7, title: 'Arreglar login', status: 'bloqueada', days: 1 }),
    ]);
    expect(html).toContain('href="/tareas/aaa"');
    expect(html).toContain('href="/tareas/bbb"');
    expect(html).toContain('FOR-12');
    expect(html).toContain('FOR-7');
    expect(html).toContain('Migrar pagos');
    expect(html).toContain('Arreglar login');
    expect(html).toContain(STATUS_LABEL.en_revision);
    expect(html).toContain(STATUS_LABEL.bloqueada);
    expect(html).toContain('3 días');
    expect(html).toContain('1 día');
    expect(html).not.toContain('1 días');
    expect(count(html, 'Envejecida')).toBe(1);
  });

  it('muestra un texto vacío sin tareas', () => {
    expect(renderList([])).toContain('Nada en curso ahora mismo.');
  });

  it('renderiza como mucho 10 filas', () => {
    const items = Array.from({ length: 12 }, (_, i) => item({ id: `t${i}`, number: i + 1 }));
    const html = renderList(items, 12);
    expect(count(html, 'href="/tareas/')).toBe(10);
    expect(html).toContain('10 de 12');
  });
});

describe('CycleTimeSummary', () => {
  const lead = { count: 3, median: 9, p85: 20 };

  it('muestra mediana y p85 del ciclo y la línea de lead time', () => {
    const html = renderToStaticMarkup(createElement(CycleTimeSummary, {
      cycle: { count: 3, median: 2.5, p85: 6, withoutStart: 0 }, lead, openTasks: 4,
    }));
    expect(html).toContain('2.5');
    expect(html).toContain('≤ 6');
    expect(html).toMatch(/Lead time[^<]*/);
    expect(html).toContain('mediana 9 días');
    expect(html).toContain('p85 20 días');
    expect(html).not.toContain('sin inicio registrado');
    expect(html).toContain('3 tareas terminadas · 4 abiertas');
  });

  it('concuerda singular y plural en la nota de tareas sin inicio', () => {
    const one = renderToStaticMarkup(createElement(CycleTimeSummary, {
      cycle: { count: 1, median: 1, p85: 1, withoutStart: 1 }, lead: { count: 1, median: 1, p85: 1 }, openTasks: 1,
    }));
    expect(one).toContain('1 tarea sin inicio registrado');
    expect(one).toContain('1 tarea terminada · 1 abierta');
    expect(one).toContain('mediana 1 día');
    const many = renderToStaticMarkup(createElement(CycleTimeSummary, {
      cycle: { count: 3, median: 1, p85: 1, withoutStart: 2 }, lead, openTasks: 0,
    }));
    expect(many).toContain('2 tareas sin inicio registrado');
  });

  it('sin tareas terminadas muestra el texto vacío', () => {
    const html = renderToStaticMarkup(createElement(CycleTimeSummary, {
      cycle: { count: 0, median: null, p85: null, withoutStart: 0 }, lead: { count: 0, median: null, p85: null }, openTasks: 2,
    }));
    expect(html).toContain('Aún no hay tareas terminadas en este periodo.');
    expect(html).toContain('0 tareas terminadas · 2 abiertas');
  });
});
