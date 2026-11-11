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
});
