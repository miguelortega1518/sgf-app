import { describe, expect, it } from 'vitest';
import { buildSprintBurndown, type BurndownTask, type SprintBurndownInput } from '../src/lib/sprint-burndown';
import { sprintChangeReason, type SprintChangeEvent } from '../src/lib/sprint-history';
import { buildStatusHistory, type StatusEvent, type StatusSegment } from '../src/lib/status-history';

// Noviembre de 2026: el 2 es lunes y el 7 sábado. RD es UTC−4.
const SPRINT_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();

/** Instante en hora RD: rd('2026-11-03', 12) = 3 nov a las 12:00 RD. */
const rd = (date: string, hour = 12, minute = 0) => new Date(`${date}T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);

const BEFORE = new Date('2026-10-20T12:00:00Z');

function task(overrides: Partial<BurndownTask> = {}): BurndownTask {
  return {
    id: crypto.randomUUID(), status: 'no_iniciada', estimate: null, createdAt: BEFORE, completedAt: null,
    sprintId: SPRINT_ID, ...overrides,
  };
}

function sprintMove(taskId: string, from: string | null, to: string | null, at: Date): SprintChangeEvent {
  const name = (id: string | null) => (id === SPRINT_ID ? 'Sprint 7' : id === OTHER_ID ? 'Sprint 8' : 'Backlog');
  return { taskId, previousValue: name(from), newValue: name(to), reason: sprintChangeReason(from, to), at };
}

function statusEvent(taskId: string, previousValue: string, newValue: string, at: Date): StatusEvent {
  return { taskId, previousValue, newValue, at };
}

function input(overrides: Partial<SprintBurndownInput> & {
  statusEvents?: Map<string, StatusEvent[]>;
} = {}): SprintBurndownInput {
  const { statusEvents, ...rest } = overrides;
  const tasks = rest.tasks ?? [];
  const statusHistories = rest.statusHistories ?? new Map<string, StatusSegment[]>(
    tasks.map(t => [t.id, buildStatusHistory(t, statusEvents?.get(t.id) ?? [])]),
  );
  return {
    sprint: {
      id: SPRINT_ID, name: 'Sprint 7', status: 'activo', startDate: '2026-11-02', endDate: '2026-11-06',
      startedAt: rd('2026-11-02', 9), closedAt: null,
    },
    tasks,
    sprintEvents: new Map(),
    statusHistories,
    businessDaysOnly: false,
    holidays: new Set(),
    now: rd('2026-11-10'),
    ...rest,
  };
}

const remaining = (b: ReturnType<typeof buildSprintBurndown>) => b.entries.map(e => e.remaining);
const scope = (b: ReturnType<typeof buildSprintBurndown>) => b.entries.map(e => e.scope);
const dates = (b: ReturnType<typeof buildSprintBurndown>) => b.entries.map(e => e.date);

describe('buildSprintBurndown', () => {
  it('sin estimaciones: unidad tareas, una entrada de inicio y una por día', () => {
    const done = task({ status: 'completada', completedAt: rd('2026-11-03') });
    const tasks = [task(), task(), done, task({ sprintId: null, estimate: 8 })];
    const b = buildSprintBurndown(input({
      tasks,
      statusEvents: new Map([[done.id, [statusEvent(done.id, 'no_iniciada', 'completada', rd('2026-11-03'))]]]),
    }));

    expect(b.unit).toBe('tasks');
    expect(b.businessDaysOnly).toBe(false);
    expect(b.startDate).toBe('2026-11-02');
    expect(b.endDate).toBe('2026-11-06');
    expect(dates(b)).toEqual(['2026-11-02', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(b.entries.map(e => e.kind)).toEqual(['start', 'day', 'day', 'day', 'day', 'day']);
    expect(scope(b)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(remaining(b)).toEqual([3, 3, 2, 2, 2, 2]);
    expect(b.entries.map(e => e.ideal)).toEqual([3, 2.4, 1.8, 1.2, 0.6, 0]);
  });

  it('el alcance sube el día que se añade una tarea y baja el día que se quita', () => {
    const base = task();
    const added = task();
    const removed = task({ sprintId: null });
    const b = buildSprintBurndown(input({
      tasks: [base, added, removed],
      sprintEvents: new Map([
        [added.id, [sprintMove(added.id, null, SPRINT_ID, rd('2026-11-03'))]],
        [removed.id, [sprintMove(removed.id, SPRINT_ID, null, rd('2026-11-04'))]],
      ]),
    }));

    expect(scope(b)).toEqual([2, 2, 3, 2, 2, 2]);
    expect(remaining(b)).toEqual([2, 2, 3, 2, 2, 2]);
    expect(b.entries[0].ideal).toBe(2);
  });

  it('una tarea que salió hacia otro sprint sigue siendo candidata aunque ya no esté', () => {
    const moved = task({ sprintId: OTHER_ID, estimate: 5 });
    const b = buildSprintBurndown(input({
      tasks: [moved],
      sprintEvents: new Map([[moved.id, [sprintMove(moved.id, SPRINT_ID, OTHER_ID, rd('2026-11-05'))]]]),
    }));
    expect(b.unit).toBe('points');
    expect(scope(b)).toEqual([5, 5, 5, 5, 0, 0]);
  });

  it('sprint de 1 día: 2 entradas con ideal [S, 0]', () => {
    const b = buildSprintBurndown(input({
      sprint: {
        id: SPRINT_ID, name: 'Sprint 7', status: 'activo', startDate: '2026-11-03', endDate: '2026-11-03',
        startedAt: rd('2026-11-03', 8), closedAt: null,
      },
      tasks: [task(), task()],
    }));
    expect(b.entries).toHaveLength(2);
    expect(b.entries.map(e => e.ideal)).toEqual([2, 0]);
    expect(b.entries.map(e => e.kind)).toEqual(['start', 'day']);
  });

  it('una tarea completada y reabierta vuelve a sumar a lo que queda', () => {
    const t = task({ status: 'en_proceso' });
    const b = buildSprintBurndown(input({
      tasks: [t],
      statusEvents: new Map([[t.id, [
        statusEvent(t.id, 'no_iniciada', 'completada', rd('2026-11-03')),
        statusEvent(t.id, 'completada', 'en_proceso', rd('2026-11-04')),
      ]]]),
    }));
    expect(remaining(b)).toEqual([1, 1, 0, 1, 1, 1]);
    expect(scope(b)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('con días hábiles se saltan fines de semana y feriados', () => {
    const b = buildSprintBurndown(input({
      sprint: {
        id: SPRINT_ID, name: 'Sprint 7', status: 'activo', startDate: '2026-11-05', endDate: '2026-11-10',
        startedAt: rd('2026-11-05', 8), closedAt: null,
      },
      tasks: [task()],
      businessDaysOnly: true,
      holidays: new Set(['2026-11-09']),
      now: rd('2026-11-20'),
    }));
    expect(b.businessDaysOnly).toBe(true);
    expect(dates(b)).toEqual(['2026-11-05', '2026-11-05', '2026-11-06', '2026-11-10']);
    expect(b.entries.map(e => e.ideal)).toEqual([1, 0.7, 0.3, 0]);
  });

  it('un sprint entero en fin de semana usa los días naturales', () => {
    const b = buildSprintBurndown(input({
      sprint: {
        id: SPRINT_ID, name: 'Sprint 7', status: 'activo', startDate: '2026-11-07', endDate: '2026-11-08',
        startedAt: rd('2026-11-07', 8), closedAt: null,
      },
      tasks: [task()],
      businessDaysOnly: true,
    }));
    expect(dates(b)).toEqual(['2026-11-07', '2026-11-07', '2026-11-08']);
  });

  it('sprint activo: los días futuros no tienen restante ni alcance, pero sí ideal', () => {
    const t = task({ status: 'completada', completedAt: rd('2026-11-04', 10) });
    const b = buildSprintBurndown(input({
      tasks: [t, task()],
      statusEvents: new Map([[t.id, [statusEvent(t.id, 'no_iniciada', 'completada', rd('2026-11-04', 10))]]]),
      now: rd('2026-11-04', 12),
    }));
    expect(remaining(b)).toEqual([2, 2, 2, 1, null, null]);
    expect(scope(b)).toEqual([2, 2, 2, 2, null, null]);
    expect(b.entries.map(e => e.ideal)).toEqual([2, 1.6, 1.2, 0.8, 0.4, 0]);
  });

  it('el día en curso usa `now` como corte', () => {
    const t = task({ status: 'completada', completedAt: rd('2026-11-04', 15) });
    const b = buildSprintBurndown(input({
      tasks: [t],
      statusEvents: new Map([[t.id, [statusEvent(t.id, 'no_iniciada', 'completada', rd('2026-11-04', 15))]]]),
      now: rd('2026-11-04', 12),
    }));
    // La tarea se completa después de `now`: hoy aún queda.
    expect(b.entries[3].remaining).toBe(1);
  });

  it('sprint cerrado con arrastre al cerrar: el último día conserva lo pendiente', () => {
    const closedAt = rd('2026-11-06', 18);
    const done = task({ status: 'completada', completedAt: rd('2026-11-03'), estimate: 3 });
    const carried = task({ sprintId: OTHER_ID, estimate: 5 });
    // Movida a mano después del cierre (desde el sprint siguiente): no afecta.
    const later = task({ sprintId: null, estimate: 2 });
    const b = buildSprintBurndown(input({
      sprint: {
        id: SPRINT_ID, name: 'Sprint 7', status: 'cerrado', startDate: '2026-11-02', endDate: '2026-11-06',
        startedAt: rd('2026-11-02', 9), closedAt,
      },
      tasks: [done, carried, later],
      sprintEvents: new Map([
        // La auditoría usa la hora de inicio de la transacción: algo antes de updated_at.
        [carried.id, [sprintMove(carried.id, SPRINT_ID, OTHER_ID, new Date(closedAt.getTime() - 500))]],
        [later.id, [
          sprintMove(later.id, SPRINT_ID, OTHER_ID, new Date(closedAt.getTime() - 400)),
          sprintMove(later.id, OTHER_ID, null, rd('2026-11-09')),
        ]],
      ]),
      statusEvents: new Map([[done.id, [statusEvent(done.id, 'no_iniciada', 'completada', rd('2026-11-03'))]]]),
      now: rd('2026-11-20'),
    }));
    expect(b.unit).toBe('points');
    expect(scope(b)).toEqual([10, 10, 10, 10, 10, 10]);
    expect(remaining(b)).toEqual([10, 10, 7, 7, 7, 7]);
  });

  it('sprint cerrado antes del fin: los días posteriores al cierre repiten el estado del cierre', () => {
    const closedAt = rd('2026-11-04', 18);
    const carried = task({ sprintId: OTHER_ID });
    const completedLater = task({ sprintId: OTHER_ID, status: 'completada', completedAt: rd('2026-11-05') });
    const b = buildSprintBurndown(input({
      sprint: {
        id: SPRINT_ID, name: 'Sprint 7', status: 'cerrado', startDate: '2026-11-02', endDate: '2026-11-06',
        startedAt: rd('2026-11-02', 9), closedAt,
      },
      tasks: [carried, completedLater],
      sprintEvents: new Map([
        [carried.id, [sprintMove(carried.id, SPRINT_ID, OTHER_ID, new Date(closedAt.getTime() - 500))]],
        [completedLater.id, [sprintMove(completedLater.id, SPRINT_ID, OTHER_ID, new Date(closedAt.getTime() - 500))]],
      ]),
      statusEvents: new Map([[completedLater.id, [statusEvent(completedLater.id, 'no_iniciada', 'completada', rd('2026-11-05'))]]]),
    }));
    expect(remaining(b)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(scope(b)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('en puntos, las tareas sin estimar valen 0', () => {
    const b = buildSprintBurndown(input({ tasks: [task({ estimate: 5 }), task({ estimate: null })] }));
    expect(b.unit).toBe('points');
    expect(scope(b)[0]).toBe(5);
    expect(remaining(b)[0]).toBe(5);
  });

  it('sin startedAt el inicio es el comienzo del día RD de startDate', () => {
    const early = task({ createdAt: rd('2026-11-02', 1) });
    const sprintBase = {
      id: SPRINT_ID, name: 'Sprint 7', status: 'activo' as const, startDate: '2026-11-02', endDate: '2026-11-06', closedAt: null,
    };
    const withoutStartedAt = buildSprintBurndown(input({ sprint: { ...sprintBase, startedAt: null }, tasks: [early] }));
    expect(withoutStartedAt.entries[0].date).toBe('2026-11-02');
    expect(withoutStartedAt.entries[0].scope).toBe(0);
    expect(withoutStartedAt.entries[1].scope).toBe(1);

    const withStartedAt = buildSprintBurndown(input({ sprint: { ...sprintBase, startedAt: rd('2026-11-02', 9) }, tasks: [early] }));
    expect(withStartedAt.entries[0].scope).toBe(1);
  });

  it('las tareas creadas a mitad de sprint sólo cuentan desde su creación', () => {
    const b = buildSprintBurndown(input({ tasks: [task(), task({ createdAt: rd('2026-11-04') })] }));
    expect(scope(b)).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('sin tareas: alcance 0 y línea ideal en 0', () => {
    const b = buildSprintBurndown(input({ tasks: [] }));
    expect(b.unit).toBe('tasks');
    expect(scope(b)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(remaining(b)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(b.entries.every(e => e.ideal === 0)).toBe(true);
  });
});
