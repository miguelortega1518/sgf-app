import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_BURNDOWN_DAYS,
  MOVING_AVERAGE_WINDOW,
  VELOCITY_SPRINTS,
  projectSprintMetrics,
  resolveSprintEvent,
  sprintBurndown,
  sprintMembershipAt,
  sprintVelocity,
  type BurndownResult,
  type MetricsSprint,
  type MetricsTask,
  type SprintEvent,
} from '../src/lib/sprint-metrics';
import { rdDayStart } from '../src/lib/flow-metrics';
import { buildStatusHistory, type StatusEvent, type StatusSegment } from '../src/lib/status-history';
import { shiftDateRD } from '../src/lib/date-utils';

// shiftDateRD real, pero espiable: el tope de días se comprueba sin recorrerlos.
vi.mock('../src/lib/date-utils', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/date-utils')>();
  return { ...actual, shiftDateRD: vi.fn(actual.shiftDateRD) };
});

/** Instante `hh:mm` hora RD del día `date`. */
function rdAt(date: string, hh: number, mm = 0): Date {
  return new Date(rdDayStart(date).getTime() + (hh * 60 + mm) * 60_000);
}

function sprint(overrides: Partial<MetricsSprint> & { id?: string }): MetricsSprint {
  return {
    id: crypto.randomUUID(),
    name: 'Sprint 1',
    status: 'cerrado',
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    updatedAt: rdAt('2026-11-06', 18),
    ...overrides,
  };
}

function task(overrides: Partial<MetricsTask>): MetricsTask {
  return {
    id: crypto.randomUUID(),
    status: 'no_iniciada',
    estimate: null,
    sprintId: null,
    createdAt: rdAt('2026-10-30', 9),
    completedAt: null,
    ...overrides,
  };
}

type StatusChange = [status: string, at: Date];

/** Historiales a partir de cambios de estado por tarea. */
function histories(tasks: MetricsTask[], changes: Record<string, StatusChange[]> = {}): Map<string, StatusSegment[]> {
  const map = new Map<string, StatusSegment[]>();
  for (const t of tasks) {
    let prev = 'no_iniciada';
    const events: StatusEvent[] = (changes[t.id] ?? []).map(([status, at]) => {
      const e = { taskId: t.id, previousValue: prev, newValue: status, at };
      prev = status;
      return e;
    });
    map.set(t.id, buildStatusHistory(t, events));
  }
  return map;
}

function sprintEvent(
  taskId: string, at: Date, previousValue: string, newValue: string, ids?: { from: string | null; to: string | null },
): SprintEvent {
  return { taskId, previousValue, newValue, reason: ids ? JSON.stringify(ids) : null, at };
}

function eventsMap(events: SprintEvent[]): Map<string, SprintEvent[]> {
  const map = new Map<string, SprintEvent[]>();
  for (const e of events) map.set(e.taskId, [...(map.get(e.taskId) ?? []), e]);
  return map;
}

function data(result: BurndownResult) {
  if (result.kind !== 'data') throw new Error(`se esperaba kind 'data' y llegó '${result.kind}'`);
  return result;
}

const remainingOf = (r: BurndownResult) => data(r).points.map(p => p.remaining);
const scopeOf = (r: BurndownResult) => data(r).points.map(p => p.scope);

describe('resolveSprintEvent', () => {
  const s7 = sprint({ name: 'Sprint 7', startDate: '2026-10-01', endDate: '2026-10-14' });
  const s8 = sprint({ name: 'Sprint 8', startDate: '2026-10-15', endDate: '2026-10-28' });
  const sprints = [s7, s8];
  const at = rdAt('2026-10-05', 10);

  it('un reason JSON válido se impone a los nombres', () => {
    const e = sprintEvent('t', at, 'Sprint 8', 'Backlog', { from: s7.id, to: s8.id });
    expect(resolveSprintEvent(e, sprints)).toEqual({ from: s7.id, to: s8.id });
  });

  it('acepta null en el JSON como backlog', () => {
    const e = sprintEvent('t', at, 'Sprint 7', 'Sprint 8', { from: null, to: s8.id });
    expect(resolveSprintEvent(e, sprints)).toEqual({ from: null, to: s8.id });
  });

  it.each([
    '{no json',
    'null',
    '[]',
    '"texto"',
    '{"from":1,"to":2}',
    '{"to":null}',
    '{"__proto__":{"from":null,"to":null}}',
  ])('un reason %s cae a la resolución por nombre', reason => {
    const e: SprintEvent = { taskId: 't', previousValue: 'Sprint 7', newValue: 'Sprint 8', reason, at };
    expect(resolveSprintEvent(e, sprints)).toEqual({ from: s7.id, to: s8.id });
  });

  it('un id que no es del proyecto cae a la resolución por nombre', () => {
    const e = sprintEvent('t', at, 'Backlog', 'Sprint 7', { from: null, to: crypto.randomUUID() });
    expect(resolveSprintEvent(e, sprints)).toEqual({ from: null, to: s7.id });
  });

  it("'Backlog' y un nombre desconocido son null", () => {
    const e = sprintEvent('t', at, 'Backlog', 'Sprint 99');
    expect(resolveSprintEvent(e, sprints)).toEqual({ from: null, to: null });
  });

  it('con dos sprints del mismo nombre elige el que contiene la fecha RD del evento', () => {
    const a = sprint({ name: 'Sprint X', startDate: '2026-10-01', endDate: '2026-10-14' });
    const b = sprint({ name: 'Sprint X', startDate: '2026-11-01', endDate: '2026-11-14' });
    const both = [a, b];
    expect(resolveSprintEvent(sprintEvent('t', rdAt('2026-11-05', 10), 'Backlog', 'Sprint X'), both).to).toBe(b.id);
    expect(resolveSprintEvent(sprintEvent('t', rdAt('2026-10-05', 10), 'Backlog', 'Sprint X'), both).to).toBe(a.id);
    // 21:00 RD del 14/10 es ya 15/10 en UTC: sigue dentro del primero.
    expect(resolveSprintEvent(sprintEvent('t', rdAt('2026-10-14', 21), 'Backlog', 'Sprint X'), both).to).toBe(a.id);
  });

  it('si ninguno contiene la fecha, elige el de mayor startDate anterior o igual', () => {
    const a = sprint({ name: 'Sprint X', startDate: '2026-10-01', endDate: '2026-10-14' });
    const b = sprint({ name: 'Sprint X', startDate: '2026-11-01', endDate: '2026-11-14' });
    expect(resolveSprintEvent(sprintEvent('t', rdAt('2026-10-20', 10), 'Backlog', 'Sprint X'), [a, b]).to).toBe(a.id);
    expect(resolveSprintEvent(sprintEvent('t', rdAt('2026-12-20', 10), 'Backlog', 'Sprint X'), [a, b]).to).toBe(b.id);
  });

  it('si varios contienen la fecha, elige el de mayor startDate', () => {
    const a = sprint({ name: 'Sprint X', startDate: '2026-10-01', endDate: '2026-10-31' });
    const b = sprint({ name: 'Sprint X', startDate: '2026-10-10', endDate: '2026-10-20' });
    expect(resolveSprintEvent(sprintEvent('t', rdAt('2026-10-15', 10), 'Backlog', 'Sprint X'), [a, b]).to).toBe(b.id);
  });
});

describe('sprintMembershipAt', () => {
  const s1 = crypto.randomUUID();
  const s2 = crypto.randomUUID();

  it('sin eventos pertenece a su sprintId actual desde createdAt', () => {
    const t = task({ sprintId: s1, createdAt: rdAt('2026-11-02', 9) });
    const at = sprintMembershipAt(t, []);
    expect(at(rdAt('2026-11-02', 8))).toBeNull();
    expect(at(rdAt('2026-11-02', 9))).toBe(s1);
    expect(at(rdAt('2026-12-31', 9))).toBe(s1);
  });

  it('antes del primer evento está en su from; después de cada uno, en su to; tras el último, en el actual', () => {
    const t = task({ sprintId: s2, createdAt: rdAt('2026-11-01', 9) });
    const at = sprintMembershipAt(t, [
      { from: null, to: s1, at: rdAt('2026-11-03', 10) },
      { from: s1, to: null, at: rdAt('2026-11-05', 10) },
      { from: null, to: s1, at: rdAt('2026-11-07', 10) },
    ]);
    expect(at(rdAt('2026-11-02', 10))).toBeNull();
    expect(at(rdAt('2026-11-03', 10))).toBe(s1);
    expect(at(rdAt('2026-11-04', 10))).toBe(s1);
    expect(at(rdAt('2026-11-06', 10))).toBeNull();
    // Después del último evento manda el sprintId actual de la tarea.
    expect(at(rdAt('2026-11-08', 10))).toBe(s2);
  });
});

describe('sprintBurndown', () => {
  it('sin estimaciones la unidad es tareas y los valores son recuentos', () => {
    const s = sprint({});
    const tasks = [
      task({ sprintId: s.id, status: 'completada', completedAt: rdAt('2026-11-03', 12) }),
      task({ sprintId: s.id }),
      task({ sprintId: s.id }),
    ];
    const r = data(sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks, { [tasks[0].id]: [['completada', rdAt('2026-11-03', 12)]] }),
      sprintEvents: new Map(),
    }));
    expect(r.unit).toBe('tareas');
    expect(r.points).toHaveLength(6);
    expect(r.points[0]).toMatchObject({ date: '2026-11-02', isStart: true, remaining: 3 });
    expect(r.points.slice(1).map(p => p.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.points.slice(1).every(p => !p.isStart)).toBe(true);
    expect(remainingOf(r)).toEqual([3, 3, 2, 2, 2, 2]);
    expect(scopeOf(r).slice(1)).toEqual([3, 3, 3, 3, 3]);
    r.points.forEach((p, i) => expect(p.ideal).toBeCloseTo(3 * (1 - i / 5)));
  });

  it('con estimaciones mixtas la unidad es puntos y las tareas sin estimar pesan 0', () => {
    const s = sprint({});
    const tasks = [
      task({ sprintId: s.id, estimate: 3, status: 'completada', completedAt: rdAt('2026-11-04', 12) }),
      task({ sprintId: s.id, estimate: null, status: 'completada', completedAt: rdAt('2026-11-03', 12) }),
      task({ sprintId: s.id, estimate: 5 }),
    ];
    const r = data(sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks, {
        [tasks[0].id]: [['completada', rdAt('2026-11-04', 12)]],
        [tasks[1].id]: [['completada', rdAt('2026-11-03', 12)]],
      }),
      sprintEvents: new Map(),
    }));
    expect(r.unit).toBe('puntos');
    expect(remainingOf(r)).toEqual([8, 8, 8, 5, 5, 5]);
    expect(scopeOf(r).slice(1)).toEqual([8, 8, 8, 8, 8]);
    expect(r.points[5].ideal).toBe(0);
  });

  it('una tarea añadida el día 3 sube remaining y scope desde ese día; una quitada el día 5 los baja', () => {
    const s = sprint({});
    const base = task({ sprintId: s.id });
    const added = task({ sprintId: s.id });
    const removed = task({ sprintId: null });
    const tasks = [base, added, removed];
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks),
      sprintEvents: eventsMap([
        sprintEvent(added.id, rdAt('2026-11-04', 10), 'Backlog', 'Sprint 1', { from: null, to: s.id }),
        sprintEvent(removed.id, rdAt('2026-10-31', 10), 'Backlog', 'Sprint 1', { from: null, to: s.id }),
        sprintEvent(removed.id, rdAt('2026-11-06', 10), 'Sprint 1', 'Backlog', { from: s.id, to: null }),
      ]),
    });
    expect(remainingOf(r)).toEqual([2, 2, 2, 3, 3, 2]);
    expect(scopeOf(r)).toEqual([2, 2, 2, 3, 3, 2]);
  });

  it('a otro sprint también baja el alcance', () => {
    const s = sprint({});
    const other = sprint({ name: 'Sprint 2', status: 'planificado', startDate: '2026-11-09', endDate: '2026-11-13' });
    const moved = task({ sprintId: other.id });
    const r = sprintBurndown({
      sprint: s, sprints: [s, other], tasks: [moved, task({ sprintId: s.id })], now: rdAt('2026-11-20', 12),
      statusHistories: new Map(),
      sprintEvents: eventsMap([
        sprintEvent(moved.id, rdAt('2026-11-03', 10), 'Sprint 1', 'Sprint 2', { from: s.id, to: other.id }),
      ]),
    });
    expect(remainingOf(r)).toEqual([2, 2, 1, 1, 1, 1]);
  });

  it('los eventos antiguos sólo con nombres se resuelven igual', () => {
    const s = sprint({});
    const base = task({ sprintId: s.id });
    const added = task({ sprintId: s.id });
    const removed = task({ sprintId: null });
    const tasks = [base, added, removed];
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks),
      sprintEvents: eventsMap([
        sprintEvent(added.id, rdAt('2026-11-04', 10), 'Backlog', 'Sprint 1'),
        sprintEvent(removed.id, rdAt('2026-10-31', 10), 'Backlog', 'Sprint 1'),
        sprintEvent(removed.id, rdAt('2026-11-06', 10), 'Sprint 1', 'Backlog'),
      ]),
    });
    expect(remainingOf(r)).toEqual([2, 2, 2, 3, 3, 2]);
  });

  it('un sprint de 1 día da 2 puntos con la ideal [inicio, 0]', () => {
    const s = sprint({ startDate: '2026-11-02', endDate: '2026-11-02', updatedAt: rdAt('2026-11-02', 20) });
    const tasks = [
      task({ sprintId: s.id, status: 'completada', completedAt: rdAt('2026-11-02', 15) }),
      task({ sprintId: s.id }),
    ];
    const r = data(sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks, { [tasks[0].id]: [['completada', rdAt('2026-11-02', 15)]] }),
      sprintEvents: new Map(),
    }));
    expect(r.points).toHaveLength(2);
    expect(r.points.map(p => p.ideal)).toEqual([2, 0]);
    expect(remainingOf(r)).toEqual([2, 1]);
  });

  it('una tarea reabierta vuelve a contar desde el día en que se reabrió', () => {
    const s = sprint({});
    const reopened = task({ sprintId: s.id, status: 'en_proceso' });
    const tasks = [reopened, task({ sprintId: s.id })];
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks, {
        [reopened.id]: [['completada', rdAt('2026-11-03', 12)], ['en_proceso', rdAt('2026-11-05', 12)]],
      }),
      sprintEvents: new Map(),
    });
    expect(remainingOf(r)).toEqual([2, 2, 1, 1, 2, 2]);
  });

  it('las tareas ya completadas al inicio no cuentan en el Inicio', () => {
    const s = sprint({});
    const tasks = [
      task({ sprintId: s.id, status: 'completada', completedAt: rdAt('2026-10-31', 12) }),
      task({ sprintId: s.id }),
    ];
    const r = data(sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks, { [tasks[0].id]: [['completada', rdAt('2026-10-31', 12)]] }),
      sprintEvents: new Map(),
    }));
    expect(r.points[0].remaining).toBe(1);
    expect(r.points[0].ideal).toBe(1);
    expect(remainingOf(r).slice(1)).toEqual([1, 1, 1, 1, 1]);
  });

  it('una tarea creada a mitad de sprint no cuenta antes de su createdAt', () => {
    const s = sprint({});
    const tasks = [task({ sprintId: s.id }), task({ sprintId: s.id, createdAt: rdAt('2026-11-04', 9) })];
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks, now: rdAt('2026-11-20', 12),
      statusHistories: histories(tasks), sprintEvents: new Map(),
    });
    expect(remainingOf(r)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('sin tareas en el sprint devuelve kind empty', () => {
    const s = sprint({});
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [task({ sprintId: null })], now: rdAt('2026-11-20', 12),
      statusHistories: new Map(), sprintEvents: new Map(),
    });
    expect(r).toEqual({ kind: 'empty' });
  });

  it('un sprint más largo que MAX_BURNDOWN_DAYS devuelve too_long sin generar días', () => {
    const s = sprint({ startDate: '2026-01-01', endDate: '2099-12-31', updatedAt: rdAt('2099-12-31', 18) });
    const t = task({ sprintId: s.id });
    const statusHistories = histories([t]);
    vi.mocked(shiftDateRD).mockClear();
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [t], now: rdAt('2026-11-20', 12),
      statusHistories, sprintEvents: new Map(),
    });
    expect(r).toEqual({ kind: 'too_long' });
    // No recorre los días: ni un solo shiftDateRD.
    expect(shiftDateRD).not.toHaveBeenCalled();
  });

  it('un sprint de exactamente MAX_BURNDOWN_DAYS días sí se calcula', () => {
    const endDate = shiftDateRD('2026-01-01', MAX_BURNDOWN_DAYS - 1);
    const s = sprint({ startDate: '2026-01-01', endDate, updatedAt: rdAt(endDate, 18) });
    const t = task({ sprintId: s.id, createdAt: rdAt('2025-12-30', 9) });
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [t], now: rdAt('2027-02-01', 12),
      statusHistories: histories([t]), sprintEvents: new Map(),
    });
    expect(data(r).points).toHaveLength(MAX_BURNDOWN_DAYS + 1);
  });

  it('un sprint de MAX_BURNDOWN_DAYS + 1 días devuelve too_long', () => {
    const endDate = shiftDateRD('2026-01-01', MAX_BURNDOWN_DAYS);
    const s = sprint({ startDate: '2026-01-01', endDate, updatedAt: rdAt(endDate, 18) });
    const t = task({ sprintId: s.id, createdAt: rdAt('2025-12-30', 9) });
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [t], now: rdAt('2027-02-01', 12),
      statusHistories: histories([t]), sprintEvents: new Map(),
    });
    expect(r).toEqual({ kind: 'too_long' });
  });

  it('una tarea que sólo estuvo en el sprint antes de su inicio no cuenta', () => {
    const s = sprint({});
    const t = task({ sprintId: null });
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [t], now: rdAt('2026-11-20', 12),
      statusHistories: new Map(),
      sprintEvents: eventsMap([
        sprintEvent(t.id, rdAt('2026-10-30', 10), 'Backlog', 'Sprint 1', { from: null, to: s.id }),
        sprintEvent(t.id, rdAt('2026-10-31', 10), 'Sprint 1', 'Backlog', { from: s.id, to: null }),
      ]),
    });
    expect(r).toEqual({ kind: 'empty' });
  });

  it('en un sprint cerrado, un movimiento posterior al cierre no altera el burndown', () => {
    const s = sprint({});
    const t = task({ sprintId: null });
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [t], now: rdAt('2026-11-20', 12),
      statusHistories: new Map(),
      sprintEvents: eventsMap([
        sprintEvent(t.id, rdAt('2026-11-06', 19), 'Sprint 1', 'Backlog', { from: s.id, to: null }),
      ]),
    });
    expect(remainingOf(r)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('en un sprint cerrado antes de tiempo, los cortes se limitan al cierre', () => {
    const s = sprint({ updatedAt: rdAt('2026-11-04', 12) });
    const t = task({ sprintId: s.id, status: 'completada', completedAt: rdAt('2026-11-05', 12) });
    const r = sprintBurndown({
      sprint: s, sprints: [s], tasks: [t], now: rdAt('2026-11-20', 12),
      statusHistories: histories([t], { [t.id]: [['completada', rdAt('2026-11-05', 12)]] }),
      sprintEvents: new Map(),
    });
    expect(remainingOf(r)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  describe('sprint activo', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('el corte de hoy usa la fecha RD y `now`; los días futuros son null', () => {
      vi.useFakeTimers();
      // 01:00Z del 05/11 = 21:00 RD del 04/11.
      vi.setSystemTime(new Date('2026-11-05T01:00:00Z'));
      const s = sprint({ status: 'activo' });
      const done = task({ sprintId: s.id, status: 'completada', completedAt: new Date('2026-11-05T00:30:00Z') });
      const tasks = [done, task({ sprintId: s.id })];
      const r = data(sprintBurndown({
        sprint: s, sprints: [s], tasks, now: new Date(),
        statusHistories: histories(tasks, { [done.id]: [['completada', new Date('2026-11-05T00:30:00Z')]] }),
        sprintEvents: new Map(),
      }));
      expect(r.points[3].date).toBe('2026-11-04');
      expect(remainingOf(r)).toEqual([2, 2, 2, 1, null, null]);
      expect(scopeOf(r)).toEqual([2, 2, 2, 2, null, null]);
      expect(r.points[5].ideal).toBe(0);
    });
  });
});

describe('sprintVelocity', () => {
  /** Sprint cerrado n (semanas desde el 05/10/2026) con una tarea completada de `points`. */
  function closedWith(n: number, points: number | null, extra: Partial<MetricsSprint> = {}) {
    const start = shiftDateRD('2026-10-05', n * 7);
    const end = shiftDateRD(start, 4);
    const s = sprint({ name: `Sprint ${n}`, startDate: start, endDate: end, updatedAt: rdAt(end, 18), ...extra });
    const doneAt = rdAt(start, 12);
    const t = task({ sprintId: s.id, estimate: points, status: 'completada', completedAt: doneAt, createdAt: rdAt(start, 9) });
    return { sprint: s, task: t, change: [['completada', doneAt]] as StatusChange[] };
  }

  function velocityOf(items: ReturnType<typeof closedWith>[], extraSprints: MetricsSprint[] = [], extraTasks: MetricsTask[] = []) {
    const tasks = [...items.map(i => i.task), ...extraTasks];
    return sprintVelocity({
      sprints: [...items.map(i => i.sprint), ...extraSprints],
      tasks,
      statusHistories: histories(tasks, Object.fromEntries(items.map(i => [i.task.id, i.change]))),
      sprintEvents: new Map(),
    });
  }

  it('las constantes son 6 sprints y ventana de 3', () => {
    expect(VELOCITY_SPRINTS).toBe(6);
    expect(MOVING_AVERAGE_WINDOW).toBe(3);
  });

  it('sin sprints cerrados enough=false y sin filas', () => {
    const active = sprint({ status: 'activo' });
    const v = velocityOf([], [active]);
    expect(v).toEqual({ enough: false, closedCount: 0, rows: [] });
  });

  it('con 1 sprint cerrado enough=false', () => {
    const v = velocityOf([closedWith(0, 3)]);
    expect(v.enough).toBe(false);
    expect(v.closedCount).toBe(1);
    expect(v.rows).toHaveLength(1);
  });

  it('con 2 cerrados enough=true y la media del segundo es la de los dos', () => {
    const v = velocityOf([closedWith(0, 3), closedWith(1, 4)]);
    expect(v.enough).toBe(true);
    expect(v.rows.map(r => r.points)).toEqual([3, 4]);
    expect(v.rows.map(r => r.avgPoints)).toEqual([3, 3.5]);
    expect(v.rows.map(r => r.avgTasks)).toEqual([1, 1]);
  });

  it('con 8 cerrados usa los 6 más recientes en orden cronológico y la media móvil de 3', () => {
    const values = [9, 9, 1, 2, 4, 7, 3, 5];
    const items = values.map((p, n) => closedWith(n, p));
    // Desordenados a propósito; el activo y el planificado no entran.
    const active = sprint({ status: 'activo', startDate: '2026-12-07', endDate: '2026-12-11' });
    const planned = sprint({ status: 'planificado', startDate: '2026-12-14', endDate: '2026-12-18' });
    const activeDone = task({ sprintId: active.id, estimate: 50, status: 'completada', completedAt: rdAt('2026-12-07', 12) });
    const v = velocityOf([...items].reverse(), [active, planned], [activeDone]);
    expect(v.closedCount).toBe(8);
    expect(v.rows.map(r => r.name)).toEqual(['Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6', 'Sprint 7']);
    expect(v.rows.map(r => r.points)).toEqual([1, 2, 4, 7, 3, 5]);
    expect(v.rows.map(r => r.tasks)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(v.rows.map(r => r.avgPoints)).toEqual([1, 1.5, 2.3, 4.3, 4.7, 5]);
    expect(v.rows[0]).toMatchObject({
      sprintId: items[2].sprint.id, startDate: items[2].sprint.startDate, endDate: items[2].sprint.endDate,
    });
  });

  it('si dos sprints terminan el mismo día desempata por updatedAt', () => {
    const items = [0, 1, 2, 3, 4, 5].map(n => closedWith(n, n + 1));
    const twin = closedWith(0, 10, { name: 'Sprint 0b', updatedAt: rdAt(items[0].sprint.endDate, 19) });
    const v = velocityOf([...items, twin]);
    expect(v.rows.map(r => r.name)).toEqual(['Sprint 0b', 'Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5']);
  });

  it('cuenta tareas y puntos (sin estimar = 0) de las completadas en el sprint al cierre', () => {
    const a = closedWith(0, null);
    const v = velocityOf([a]);
    expect(v.rows[0]).toMatchObject({ points: 0, tasks: 1 });
  });

  it('una tarea reabierta no cuenta salvo que se completara de nuevo antes del cierre', () => {
    const s = sprint({});
    const reopened = task({ sprintId: s.id, estimate: 3, status: 'en_proceso' });
    const redone = task({ sprintId: s.id, estimate: 5, status: 'completada', completedAt: rdAt('2026-11-05', 12) });
    const tasks = [reopened, redone];
    const v = sprintVelocity({
      sprints: [s], tasks, sprintEvents: new Map(),
      statusHistories: histories(tasks, {
        [reopened.id]: [['completada', rdAt('2026-11-03', 12)], ['en_proceso', rdAt('2026-11-04', 12)]],
        [redone.id]: [['completada', rdAt('2026-11-03', 12)], ['en_proceso', rdAt('2026-11-04', 12)], ['completada', rdAt('2026-11-05', 12)]],
      }),
    });
    expect(v.rows[0]).toMatchObject({ points: 5, tasks: 1 });
  });

  it('un movimiento posterior al cierre no altera la velocidad', () => {
    const s = sprint({});
    const t = task({ sprintId: null, estimate: 2, status: 'completada', completedAt: rdAt('2026-11-04', 12) });
    const v = sprintVelocity({
      sprints: [s], tasks: [t],
      statusHistories: histories([t], { [t.id]: [['completada', rdAt('2026-11-04', 12)]] }),
      sprintEvents: eventsMap([
        sprintEvent(t.id, rdAt('2026-11-02', 9), 'Backlog', 'Sprint 1', { from: null, to: s.id }),
        sprintEvent(t.id, rdAt('2026-11-07', 9), 'Sprint 1', 'Backlog', { from: s.id, to: null }),
      ]),
    });
    expect(v.rows[0]).toMatchObject({ points: 2, tasks: 1 });
  });
});

describe('projectSprintMetrics', () => {
  it('devuelve burndowns del activo y de los cerrados (no de los planificados) y la velocidad', () => {
    const closed = sprint({});
    const active = sprint({ status: 'activo', name: 'Sprint 2', startDate: '2026-11-09', endDate: '2026-11-13' });
    const planned = sprint({ status: 'planificado', name: 'Sprint 3', startDate: '2026-11-16', endDate: '2026-11-20' });
    const tasks = [task({ sprintId: closed.id }), task({ sprintId: active.id }), task({ sprintId: planned.id })];
    const r = projectSprintMetrics({
      sprints: [closed, active, planned], tasks, statusHistories: histories(tasks), sprintEvents: new Map(),
      now: rdAt('2026-11-10', 12),
    });
    expect(Object.keys(r.burndowns).sort()).toEqual([closed.id, active.id].sort());
    expect(r.burndowns[closed.id].kind).toBe('data');
    expect(r.velocity.closedCount).toBe(1);
  });
});
