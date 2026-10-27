import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, weeklyVelocity, percentile, cycleTime, workInProgress, blockersByArea, doneByKind, type MetricTask } from '../src/lib/metrics';

const NOW = new Date('2026-10-28T15:00:00Z'); // miércoles
const d = (s: string) => new Date(s + 'T12:00:00Z');
const t = (over: Partial<MetricTask>): MetricTask => ({
  status: 'completada', kind: 'feature', estimate: 3, createdAt: d('2026-10-01'), completedAt: d('2026-10-05'),
  responsibleId: 'a', responsibleName: 'Ana', blockedByArea: null, ...over,
});

test('weekStart devuelve el lunes', () => {
  assert.equal(weekStart(d('2026-10-28')).toISOString().slice(0, 10), '2026-10-26');
  assert.equal(weekStart(d('2026-10-25')).toISOString().slice(0, 10), '2026-10-19'); // domingo
  assert.equal(weekStart(d('2026-10-26')).toISOString().slice(0, 10), '2026-10-26');
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
  assert.equal(v.length, 4);
  assert.deepEqual(v.at(-1), { start: '2026-10-26', tasks: 2, points: 8 });
  assert.deepEqual(v.at(-2), { start: '2026-10-19', tasks: 1, points: 2 });
  assert.equal(v.reduce((s, w) => s + w.points, 0), 10);
});

test('tareas sin estimar cuentan 0 puntos', () => {
  const v = weeklyVelocity([t({ completedAt: d('2026-10-27'), estimate: null })], 2, NOW);
  assert.deepEqual(v.at(-1), { start: '2026-10-26', tasks: 1, points: 0 });
});

test('percentile', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  assert.equal(percentile([1, 2, 3, 4], 85), 4);
  assert.equal(percentile([7], 85), 7);
});

test('cycleTime usa mediana y p85 de días entre creación y cierre', () => {
  const rows = [
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-22') }), // 2
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-24') }), // 4
    t({ createdAt: d('2026-10-20'), completedAt: d('2026-10-30') }), // 10 (futuro respecto a NOW: igual cuenta)
    t({ createdAt: d('2026-01-01'), completedAt: d('2026-01-03') }), // fuera de la ventana
  ];
  const c = cycleTime(rows, 60, NOW);
  assert.equal(c.count, 3);
  assert.equal(c.median, 4);
  assert.equal(c.p85, 10);
  assert.deepEqual(cycleTime([], 60, NOW), { count: 0, median: null, p85: null });
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
  assert.deepEqual(w.map(r => r.name), ['Beto', 'Ana']);
  assert.deepEqual(w[0], { personId: 'b', name: 'Beto', inProgress: 1, inReview: 1, blocked: 1 });
});

test('blockersByArea cuenta solo bloqueadas y usa "otro" si no hay área', () => {
  const rows = [
    t({ status: 'bloqueada', blockedByArea: 'qa' }),
    t({ status: 'bloqueada', blockedByArea: 'qa' }),
    t({ status: 'bloqueada', blockedByArea: null }),
    t({ status: 'en_proceso', blockedByArea: 'qa' }),
  ];
  assert.deepEqual(blockersByArea(rows), [{ area: 'qa', count: 2 }, { area: 'otro', count: 1 }]);
});

test('doneByKind cuenta terminadas recientes por tipo', () => {
  const rows = [t({ kind: 'bug', completedAt: d('2026-10-27') }), t({ kind: 'bug', completedAt: d('2026-10-20') }), t({ kind: 'feature', completedAt: d('2026-10-25') }), t({ kind: 'bug', completedAt: d('2025-01-01') })];
  assert.deepEqual(doneByKind(rows, 30, NOW), [{ kind: 'bug', count: 2 }, { kind: 'feature', count: 1 }]);
});
