import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDailyDigest,
  groupDigestInputs,
  DIGEST_MAX_NEWS,
  type DigestNotification,
  type DigestTask,
} from '../src/lib/daily-digest';
import { APP_NAME } from '../src/lib/labels';

const PERSON = crypto.randomUUID();
const OTHER = crypto.randomUUID();
const BASE = 'https://forja.example.com';
// 21:00 RD del 17-nov; en UTC ya es 18-nov.
const NOW = '2026-11-18T01:00:00Z';
const TODAY = '2026-11-17';

let counter = 0;
function task(overrides: Partial<DigestTask> = {}): DigestTask {
  counter++;
  return {
    id: crypto.randomUUID(),
    number: counter,
    title: `Tarea ${counter}`,
    status: 'en_proceso',
    dueDate: null,
    responsibleId: PERSON,
    reviewerId: null,
    ...overrides,
  };
}

function news(overrides: Partial<DigestNotification> = {}): DigestNotification {
  counter++;
  return {
    id: crypto.randomUUID(),
    type: 'task_completed',
    title: `Aviso ${counter}`,
    body: null,
    taskId: null,
    taskNumber: null,
    createdAt: new Date(Date.UTC(2026, 10, 17, 12, 0, counter)),
    ...overrides,
  };
}

function build(tasks: DigestTask[] = [], notifications: DigestNotification[] = [], baseUrl = BASE) {
  return buildDailyDigest({ person: { id: PERSON, name: 'Ana' }, today: TODAY, baseUrl, tasks, notifications });
}

describe('buildDailyDigest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve null si las cinco secciones están vacías', () => {
    expect(build()).toBeNull();
  });

  it('devuelve null si sólo hay tareas que no le tocan', () => {
    const t = [
      task({ dueDate: '2026-11-18' }),
      task({ dueDate: TODAY, status: 'completada' }),
      task({ status: 'en_revision', reviewerId: OTHER }),
      task({ status: 'bloqueada', responsibleId: OTHER }),
    ];
    expect(build(t)).toBeNull();
  });

  it('una tarea que vence hoy (RD) va a «Vence hoy» y no a «Vencidas»', () => {
    const d = build([task({ dueDate: TODAY, title: 'Hoy mismo' })])!;
    expect(d.counts.dueToday).toBe(1);
    expect(d.counts.overdue).toBe(0);
    expect(d.text).toContain('Vence hoy');
    expect(d.text).not.toContain('Vencidas');
    expect(d.text).toContain('Hoy mismo');
  });

  it('una tarea con fecha anterior va a «Vencidas»', () => {
    const d = build([task({ dueDate: '2026-11-16', title: 'Ayer' })])!;
    expect(d.counts.overdue).toBe(1);
    expect(d.counts.dueToday).toBe(0);
    expect(d.text).toContain('Vencidas');
  });

  it('una tarea con fecha de mañana no aparece', () => {
    expect(build([task({ dueDate: '2026-11-18' })])).toBeNull();
  });

  it('una tarea completada no aparece aunque esté vencida o venza hoy', () => {
    expect(build([
      task({ dueDate: TODAY, status: 'completada' }),
      task({ dueDate: '2026-11-01', status: 'completada' }),
    ])).toBeNull();
  });

  it('las tareas de otro responsable no aparecen en Vence hoy ni Vencidas', () => {
    expect(build([
      task({ dueDate: TODAY, responsibleId: OTHER }),
      task({ dueDate: '2026-11-01', responsibleId: OTHER }),
    ])).toBeNull();
  });

  it('en_revision con la persona como revisora va a «Esperando tu revisión»', () => {
    const d = build([task({ status: 'en_revision', reviewerId: PERSON, responsibleId: OTHER, title: 'Revisar' })])!;
    expect(d.counts.review).toBe(1);
    expect(d.text).toContain('Esperando tu revisión');
    expect(d.text).toContain('Revisar');
  });

  it('bloqueada con la persona como responsable va a «Bloqueadas»', () => {
    const d = build([task({ status: 'bloqueada', title: 'Atascada' })])!;
    expect(d.counts.blocked).toBe(1);
    expect(d.text).toContain('Bloqueadas');
  });

  it('una tarea bloqueada y vencida aparece en las dos secciones', () => {
    const d = build([task({ status: 'bloqueada', dueDate: '2026-11-10' })])!;
    expect(d.counts.blocked).toBe(1);
    expect(d.counts.overdue).toBe(1);
  });

  it('ordena por fecha límite ascendente y luego por número', () => {
    const a = task({ dueDate: '2026-11-15', number: 30, title: 'Tercera' });
    const b = task({ dueDate: '2026-11-10', number: 40, title: 'Primera' });
    const c = task({ dueDate: '2026-11-15', number: 20, title: 'Segunda' });
    const d = build([a, b, c])!;
    const i1 = d.text.indexOf('Primera');
    const i2 = d.text.indexOf('Segunda');
    const i3 = d.text.indexOf('Tercera');
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });

  it('muestra 20 novedades de 25 y añade «y 5 más»', () => {
    const list = Array.from({ length: 25 }, () => news());
    const d = build([], list)!;
    expect(DIGEST_MAX_NEWS).toBe(20);
    expect(d.counts.news).toBe(20);
    expect(d.counts.newsMore).toBe(5);
    expect(d.text).toContain('y 5 más');
    expect(d.html).toContain('y 5 más');
    // Las más recientes primero: la última creada aparece, la primera no.
    expect(d.text).toContain(list[24].title);
    expect(d.text).not.toContain(`${list[0].title}\n`);
    expect(d.text).not.toContain(`${list[0].title} —`);
  });

  it('con 21 novedades añade «y 1 más»', () => {
    const d = build([], Array.from({ length: 21 }, () => news()))!;
    expect(d.counts.newsMore).toBe(1);
    expect(d.text).toContain('y 1 más');
  });

  it('con 20 novedades no añade «más»', () => {
    const d = build([], Array.from({ length: 20 }, () => news()))!;
    expect(d.counts.newsMore).toBe(0);
    expect(d.text).not.toMatch(/y \d+ más/);
  });

  it('ordena las novedades de la más reciente a la más antigua', () => {
    const old = news({ title: 'Vieja', createdAt: new Date('2026-11-15T10:00:00Z') });
    const fresh = news({ title: 'Nueva', createdAt: new Date('2026-11-17T10:00:00Z') });
    const d = build([], [old, fresh])!;
    expect(d.text.indexOf('Nueva')).toBeLessThan(d.text.indexOf('Vieja'));
  });

  it('agrupa las novedades por etiqueta de tipo y un tipo desconocido va a «Otros avisos»', () => {
    const d = build([], [
      news({ type: 'task_completed', title: 'Hecha' }),
      news({ type: 'task_assigned', title: 'Asignada a ti' }),
      news({ type: 'raro', title: 'Rarito' }),
      news({ type: 'constructor', title: 'Prototipo' }),
    ])!;
    expect(d.text).toContain('Hecho');
    expect(d.text).toContain('Asignada');
    expect(d.text).toContain('Otros avisos');
    const otros = d.text.indexOf('Otros avisos');
    expect(d.text.indexOf('Rarito')).toBeGreaterThan(otros);
    expect(d.text.indexOf('Prototipo')).toBeGreaterThan(otros);
    expect(d.html).toContain('Otros avisos');
  });

  it('escapa el texto de usuario en el HTML y lo deja literal en el texto y el asunto', () => {
    const evil = '<script>alert(1)</script> & "x"';
    const d = buildDailyDigest({
      person: { id: PERSON, name: evil },
      today: TODAY,
      baseUrl: BASE,
      tasks: [task({ dueDate: TODAY, title: evil })],
      notifications: [news({ title: evil, body: evil })],
    })!;
    expect(d.html).not.toContain('<script>');
    expect(d.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
    expect(d.text).toContain(evil);
    expect(d.subject).not.toContain('&amp;');
  });

  it('cada tarea lleva su clave FOR-<n> y su enlace', () => {
    const t = task({ dueDate: TODAY, number: 142 });
    const d = build([t])!;
    expect(d.text).toContain('FOR-142');
    expect(d.html).toContain('FOR-142');
    expect(d.text).toContain(`${BASE}/tareas/${t.id}`);
    expect(d.html).toContain(`href="${BASE}/tareas/${t.id}"`);
  });

  it('quita la barra final de baseUrl', () => {
    const t = task({ dueDate: TODAY });
    const d = build([t], [news()], `${BASE}/`)!;
    expect(d.html).not.toContain('//tareas');
    expect(d.text).not.toContain('//tareas');
    expect(d.html).not.toContain('//notificaciones');
    expect(d.text).toContain(`${BASE}/tareas/${t.id}`);
  });

  it('una novedad con tarea enlaza a la tarea; sin tarea, a notificaciones', () => {
    const taskId = crypto.randomUUID();
    const d = build([], [
      news({ taskId, taskNumber: 77, title: 'Con tarea' }),
      news({ title: 'Sin tarea' }),
    ])!;
    expect(d.html).toContain(`href="${BASE}/tareas/${taskId}"`);
    expect(d.html).toContain(`href="${BASE}/notificaciones"`);
    expect(d.text).toContain('FOR-77');
  });

  it('el asunto lleva la marca y la fecha DD/MM/YYYY', () => {
    const d = build([task({ dueDate: TODAY })])!;
    expect(d.subject).toBe(`${APP_NAME}: tu resumen del 17/11/2026`);
    expect(d.html).toContain(APP_NAME);
    expect(d.html).not.toContain('SGF');
  });
});

describe('groupDigestInputs', () => {
  it('reparte tareas y notificaciones por persona', () => {
    const t1 = task({ responsibleId: PERSON, reviewerId: OTHER });
    const t2 = task({ responsibleId: OTHER, reviewerId: null });
    const n1 = { ...news(), recipientId: PERSON };
    const n2 = { ...news(), recipientId: OTHER };
    const grouped = groupDigestInputs([PERSON, OTHER], [t1, t2], [n1, n2]);
    expect(grouped.get(PERSON)!.tasks).toEqual([t1]);
    expect(grouped.get(OTHER)!.tasks).toEqual([t1, t2]);
    expect(grouped.get(PERSON)!.notifications.map(n => n.id)).toEqual([n1.id]);
    expect(grouped.get(OTHER)!.notifications.map(n => n.id)).toEqual([n2.id]);
  });

  it('ignora filas de personas que no están en la lista', () => {
    const stranger = crypto.randomUUID();
    const grouped = groupDigestInputs([PERSON], [task({ responsibleId: stranger })], [{ ...news(), recipientId: stranger }]);
    expect(grouped.get(PERSON)).toEqual({ tasks: [], notifications: [] });
    expect(grouped.has(stranger)).toBe(false);
  });

  it('no duplica la tarea si responsable y revisor son la misma persona', () => {
    const t = task({ responsibleId: PERSON, reviewerId: PERSON });
    expect(groupDigestInputs([PERSON], [t], []).get(PERSON)!.tasks).toEqual([t]);
  });
});
