import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WipLimitsForm, normalizeWipInput } from '../src/components/tasks/wip-limits-form';

const render = (initial: { en_proceso: number | null; en_revision: number | null }) =>
  renderToStaticMarkup(createElement(WipLimitsForm, { initial, onSave: () => {} }));

describe('WipLimitsForm', () => {
  it('asocia las etiquetas «En progreso» y «En code review» a inputs numéricos de 1 a 99', () => {
    const html = render({ en_proceso: 4, en_revision: null });
    expect(html).toMatch(/<label[^>]*for="wip-en_proceso"[^>]*>En progreso<\/label>/);
    expect(html).toMatch(/<label[^>]*for="wip-en_revision"[^>]*>En code review<\/label>/);
    for (const id of ['wip-en_proceso', 'wip-en_revision']) {
      const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
      expect(input).toContain('type="number"');
      expect(input).toContain('min="1"');
      expect(input).toContain('max="99"');
    }
    expect(html).toContain('Límites de trabajo en curso');
    expect(html).toContain('Guardar límites');
  });

  it('muestra los valores iniciales (vacío para null)', () => {
    const html = render({ en_proceso: 4, en_revision: null });
    expect(html).toMatch(/<input[^>]*id="wip-en_proceso"[^>]*value="4"/);
    expect(html).toMatch(/<input[^>]*id="wip-en_revision"[^>]*value=""/);
  });
});

describe('normalizeWipInput', () => {
  it('vacío es null; un entero se convierte en número', () => {
    expect(normalizeWipInput('')).toBeNull();
    expect(normalizeWipInput('  ')).toBeNull();
    expect(normalizeWipInput('4')).toBe(4);
    expect(normalizeWipInput('2.5')).toBe(2.5);
  });
});
