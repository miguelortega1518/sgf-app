import { test, expect } from 'vitest';
import { weekStart, weeklyVelocity, percentile, cycleTime, cycleDays, leadTime, wipAging, workInProgress, blockersByArea, doneByKind, type MetricTask } from '../src/lib/metrics';
import { buildStatusHistory, type StatusEvent, type StatusSegment } from '../src/lib/status-history';

const NOW = new Date('2026-10-28T15:00:00Z'); // miércoles
const d = (s: string) => new Date(s + 'T12:00:00Z');
let seq = 0;
const t = (over: Partial<MetricTask>): MetricTask => ({
  id: `task-${++seq}`, number: seq, title: `Tarea ${seq}`,
  status: 'completada', kind: 'feature', estimate: 3, createdAt: d('2026-10-01'), completedAt: d('2026-10-05'),
  responsibleId: 'a', responsibleName: 'Ana', blockedByArea: null, ...over,
});

test('weekStart devuelve el lunes', () => {
  expect(weekStart(d('2026-10-28')).toISOString().slice(0, 10)).toBe('2026-10-26');
  expect(weekStart(d('2026-10-25')).toISOString().slice(0, 10)).toBe('2026-10-19'); // domingo
  expect(weekStart(d('2026-10-26')).toISOString().slice(0, 10)).toBe('2026-10-26');
});

test('weeklyVelocity agrupa por semana y suma puntos', () => {
  const rows = [
    t({ completedAt: d('2026-10-27'), estimate: 5 }),
    t({ completedAt: d('2026-10-28'), estimate: 3 }),
    t({ completedAt: d('2026-10-20'), estimate: 2 }),
    t({ completedAt: d('2026-08-01'), estimate: 99 }), // fuera de la ventana
    t({ status: 'en_proceso', completedAt: null }),
  ];
  const v = weeklyVelocity(rows, 4, NOW);
  expect(v.length).toBe(4);
  expect(v.at(-1)).toEqual({ start: '2026-10-26', tasks: 2, points: 8 });
  expect(v.at(-2)).toEqual({ start: '2026-10-19', tasks: 1, points: 2 });
  expect(v.reduce((s, w) => s + w.points, 0)).toBe(10);
});

test('tareas sin estimar cuentan 0 puntos', () => {
  const v = weeklyVelocity([t({ completedAt: d('2026-10-27'), estimate: null })], 2, NOW);
  expect(v.at(-1)).toEqual({ start: '2026-10-26', tasks: 1, points: 0 });
});

test('percentile', () => {
  expect(percentile([], 50)).toBe(null);
  expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  expect(percentile([1, 2, 3, 4], 85)).toBe(4);
  expect(percentile([7], 85)).toBe(7);
});

test('leadTime usa mediana y p85 de días entre creación y cierre', () => {
  const rows = [
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-22') }), // 2
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-24') }), // 4
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-30') }), // 10 (futuro respecto a NOW: igual cuenta)
    t({ createdAt: d('2026-01-01'), completedAt: d('2026-01-03') }), // fuera de la ventana
  ];
  const c = leadTime(rows, 60, NOW);
  expect(c.count).toBe(3);
  expect(c.median).toBe(4);
  expect(c.p85).toBe(10);
  expect(leadTime([], 60, NOW)).toEqual({ count: 0, median: null, p85: null });
});

// Historial con un inicio (en_proceso) y, si la tarea está hecha, su cierre (completada).
const hist = (task: MetricTask, started: Date | null): StatusSegment[] => {
  const events: StatusEvent[] = [];
  if (started) events.push({ taskId: task.id, previousValue: 'no_iniciada', newValue: 'en_proceso', at: started });
  if (task.completedAt && task.status === 'completada') {
    events.push({ taskId: task.id, previousValue: 'en_proceso', newValue: 'completada', at: task.completedAt });
  }
  return buildStatusHistory(task, events);
};
const histories = (pairs: [MetricTask, Date | null][]) => new Map(pairs.map(([task, s]) => [task.id, hist(task, s)]));

test('cycleTime mide del inicio al cierre, no desde la creación', () => {
  const a = t({ createdAt: d('2026-09-01'), completedAt: d('2026-10-22') });
  const b = t({ createdAt: d('2026-09-01'), completedAt: d('2026-10-24') });
  const c = t({ createdAt: d('2026-09-01'), completedAt: d('2026-10-30') });
  const old = t({ createdAt: d('2026-01-01'), completedAt: d('2026-01-03') }); // fuera de la ventana
  const h = histories([[a, d('2026-10-21')], [b, d('2026-10-21')], [c, d('2026-10-20')], [old, d('2026-01-02')]]);
  expect(cycleTime([a, b, c, old], h, 60, NOW)).toEqual({ count: 3, median: 3, p85: 10, withoutStart: 0 });
});

test('cycleTime usa createdAt y cuenta withoutStart si no hay inicio', () => {
  const a = t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-22') }); // sin historial: 2
  const b = t({ createdAt: d('2026-10-01'), completedAt: d('2026-10-24') }); // inicio 10-23: 1
  const c = t({ createdAt: d('2026-10-01'), completedAt: d('2026-10-24') }); // sólo pasó por completada: 23
  const h = new Map([[b.id, hist(b, d('2026-10-23'))], [c.id, hist(c, null)]]);
  expect(cycleTime([a, b, c], h, 60, NOW)).toEqual({ count: 3, median: 2, p85: 23, withoutStart: 2 });
});

test('cycleTime vacío y duraciones negativas', () => {
  expect(cycleTime([], new Map(), 60, NOW)).toEqual({ count: 0, median: null, p85: null, withoutStart: 0 });
  const a = t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-22') });
  // Inicio registrado después del cierre: la duración negativa cuenta 0.
  const h = new Map([[a.id, buildStatusHistory(a, [{ taskId: a.id, previousValue: null, newValue: 'en_proceso', at: d('2026-10-25') }])]]);
  expect(cycleTime([a], h, 60, NOW)).toEqual({ count: 1, median: 0, p85: 0, withoutStart: 0 });
});

test('cycleDays devuelve los días sin ordenar ni redondear y cuenta withoutStart', () => {
  const a = t({ createdAt: d('2026-10-01'), completedAt: d('2026-10-24') }); // inicio 10-21 06:00Z: 3,25
  const b = t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-22') }); // sin inicio: 2
  const old = t({ createdAt: d('2026-01-01'), completedAt: d('2026-01-03') }); // fuera de la ventana
  const open = t({ status: 'en_proceso', completedAt: null });
  const h = new Map([[a.id, hist(a, new Date('2026-10-21T06:00:00Z'))]]);
  expect(cycleDays([a, b, old, open], h, 60, NOW)).toEqual({ days: [3.25, 2], withoutStart: 1 });
  // Acepta tareas mínimas (id, status, createdAt, completedAt).
  const minimal = { id: 'm', status: 'completada', createdAt: d('2026-10-20'), completedAt: d('2026-10-21') };
  expect(cycleDays([minimal], new Map(), 60, NOW)).toEqual({ days: [1], withoutStart: 1 });
});

test('wipAging sólo incluye trabajo en curso, ordenado de más a menos días', () => {
  const p = t({ status: 'en_proceso', completedAt: null, title: 'P' });
  const r = t({ status: 'en_revision', completedAt: null, title: 'R' });
  const b = t({ status: 'bloqueada', completedAt: null, title: 'B' });
  const n = t({ status: 'no_iniciada', completedAt: null, createdAt: d('2026-09-01') });
  const done = t({ status: 'completada', completedAt: d('2026-10-27'), createdAt: d('2026-09-01') });
  const h = histories([[p, d('2026-10-26')], [r, d('2026-10-20')], [b, d('2026-10-24')], [done, d('2026-10-26')]]);
  const rows = wipAging([p, r, b, n, done], h, NOW);
  expect(rows.map(x => x.title)).toEqual(['R', 'B', 'P']);
  expect(rows.map(x => x.days)).toEqual([8.1, 4.1, 2.1]);
  expect(rows[0]).toEqual({
    id: r.id, number: r.number, title: 'R', status: 'en_revision', responsibleName: 'Ana', days: 8.1, aged: true, withoutStart: false,
  });
});

test('wipAging marca como envejecida sólo lo que supera estrictamente el p85', () => {
  const at = (s: string) => new Date(s + 'T15:00:00Z');
  const done = t({ status: 'completada', createdAt: at('2026-10-01'), completedAt: at('2026-10-20') });
  const five = t({ status: 'en_proceso', completedAt: null, createdAt: at('2026-10-01') });
  const four = t({ status: 'en_proceso', completedAt: null, createdAt: at('2026-10-01') });
  const h = histories([[done, at('2026-10-16')], [five, at('2026-10-23')], [four, at('2026-10-24')]]); // p85 = 4
  const rows = wipAging([done, five, four], h, NOW);
  expect(rows.map(x => [x.id, x.days, x.aged])).toEqual([[five.id, 5, true], [four.id, 4, false]]);
});

test('wipAging sin inicio usa createdAt y marca withoutStart', () => {
  const x = t({ status: 'bloqueada', completedAt: null, createdAt: new Date('2026-10-26T15:00:00Z') });
  expect(wipAging([x], new Map(), NOW)).toEqual([expect.objectContaining({ id: x.id, days: 2, withoutStart: true, aged: false })]);
});

test('wipAging sin completadas en 60 días no marca nada como envejecido', () => {
  const old = t({ status: 'completada', createdAt: d('2026-01-01'), completedAt: d('2026-01-03') });
  const x = t({ status: 'en_proceso', completedAt: null, createdAt: d('2026-01-01') });
  const rows = wipAging([old, x], histories([[old, d('2026-01-02')], [x, d('2026-01-02')]]), NOW);
  expect(rows).toHaveLength(1);
  expect(rows[0].aged).toBe(false);
  expect(wipAging([], new Map(), NOW)).toEqual([]);
});

test('workInProgress ignora por hacer y hechas, y ordena por carga', () => {
  const rows = [
    t({ status: 'en_proceso', responsibleId: 'a', responsibleName: 'Ana' }),
    t({ status: 'en_revision', responsibleId: 'b', responsibleName: 'Beto' }),
    t({ status: 'en_proceso', responsibleId: 'b', responsibleName: 'Beto' }),
    t({ status: 'bloqueada', responsibleId: 'b', responsibleName: 'Beto' }),
    t({ status: 'no_iniciada', responsibleId: 'c', responsibleName: 'Cami' }),
    t({ status: 'completada', responsibleId: 'c', responsibleName: 'Cami' }),
  ];
  const w = workInProgress(rows);
  expect(w.map(r => r.name)).toEqual(['Beto', 'Ana']);
  expect(w[0]).toEqual({ personId: 'b', name: 'Beto', inProgress: 1, inReview: 1, blocked: 1 });
});

test('blockersByArea cuenta solo bloqueadas y usa "otro" si no hay área', () => {
  const rows = [
    t({ status: 'bloqueada', blockedByArea: 'qa' }),
    t({ status: 'bloqueada', blockedByArea: 'qa' }),
    t({ status: 'bloqueada', blockedByArea: null }),
    t({ status: 'en_proceso', blockedByArea: 'qa' }),
  ];
  expect(blockersByArea(rows)).toEqual([{ area: 'qa', count: 2 }, { area: 'otro', count: 1 }]);
});

test('doneByKind cuenta terminadas recientes por tipo', () => {
  const rows = [t({ kind: 'bug', completedAt: d('2026-10-27') }), t({ kind: 'bug', completedAt: d('2026-10-20') }), t({ kind: 'feature', completedAt: d('2026-10-25') }), t({ kind: 'bug', completedAt: d('2025-01-01') })];
  expect(doneByKind(rows, 30, NOW)).toEqual([{ kind: 'bug', count: 2 }, { kind: 'feature', count: 1 }]);
});
