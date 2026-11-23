import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSprintSummary,
  type SprintSummaryInput,
  type SummaryTask,
} from '../src/lib/sprint-summary';
import {
  lastEntryInto,
  parseSprintChangeReason,
  sprintChangeReason,
  type SprintChangeEvent,
} from '../src/lib/sprint-history';
import type { StatusSegment } from '../src/lib/status-history';

const sprintId = crypto.randomUUID();
const otherSprintId = crypto.randomUUID();
const nextId = crypto.randomUUID();
const ana = crypto.randomUUID();
const beto = crypto.randomUUID();

const sprint = {
  id: sprintId,
  name: 'Sprint 3',
  startDate: '2026-11-02',
  startedAt: new Date('2026-11-02T14:00:00Z'),
};

function task(overrides: Partial<SummaryTask> & { id: string }): SummaryTask {
  return {
    status: 'no_iniciada',
    estimate: null,
    responsibleId: ana,
    responsibleName: 'Ana',
    blockedByArea: null,
    createdAt: new Date('2026-10-30T12:00:00Z'),
    completedAt: null,
    ...overrides,
  };
}

function entry(taskId: string, at: string, overrides: Partial<SprintChangeEvent> = {}): SprintChangeEvent {
  return {
    taskId,
    previousValue: 'Backlog',
    newValue: sprint.name,
    reason: sprintChangeReason(null, sprintId),
    at: new Date(at),
    ...overrides,
  };
}

function input(overrides: Partial<SprintSummaryInput> = {}): SprintSummaryInput {
  return {
    sprint,
    scope: [],
    carryTarget: { sprintId: nextId, name: 'Sprint 4' },
    sprintEvents: new Map(),
    statusHistories: new Map(),
    businessDaysOnly: false,
    holidays: new Set(),
    closedOn: '2026-11-13',
    ...overrides,
  };
}

/** Historial mínimo: creada → en_proceso (start) → completada (end). */
function history(createdAt: Date, start: Date | null, end: Date): StatusSegment[] {
  if (!start) return [{ status: 'no_iniciada', from: createdAt, to: end }, { status: 'completada', from: end, to: null }];
  return [
    { status: 'no_iniciada', from: createdAt, to: start },
    { status: 'en_proceso', from: start, to: end },
    { status: 'completada', from: end, to: null },
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T01:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildSprintSummary: comprometido, completado y arrastrado', () => {
  it('cuenta tareas y puntos (estimate null = 0) y guarda el destino del arrastre', () => {
    const summary = buildSprintSummary(input({
      scope: [
        task({ id: 't1', status: 'completada', estimate: 5, completedAt: new Date('2026-11-10T15:00:00Z') }),
        task({ id: 't2', status: 'en_proceso', estimate: 3 }),
        task({ id: 't3', status: 'no_iniciada', estimate: null }),
        task({ id: 't4', status: 'bloqueada', estimate: 2, blockedByArea: 'qa' }),
      ],
    }));

    expect(summary.version).toBe(1);
    expect(summary.closedOn).toBe('2026-11-13');
    expect(summary.businessDaysOnly).toBe(false);
    expect(summary.committed).toEqual({ tasks: 4, points: 10 });
    expect(summary.completed).toEqual({ tasks: 1, points: 5 });
    expect(summary.carriedOver).toEqual({ tasks: 3, points: 5, to: { sprintId: nextId, name: 'Sprint 4' } });
    expect(summary.addedMidSprint).toEqual({ tasks: 0, points: 0 });
  });

  it('arrastre al backlog: to con sprintId null', () => {
    const summary = buildSprintSummary(input({
      scope: [task({ id: 't1' })],
      carryTarget: { sprintId: null, name: 'Backlog' },
    }));
    expect(summary.carriedOver.to).toEqual({ sprintId: null, name: 'Backlog' });
  });
});

describe('buildSprintSummary: añadidas a mitad de sprint', () => {
  it('entrada con reason.to = id después de startedAt → añadida y no comprometida', () => {
    const summary = buildSprintSummary(input({
      scope: [task({ id: 't1', estimate: 3 }), task({ id: 't2', estimate: 2 })],
      sprintEvents: new Map([['t1', [entry('t1', '2026-11-05T15:00:00Z')]]]),
    }));
    expect(summary.addedMidSprint).toEqual({ tasks: 1, points: 3 });
    expect(summary.committed).toEqual({ tasks: 1, points: 2 });
  });

  it('entrada antes de startedAt → comprometida', () => {
    const summary = buildSprintSummary(input({
      scope: [task({ id: 't1', estimate: 3 })],
      sprintEvents: new Map([['t1', [entry('t1', '2026-11-02T13:00:00Z')]]]),
    }));
    expect(summary.addedMidSprint).toEqual({ tasks: 0, points: 0 });
    expect(summary.committed).toEqual({ tasks: 1, points: 3 });
  });

  it('cuenta la ÚLTIMA entrada: salió y volvió a entrar tras el inicio → añadida', () => {
    const summary = buildSprintSummary(input({
      scope: [task({ id: 't1', estimate: 3 })],
      sprintEvents: new Map([['t1', [
        entry('t1', '2026-11-01T13:00:00Z'),
        entry('t1', '2026-11-03T13:00:00Z', { previousValue: 'Sprint 3', newValue: 'Backlog', reason: sprintChangeReason(sprintId, null) }),
        entry('t1', '2026-11-04T13:00:00Z'),
      ]]]),
    }));
    expect(summary.addedMidSprint.tasks).toBe(1);
  });

  it('evento heredado sin JSON se reconoce por el nombre', () => {
    const summary = buildSprintSummary(input({
      scope: [task({ id: 't1', estimate: 1 })],
      sprintEvents: new Map([['t1', [entry('t1', '2026-11-05T15:00:00Z', { reason: null })]]]),
    }));
    expect(summary.addedMidSprint).toEqual({ tasks: 1, points: 1 });
  });

  it('evento con reason.to de otro sprint homónimo se ignora', () => {
    const summary = buildSprintSummary(input({
      scope: [task({ id: 't1', estimate: 1 })],
      sprintEvents: new Map([['t1', [
        entry('t1', '2026-11-05T15:00:00Z', { reason: sprintChangeReason(null, otherSprintId) }),
      ]]]),
    }));
    expect(summary.addedMidSprint.tasks).toBe(0);
    expect(summary.committed.tasks).toBe(1);
  });

  it('con startedAt null se compara la fecha RD del evento con startDate', () => {
    const summary = buildSprintSummary(input({
      sprint: { ...sprint, startedAt: null },
      scope: [task({ id: 'mismo-dia', estimate: 1 }), task({ id: 'despues', estimate: 2 })],
      sprintEvents: new Map([
        // 02:00Z del 3 = 22:00 RD del 2: mismo día que startDate → comprometida.
        ['mismo-dia', [entry('mismo-dia', '2026-11-03T02:00:00Z')]],
        ['despues', [entry('despues', '2026-11-03T12:00:00Z')]],
      ]),
    }));
    expect(summary.addedMidSprint).toEqual({ tasks: 1, points: 2 });
    expect(summary.committed).toEqual({ tasks: 1, points: 1 });
  });
});

describe('buildSprintSummary: bloqueos', () => {
  it('agrupa las bloqueadas por área y usa «otro» si es null', () => {
    const summary = buildSprintSummary(input({
      scope: [
        task({ id: 't1', status: 'bloqueada', blockedByArea: 'qa' }),
        task({ id: 't2', status: 'bloqueada', blockedByArea: 'qa' }),
        task({ id: 't3', status: 'bloqueada', blockedByArea: null }),
        task({ id: 't4', status: 'en_proceso', blockedByArea: 'diseno' }),
      ],
    }));
    expect(summary.blockersByArea).toEqual([{ area: 'qa', count: 2 }, { area: 'otro', count: 1 }]);
  });
});

describe('buildSprintSummary: tiempo de ciclo', () => {
  it('en días naturales: mediana y p85 de las completadas, withoutStart sin inicio', () => {
    const created = new Date('2026-11-01T12:00:00Z');
    const a = { start: new Date('2026-11-02T12:00:00Z'), end: new Date('2026-11-04T12:00:00Z') };
    const c = { start: new Date('2026-11-02T12:00:00Z'), end: new Date('2026-11-03T00:00:00Z') };
    const bEnd = new Date('2026-11-04T12:00:00Z');
    const summary = buildSprintSummary(input({
      scope: [
        task({ id: 'a', status: 'completada', createdAt: created, completedAt: a.end }),
        task({ id: 'b', status: 'completada', createdAt: created, completedAt: bEnd }),
        task({ id: 'c', status: 'completada', createdAt: created, completedAt: c.end }),
        task({ id: 'd', status: 'en_proceso', createdAt: created }),
      ],
      statusHistories: new Map([
        ['a', history(created, a.start, a.end)],
        ['b', history(created, null, bEnd)],
        ['c', history(created, c.start, c.end)],
      ]),
    }));
    expect(summary.cycleTime).toEqual({
      basis: 'cycle', unit: 'calendar', count: 3, median: 2, p85: 3, withoutStart: 1,
    });
  });

  it('en días hábiles: empieza el viernes y termina el lunes → 1', () => {
    const created = new Date('2026-11-01T12:00:00Z');
    const start = new Date('2026-11-06T15:00:00Z'); // viernes
    const end = new Date('2026-11-09T15:00:00Z'); // lunes
    const summary = buildSprintSummary(input({
      businessDaysOnly: true,
      scope: [task({ id: 'a', status: 'completada', createdAt: created, completedAt: end })],
      statusHistories: new Map([['a', history(created, start, end)]]),
    }));
    expect(summary.businessDaysOnly).toBe(true);
    expect(summary.cycleTime).toEqual({
      basis: 'cycle', unit: 'business', count: 1, median: 1, p85: 1, withoutStart: 0,
    });
  });

  it('en días hábiles: un feriado en medio lo descuenta', () => {
    const created = new Date('2026-11-01T12:00:00Z');
    const start = new Date('2026-11-05T15:00:00Z'); // jueves
    const end = new Date('2026-11-09T15:00:00Z'); // lunes
    const scope = [task({ id: 'a', status: 'completada', createdAt: created, completedAt: end })];
    const statusHistories = new Map([['a', history(created, start, end)]]);

    const without = buildSprintSummary(input({ businessDaysOnly: true, scope, statusHistories }));
    const withHoliday = buildSprintSummary(input({
      businessDaysOnly: true, scope, statusHistories, holidays: new Set(['2026-11-06']),
    }));
    expect(without.cycleTime.median).toBe(2);
    expect(withHoliday.cycleTime.median).toBe(1);
  });

  it('en días hábiles usa la fecha RD del instante (02:00Z del martes = lunes en RD)', () => {
    const created = new Date('2026-11-01T12:00:00Z');
    const start = new Date('2026-11-06T15:00:00Z'); // viernes
    const end = new Date('2026-11-10T02:00:00Z'); // lunes 22:00 RD
    const summary = buildSprintSummary(input({
      businessDaysOnly: true,
      scope: [task({ id: 'a', status: 'completada', createdAt: created, completedAt: end })],
      statusHistories: new Map([['a', history(created, start, end)]]),
    }));
    expect(summary.cycleTime.median).toBe(1);
  });
});

describe('buildSprintSummary: sprint vacío y por persona', () => {
  it('sprint vacío → ceros y mediana/p85 null', () => {
    const summary = buildSprintSummary(input({ carryTarget: { sprintId: null, name: 'Backlog' } }));
    expect(summary.committed).toEqual({ tasks: 0, points: 0 });
    expect(summary.completed).toEqual({ tasks: 0, points: 0 });
    expect(summary.carriedOver).toEqual({ tasks: 0, points: 0, to: { sprintId: null, name: 'Backlog' } });
    expect(summary.addedMidSprint).toEqual({ tasks: 0, points: 0 });
    expect(summary.blockersByArea).toEqual([]);
    expect(summary.cycleTime).toEqual({
      basis: 'cycle', unit: 'calendar', count: 0, median: null, p85: null, withoutStart: 0,
    });
    expect(summary.byPerson).toEqual([]);
  });

  it('byPerson: comprometido sin las añadidas y completado con todas, ordenado por nombre', () => {
    const done = new Date('2026-11-10T15:00:00Z');
    const summary = buildSprintSummary(input({
      scope: [
        task({ id: 't1', responsibleId: beto, responsibleName: 'Beto', status: 'completada', estimate: 5, completedAt: done }),
        task({ id: 't2', responsibleId: beto, responsibleName: 'Beto', status: 'en_proceso', estimate: 3 }),
        task({ id: 't3', responsibleId: ana, responsibleName: 'Ana', status: 'completada', estimate: 2, completedAt: done }),
      ],
      sprintEvents: new Map([['t3', [entry('t3', '2026-11-05T15:00:00Z')]]]),
    }));
    expect(summary.byPerson).toEqual([
      { personId: ana, name: 'Ana', committedTasks: 0, committedPoints: 0, completedTasks: 1, completedPoints: 2 },
      { personId: beto, name: 'Beto', committedTasks: 2, committedPoints: 8, completedTasks: 1, completedPoints: 5 },
    ]);
  });
});

describe('sprint-history', () => {
  it('sprintChangeReason serializa los ids', () => {
    expect(sprintChangeReason(null, sprintId)).toBe(`{"from":null,"to":"${sprintId}"}`);
    expect(JSON.parse(sprintChangeReason(sprintId, null))).toEqual({ from: sprintId, to: null });
  });

  it('parseSprintChangeReason acepta from/to uuid o null', () => {
    expect(parseSprintChangeReason(sprintChangeReason(sprintId, otherSprintId))).toEqual({ from: sprintId, to: otherSprintId });
    expect(parseSprintChangeReason(sprintChangeReason(null, null))).toEqual({ from: null, to: null });
  });

  it.each([
    ['null', null],
    ['vacío', ''],
    ['JSON inválido', '{no'],
    ['texto libre', 'Moderado por admin'],
    ['array', '[1,2]'],
    ['null JSON', 'null'],
    ['número', '5'],
    ['sin to', `{"from":null}`],
    ['sin from', `{"to":null}`],
    ['valor no uuid', '{"from":null,"to":"sprint-3"}'],
    ['valor numérico', '{"from":null,"to":3}'],
    ['claves del prototipo', '{"__proto__":{"from":null,"to":null}}'],
  ])('parseSprintChangeReason rechaza %s', (_label, value) => {
    expect(parseSprintChangeReason(value)).toBeNull();
  });

  it('lastEntryInto devuelve la última entrada y null si no hay', () => {
    const events = [
      entry('t1', '2026-11-01T13:00:00Z'),
      entry('t1', '2026-11-04T13:00:00Z'),
      entry('t1', '2026-11-03T13:00:00Z'),
      entry('t1', '2026-11-06T13:00:00Z', { reason: sprintChangeReason(sprintId, null), newValue: 'Backlog' }),
    ];
    expect(lastEntryInto(events, sprint)?.toISOString()).toBe('2026-11-04T13:00:00.000Z');
    expect(lastEntryInto([], sprint)).toBeNull();
  });
});
