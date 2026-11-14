import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuditLogDetail, TaskAuditDetail } from '../src/components/audit/audit-entry-detail';

type Props = { previousValue: string | null; newValue: string | null; reason: string | null; action?: string };

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

  it('shows only the new value when there is no previous value', () => {
    const html = renderLog({ previousValue: null, newValue: 'Hito A: 2026-12-01', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">Hito A: 2026-12-01</span>');
    expect(html).not.toContain('→');
    expect(html).not.toContain('—');
  });

  it('shows only the previous value when there is no new value', () => {
    const html = renderLog({ previousValue: 'Hito A: 2026-12-01', newValue: null, reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">Hito A: 2026-12-01</span>');
    expect(html).not.toContain('→');
    expect(html).not.toContain('—');
  });

  it('shows a single value and the reason', () => {
    const html = renderLog({ previousValue: null, newValue: 'x', reason: 'otro' });
    expect(html).toBe('<span class="text-xs text-gray-500">x</span><span class="block text-xs text-gray-400">Otro</span>');
    expect(html).toContain('>Otro<');
    expect(html).not.toContain('→');
    expect(spanCount(html)).toBe(2);
  });

  it('treats empty strings as missing values', () => {
    expect(renderLog({ previousValue: '', newValue: null, reason: null }))
      .toBe('<span class="text-xs text-gray-300">—</span>');
    expect(renderLog({ previousValue: null, newValue: '', reason: null }))
      .toBe('<span class="text-xs text-gray-300">—</span>');
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

  it('renders nothing when the entry is redacted, even with values and reason', () => {
    const html = renderToStaticMarkup(createElement(TaskAuditDetail, {
      previousValue: 'texto secreto', newValue: 'otro texto', reason: 'Moderado por admin', redacted: true,
    }));
    expect(html).toBe('');
    expect(html).not.toContain('texto secreto');
    expect(html).not.toContain('Moderado por admin');
  });

  it('keeps the current render with redacted:false', () => {
    const html = renderToStaticMarkup(createElement(TaskAuditDetail, {
      previousValue: 'a', newValue: 'b', reason: null, redacted: false,
    }));
    expect(html).toBe('<span class="text-gray-400 ml-1">(a → b)</span>');
  });

  it('shows only the new value without arrow', () => {
    const html = renderTask({ previousValue: null, newValue: 'x', reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(x)</span>');
  });

  it('shows only the previous value without arrow', () => {
    const html = renderTask({ previousValue: 'x', newValue: null, reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(x)</span>');
  });

  it('shows a single value and the reason', () => {
    const html = renderTask({ previousValue: null, newValue: 'x', reason: 'otro' });
    expect(html).toContain('(x)');
    expect(html).toContain('— Otro');
    expect(html).not.toContain('→');
  });

  it('treats empty strings as missing values', () => {
    expect(renderTask({ previousValue: '', newValue: null, reason: null })).toBe('');
    expect(renderTask({ previousValue: null, newValue: '', reason: null })).toBe('');
  });

  it('escapes a single value', () => {
    const html = renderTask({ previousValue: '<script>alert(1)</script>', newValue: null, reason: null });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders nothing when redacted even with a single value', () => {
    const html = renderToStaticMarkup(createElement(TaskAuditDetail, {
      previousValue: 'texto secreto', newValue: null, reason: null, redacted: true,
    }));
    expect(html).toBe('');
    expect(html).not.toContain('texto secreto');
  });
});

describe('readable task_created / space_created values', () => {
  const uuid = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
  const taskJson = JSON.stringify({ title: 'T1', responsible: uuid });

  it('AuditLogDetail formats task_created as the title', () => {
    const html = renderLog({ action: 'task_created', previousValue: null, newValue: taskJson, reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">T1</span>');
    expect(html).not.toContain(uuid);
    expect(html).not.toContain('{');
    expect(html).not.toContain('title');
  });

  it('AuditLogDetail formats space_created with the type label', () => {
    const html = renderLog({ action: 'space_created', previousValue: null, newValue: '{"name":"P","type":"proyecto"}', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">P (Iniciativa)</span>');
  });

  it('AuditLogDetail shows an unknown space type as is', () => {
    const html = renderLog({ action: 'space_created', previousValue: null, newValue: '{"name":"P","type":"project"}', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">P (project)</span>');
    expect(html).not.toContain('{');
    expect(html).not.toContain('}');
    expect(html).not.toContain('&quot;');
  });

  it('AuditLogDetail shows only the name when space_created has no type', () => {
    const html = renderLog({ action: 'space_created', previousValue: null, newValue: '{"name":"P"}', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">P</span>');
  });

  it('does not resolve prototype properties as space type labels', () => {
    const html = renderLog({ action: 'space_created', previousValue: null, newValue: '{"name":"P","type":"constructor"}', reason: null });
    expect(html).toBe('<span class="text-xs text-gray-500">P (constructor)</span>');
    expect(html).not.toContain('function');
  });

  it.each(['{no json', 'null', '123', '"T1"', '[]', '{"foo":1}', '{"title":""}', '{"title":5}'])(
    'keeps the raw task_created value %s',
    (value) => {
      const raw = renderLog({ previousValue: null, newValue: value, reason: null });
      expect(() => renderLog({ action: 'task_created', previousValue: null, newValue: value, reason: null })).not.toThrow();
      expect(renderLog({ action: 'task_created', previousValue: null, newValue: value, reason: null })).toBe(raw);
    },
  );

  it.each(['{no json', 'null', '[]', '{"type":"proyecto"}', '{"name":""}', '{"__proto__":{"name":"x"}}'])(
    'keeps the raw space_created value %s',
    (value) => {
      const raw = renderLog({ previousValue: null, newValue: value, reason: null });
      expect(renderLog({ action: 'space_created', previousValue: null, newValue: value, reason: null })).toBe(raw);
    },
  );

  it('keeps the raw value for other actions', () => {
    const value = '{"title":"T1"}';
    const raw = renderLog({ previousValue: null, newValue: value, reason: null });
    expect(renderLog({ action: 'milestone_created', previousValue: null, newValue: value, reason: null })).toBe(raw);
    expect(raw).toContain('&quot;title&quot;');
  });

  it('formats both values before joining them with the arrow', () => {
    const html = renderLog({ action: 'task_created', previousValue: '{"title":"A"}', newValue: '{"title":"B"}', reason: 'otro' });
    expect(html).toBe('<span class="text-xs text-gray-500">A → B</span><span class="block text-xs text-gray-400">Otro</span>');
  });

  it('escapes the task title', () => {
    const html = renderLog({
      action: 'task_created', previousValue: null,
      newValue: JSON.stringify({ title: '<script>alert(1)</script>', responsible: 'x' }), reason: null,
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes the space name', () => {
    const html = renderLog({
      action: 'space_created', previousValue: null,
      newValue: JSON.stringify({ name: '<img src=x onerror=alert(1)>', type: 'proyecto' }), reason: null,
    });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('TaskAuditDetail formats task_created as the title', () => {
    const html = renderTask({ action: 'task_created', previousValue: null, newValue: taskJson, reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(T1)</span>');
    expect(html).not.toContain(uuid);
  });

  it('TaskAuditDetail formats space_created', () => {
    const html = renderTask({ action: 'space_created', previousValue: null, newValue: '{"name":"P","type":"proyecto"}', reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">(P (Iniciativa))</span>');
  });

  it('TaskAuditDetail keeps invalid JSON raw', () => {
    const html = renderTask({ action: 'task_created', previousValue: null, newValue: '{no json', reason: null });
    expect(html).toBe('<span class="text-gray-400 ml-1">({no json)</span>');
  });

  it('TaskAuditDetail renders nothing when redacted, even with task_created JSON', () => {
    const html = renderToStaticMarkup(createElement(TaskAuditDetail, {
      action: 'task_created', previousValue: null, newValue: taskJson, reason: null, redacted: true,
    }));
    expect(html).toBe('');
  });
});
