import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuditLogDetail, TaskAuditDetail } from '../src/components/audit/audit-entry-detail';

type Props = { previousValue: string | null; newValue: string | null; reason: string | null };

const renderLog = (props: Props) => renderToStaticMarkup(createElement(AuditLogDetail, props));
const renderTask = (props: Props) => renderToStaticMarkup(createElement(TaskAuditDetail, props));

const spanCount = (html: string) => (html.match(/<span/g) || []).length;

describe('AuditLogDetail', () => {
  it('shows the change and the reason when both exist (moderated comment)', () => {
    const html = renderLog({ previousValue: 'a', newValue: 'b', reason: 'Moderado por admin' });
    expect(html).toContain('a → b');
    expect(html).toContain('Moderado por admin');
  });

  it('shows only the reason when there is no complete change', () => {
    const html = renderLog({ previousValue: null, newValue: null, reason: 'Retraso' });
    expect(html).toContain('Retraso');
    expect(html).not.toContain('→');
  });

  it('shows only the change when there is no reason', () => {
    const html = renderLog({ previousValue: 'a', newValue: 'b', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">a → b</span>');
    expect(spanCount(html)).toBe(1);
  });

  it('treats an empty reason like no reason', () => {
    const html = renderLog({ previousValue: 'a', newValue: 'b', reason: '' });
    expect(spanCount(html)).toBe(1);
  });

  it('shows a dash when there is nothing', () => {
    const html = renderLog({ previousValue: null, newValue: null, reason: null });
    expect(html).toContain('—');
    expect(html).toBe('<span class="text-xs text-gray-300">—</span>');
  });

  it('translates a delay reason code without a change', () => {
    const html = renderLog({ previousValue: null, newValue: null, reason: 'otro' });
    expect(html).toContain('>Otro<');
    expect(html).not.toContain('>otro<');
  });

  it('translates a delay reason code with a change', () => {
    const html = renderLog({ previousValue: 'en_proceso', newValue: 'completada', reason: 'error_sistema' });
    expect(html).toContain('en_proceso → completada');
    expect(html).toContain('Fallo de entorno o infraestructura');
    expect(html).not.toContain('error_sistema');
  });

  it('escapes the reason', () => {
    const html = renderLog({ previousValue: 'a', newValue: 'b', reason: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows only newValue when there is no previousValue (creation)', () => {
    const html = renderLog({ previousValue: null, newValue: 'Hito A: 2026-12-01', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">Hito A: 2026-12-01</span>');
    expect(html).not.toContain('→');
    expect(html).not.toContain('—');
  });

  it('shows only previousValue when there is no newValue (deletion)', () => {
    const html = renderLog({ previousValue: 'Hito A: 2026-12-01', newValue: null, reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">Hito A: 2026-12-01</span>');
    expect(html).not.toContain('→');
  });

  it('shows a single value and the reason', () => {
    const html = renderLog({ previousValue: 'texto', newValue: null, reason: 'Moderado por admin' });
    expect(html).toBe(
      '<span class="text-xs text-gray-500">texto</span><span class="block text-xs text-gray-400">Moderado por admin</span>',
    );
    expect(html).toContain('texto');
    expect(html).toContain('Moderado por admin');
    expect(html).not.toContain('→');
    expect(spanCount(html)).toBe(2);
  });

  it('translates the reason code next to a single value', () => {
    const html = renderLog({ previousValue: null, newValue: 'x', reason: 'otro' });
    expect(html).toContain('<span class="block text-xs text-gray-400">Otro</span>');
  });

  it('treats empty strings as missing values', () => {
    expect(renderLog({ previousValue: '', newValue: 'b', reason: null })).toBe(
      '<span class="text-xs text-gray-500">b</span>',
    );
    expect(renderLog({ previousValue: 'a', newValue: '', reason: null })).toBe(
      '<span class="text-xs text-gray-500">a</span>',
    );
    expect(renderLog({ previousValue: '', newValue: '', reason: '' })).toBe(
      '<span class="text-xs text-gray-300">—</span>',
    );
  });

  it('escapes a single value', () => {
    const html = renderLog({ previousValue: null, newValue: '<script>alert(1)</script>', reason: null });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('TaskAuditDetail', () => {
  it('shows the change and the reason when both exist', () => {
    const html = renderTask({ previousValue: 'a', newValue: 'b', reason: 'Moderado por admin' });
    expect(html).toContain('(a → b)');
    expect(html).toContain('Moderado por admin');
  });

  it('shows the reason without a change', () => {
    const html = renderTask({ previousValue: null, newValue: null, reason: 'otro' });
    expect(html).toContain('— Otro');
    expect(html).not.toContain('— otro');
    expect(html).not.toContain('→');
  });

  it('translates delay reason codes into readable labels', () => {
    const html = renderTask({ previousValue: 'en_proceso', newValue: 'completada', reason: 'error_sistema' });
    expect(html).toContain('— Fallo de entorno o infraestructura');
    expect(html).not.toContain('error_sistema');
  });

  it('keeps free-text reasons unchanged', () => {
    const html = renderTask({ previousValue: null, newValue: null, reason: 'Moderado por admin' });
    expect(html).toContain('— Moderado por admin');
  });

  it('shows only the change when there is no reason', () => {
    const html = renderTask({ previousValue: 'a', newValue: 'b', reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(a → b)</span>');
  });

  it('renders nothing without reason nor values', () => {
    expect(renderTask({ previousValue: null, newValue: null, reason: null })).toBe('');
    expect(renderTask({ previousValue: null, newValue: null, reason: '' })).toBe('');
  });

  it('escapes the reason', () => {
    const html = renderTask({ previousValue: null, newValue: null, reason: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows only newValue', () => {
    const html = renderTask({ previousValue: null, newValue: 'Hito A', reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(Hito A)</span>');
    expect(html).not.toContain('→');
  });

  it('shows only previousValue', () => {
    const html = renderTask({ previousValue: 'Hito A', newValue: null, reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(Hito A)</span>');
    expect(html).not.toContain('→');
  });

  it('shows a single value and the reason', () => {
    const html = renderTask({ previousValue: 'x', newValue: null, reason: 'otro' });
    expect(html).toContain('(x)');
    expect(html).toContain('— Otro');
    expect(html).not.toContain('→');
  });

  it('treats empty strings as missing values', () => {
    expect(renderTask({ previousValue: '', newValue: 'b', reason: null })).toBe(
      '<span class="text-gray-400 ml-1">(b)</span>',
    );
    expect(renderTask({ previousValue: '', newValue: '', reason: '' })).toBe('');
  });

  it('escapes a single value', () => {
    const html = renderTask({ previousValue: '<script>alert(1)</script>', newValue: null, reason: null });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
