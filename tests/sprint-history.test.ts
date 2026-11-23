import { describe, expect, it } from 'vitest';
import {
  isEntryInto, isExitFrom, isInSprintAt, sprintChangeReason, sprintMembership,
  type SprintChangeEvent,
} from '../src/lib/sprint-history';

const sprint = { id: crypto.randomUUID(), name: 'Sprint 7' };
const other = { id: crypto.randomUUID(), name: 'Sprint 8' };
const homonym = { id: crypto.randomUUID(), name: 'Sprint 7' };
const taskId = crypto.randomUUID();

const at = (iso: string) => new Date(iso);

function move(from: { id: string; name: string } | null, to: { id: string; name: string } | null, when: string): SprintChangeEvent {
  return {
    taskId,
    previousValue: from?.name ?? 'Backlog',
    newValue: to?.name ?? 'Backlog',
    reason: sprintChangeReason(from?.id ?? null, to?.id ?? null),
    at: at(when),
  };
}

function legacy(previousValue: string | null, newValue: string | null, when: string): SprintChangeEvent {
  return { taskId, previousValue, newValue, reason: null, at: at(when) };
}

describe('isExitFrom', () => {
  it('con ids compara reason.from con el id del sprint', () => {
    expect(isExitFrom(move(sprint, other, '2026-11-05T12:00:00Z'), sprint)).toBe(true);
    expect(isExitFrom(move(other, sprint, '2026-11-05T12:00:00Z'), sprint)).toBe(false);
    expect(isExitFrom(move(null, sprint, '2026-11-05T12:00:00Z'), sprint)).toBe(false);
  });

  it('en eventos heredados sin JSON compara previousValue con el nombre', () => {
    expect(isExitFrom(legacy('Sprint 7', 'Backlog', '2026-11-05T12:00:00Z'), sprint)).toBe(true);
    expect(isExitFrom(legacy('Backlog', 'Sprint 7', '2026-11-05T12:00:00Z'), sprint)).toBe(false);
  });

  it('con ids no confunde sprints homónimos', () => {
    const e = move(homonym, null, '2026-11-05T12:00:00Z');
    expect(isExitFrom(e, sprint)).toBe(false);
    expect(isExitFrom(e, homonym)).toBe(true);
    expect(isEntryInto(move(null, homonym, '2026-11-05T12:00:00Z'), sprint)).toBe(false);
  });
});

describe('sprintMembership', () => {
  it('sin eventos: siempre dentro si currentlyIn, ningún intervalo si no', () => {
    expect(sprintMembership([], sprint, true)).toEqual([{ from: null, to: null }]);
    expect(sprintMembership([], sprint, false)).toEqual([]);
  });

  it('entrada y salida a mitad: un intervalo cerrado', () => {
    const events = [
      move(null, sprint, '2026-11-04T12:00:00Z'),
      move(sprint, null, '2026-11-06T12:00:00Z'),
    ];
    expect(sprintMembership(events, sprint, false)).toEqual([
      { from: at('2026-11-04T12:00:00Z'), to: at('2026-11-06T12:00:00Z') },
    ]);
  });

  it('ordena los eventos por fecha aunque lleguen desordenados', () => {
    const events = [
      move(sprint, null, '2026-11-06T12:00:00Z'),
      move(null, sprint, '2026-11-04T12:00:00Z'),
    ];
    expect(sprintMembership(events, sprint, false)).toEqual([
      { from: at('2026-11-04T12:00:00Z'), to: at('2026-11-06T12:00:00Z') },
    ]);
  });

  it('salida, reentrada y salida: dos intervalos, el primero desde siempre', () => {
    const events = [
      move(sprint, null, '2026-11-04T12:00:00Z'),
      move(null, sprint, '2026-11-05T12:00:00Z'),
      move(sprint, other, '2026-11-07T12:00:00Z'),
    ];
    expect(sprintMembership(events, sprint, false)).toEqual([
      { from: null, to: at('2026-11-04T12:00:00Z') },
      { from: at('2026-11-05T12:00:00Z'), to: at('2026-11-07T12:00:00Z') },
    ]);
  });

  it('primer evento de salida: intervalo con from null', () => {
    const events = [move(sprint, other, '2026-11-04T12:00:00Z')];
    expect(sprintMembership(events, sprint, false)).toEqual([{ from: null, to: at('2026-11-04T12:00:00Z') }]);
  });

  it('entrada sin salida y currentlyIn: intervalo abierto', () => {
    const events = [move(null, sprint, '2026-11-04T12:00:00Z')];
    expect(sprintMembership(events, sprint, true)).toEqual([{ from: at('2026-11-04T12:00:00Z'), to: null }]);
  });

  it('eventos de otros sprints no cambian la pertenencia', () => {
    const events = [move(null, other, '2026-11-04T12:00:00Z'), move(other, null, '2026-11-05T12:00:00Z')];
    expect(sprintMembership(events, sprint, false)).toEqual([]);
  });

  it('estado final incoherente con currentlyIn: se confía en currentlyIn desde el último evento', () => {
    // El historial dice que salió, pero la tarea sigue en el sprint (datos heredados).
    const out = sprintMembership([move(null, sprint, '2026-11-04T12:00:00Z'), move(sprint, null, '2026-11-06T12:00:00Z')], sprint, true);
    expect(out).toEqual([
      { from: at('2026-11-04T12:00:00Z'), to: at('2026-11-06T12:00:00Z') },
      { from: at('2026-11-06T12:00:00Z'), to: null },
    ]);
    // El historial dice que entró en el último evento, pero ya no está: el tramo
    // quedaría vacío (de T a T) y no se emite.
    const gone = sprintMembership([move(null, sprint, '2026-11-04T12:00:00Z')], sprint, false);
    expect(gone).toEqual([]);
    const goneLater = sprintMembership([
      move(null, sprint, '2026-11-04T12:00:00Z'),
      move(other, sprint, '2026-11-05T12:00:00Z'),
    ], sprint, false);
    expect(goneLater).toEqual([{ from: at('2026-11-04T12:00:00Z'), to: at('2026-11-05T12:00:00Z') }]);
  });

  it('eventos heredados se reconocen por nombre', () => {
    const events = [legacy('Backlog', 'Sprint 7', '2026-11-04T12:00:00Z'), legacy('Sprint 7', 'Backlog', '2026-11-06T12:00:00Z')];
    expect(sprintMembership(events, sprint, false)).toEqual([
      { from: at('2026-11-04T12:00:00Z'), to: at('2026-11-06T12:00:00Z') },
    ]);
  });

  it('nunca lanza con reason inválido o valores nulos', () => {
    const weird: SprintChangeEvent[] = [
      { taskId, previousValue: null, newValue: null, reason: '{no', at: at('2026-11-04T12:00:00Z') },
    ];
    expect(() => sprintMembership(weird, sprint, true)).not.toThrow();
  });
});

describe('isInSprintAt', () => {
  const intervals = [{ from: at('2026-11-04T12:00:00Z'), to: at('2026-11-06T12:00:00Z') }];

  it('from inclusivo y to exclusivo', () => {
    expect(isInSprintAt(intervals, at('2026-11-04T11:59:59.999Z'))).toBe(false);
    expect(isInSprintAt(intervals, at('2026-11-04T12:00:00Z'))).toBe(true);
    expect(isInSprintAt(intervals, at('2026-11-06T11:59:59.999Z'))).toBe(true);
    expect(isInSprintAt(intervals, at('2026-11-06T12:00:00Z'))).toBe(false);
  });

  it('from null y to null son abiertos', () => {
    expect(isInSprintAt([{ from: null, to: null }], at('1990-01-01T00:00:00Z'))).toBe(true);
    expect(isInSprintAt([{ from: null, to: at('2026-11-04T12:00:00Z') }], at('2000-01-01T00:00:00Z'))).toBe(true);
    expect(isInSprintAt([], at('2026-11-04T12:00:00Z'))).toBe(false);
  });
});
