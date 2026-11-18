import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WipColumnCount, wipAriaSuffix } from '../src/components/tasks/wip-column-count';

const render = (count: number, limit: number | null) =>
  renderToStaticMarkup(createElement(WipColumnCount, { count, limit }));

describe('WipColumnCount', () => {
  it('sin límite muestra sólo el número', () => {
    const html = render(3, null);
    expect(html).toMatch(/^<span[^>]*>3<\/span>$/);
    expect(html).not.toMatch(/\d\/\d/);
    expect(html).not.toContain('data-wip-state');
  });

  it('por debajo del límite: 3/4 en tono neutro', () => {
    const html = render(3, 4);
    expect(html).toContain('data-wip-state="under"');
    expect(html).toContain('3/4');
    expect(html).not.toContain('amber');
    expect(html).not.toContain('red');
  });

  it('en el límite: 4/4 en ámbar con aviso «alcanzado»', () => {
    const html = render(4, 4);
    expect(html).toContain('data-wip-state="at"');
    expect(html).toContain('4/4');
    expect(html).toContain('bg-amber-100');
    expect(html).toContain('text-amber-800');
    expect(html).toContain('Límite de trabajo en curso alcanzado (4)');
  });

  it('por encima del límite: 5/4 en rojo con aviso «superado: 5 de 4»', () => {
    const html = render(5, 4);
    expect(html).toContain('data-wip-state="over"');
    expect(html).toContain('5/4');
    expect(html).toContain('bg-red-100');
    expect(html).toContain('text-red-700');
    expect(html).toContain('Límite de trabajo en curso superado: 5 de 4');
  });
});

describe('wipAriaSuffix', () => {
  it('sólo añade texto si se alcanza o supera el límite', () => {
    expect(wipAriaSuffix(3, null)).toBe('');
    expect(wipAriaSuffix(3, 4)).toBe('');
    expect(wipAriaSuffix(4, 4)).toBe('. Límite de trabajo en curso alcanzado (4)');
    expect(wipAriaSuffix(5, 4)).toBe('. Límite de trabajo en curso superado: 5 de 4');
  });
});
