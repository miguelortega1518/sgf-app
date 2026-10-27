import { test, expect } from 'vitest';
import { weekStart, weeklyVelocity, percentile, cycleTime, workInProgress, blockersByArea, doneByKind, type MetricTask } from '../src/lib/metrics';

const NOW = new Date('2026-10-28T15:00:00Z'); // miércoles
const d = (s: string) => new Date(s + 'T12:00:00Z');
const t = (over: Partial<MetricTask>): MetricTask => ({
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

test('cycleTime usa mediana y p85 de días entre creación y cierre', () => {
  const rows = [
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-22') }), // 2
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-24') }), // 4
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-30') }), // 10 (futuro respecto a NOW: igual cuenta)
    t({ createdAt: d('2026-01-01'), completedAt: d('2026-01-03') }), // fuera de la ventana
  ];
  const c = cycleTime(rows, 60, NOW);
  expect(c.count).toBe(3);
  expect(c.median).toBe(4);
  expect(c.p85).toBe(10);
  expect(cycleTime([], 60, NOW)).toEqual({ count: 0, median: null, p85: null });
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
