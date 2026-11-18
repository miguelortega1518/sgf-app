import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPRINT_DEFAULT_BUSINESS_DAYS,
  SPRINT_DEFAULT_DAYS,
  SPRINT_GOAL_MAX,
  nextPlannedSprint,
  SPRINT_NAME_MAX,
  canTransitionSprint,
  defaultSprintDates,
  groupTasksBySprint,
  isValidSprintRange,
  type SprintTaskLike,
  type SprintLike,
} from '../src/lib/sprints';

describe('constantes de sprints', () => {
  it('2 semanas por defecto y límites de texto', () => {
    expect(SPRINT_DEFAULT_DAYS).toBe(14);
    expect(SPRINT_NAME_MAX).toBe(200);
    expect(SPRINT_GOAL_MAX).toBe(2000);
  });
});

describe('defaultSprintDates', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'Asia/Tokyo';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('control: con TZ Asia/Tokyo el cambio de zona surte efecto', () => {
    // 01:00Z del 18 es ya las 10:00 del 18 en Tokio.
    expect(new Date().getDate()).toBe(18);
  });

  it('empieza el día dado y termina 13 días después (14 días en total)', () => {
    expect(defaultSprintDates('2026-11-17')).toEqual({ startDate: '2026-11-17', endDate: '2026-11-30' });
  });

  it('cruza meses y años sin desfases de zona horaria', () => {
    expect(defaultSprintDates('2026-12-25')).toEqual({ startDate: '2026-12-25', endDate: '2027-01-07' });
    expect(defaultSprintDates('2028-02-20')).toEqual({ startDate: '2028-02-20', endDate: '2028-03-04' });
  });

  it('con businessDaysOnly: false mantiene los 14 días naturales', () => {
    expect(defaultSprintDates('2026-11-17', { businessDaysOnly: false, holidays: new Set(['2026-11-20']) }))
      .toEqual({ startDate: '2026-11-17', endDate: '2026-11-30' });
  });

  it('con días hábiles: inicio lunes 2026-11-02 → fin viernes 2026-11-13 (10 días hábiles)', () => {
    expect(SPRINT_DEFAULT_BUSINESS_DAYS).toBe(10);
    expect(defaultSprintDates('2026-11-02', { businessDaysOnly: true, holidays: new Set() }))
      .toEqual({ startDate: '2026-11-02', endDate: '2026-11-13' });
  });

  it('con días hábiles: un feriado en medio desplaza el fin un día hábil', () => {
    expect(defaultSprintDates('2026-11-02', { businessDaysOnly: true, holidays: new Set(['2026-11-06']) }))
      .toEqual({ startDate: '2026-11-02', endDate: '2026-11-16' });
  });

  it('con días hábiles: si empieza en sábado, cuenta desde el lunes', () => {
    expect(defaultSprintDates('2026-11-07', { businessDaysOnly: true, holidays: new Set() }))
      .toEqual({ startDate: '2026-11-07', endDate: '2026-11-20' });
  });

  it('con días hábiles: si el inicio es feriado, no cuenta', () => {
    expect(defaultSprintDates('2026-11-02', { businessDaysOnly: true, holidays: new Set(['2026-11-02']) }))
      .toEqual({ startDate: '2026-11-02', endDate: '2026-11-16' });
  });

  it('con días hábiles y sin feriados explícitos usa un conjunto vacío', () => {
    expect(defaultSprintDates('2026-11-02', { businessDaysOnly: true }))
      .toEqual({ startDate: '2026-11-02', endDate: '2026-11-13' });
  });
});

describe('nextPlannedSprint', () => {
  it('elige el planificado con menor startDate', () => {
    const sprints = [
      { id: 'a', status: 'planificado' as const, startDate: '2026-12-01', createdAt: '2026-11-01T00:00:00Z' },
      { id: 'b', status: 'planificado' as const, startDate: '2026-11-17', createdAt: '2026-11-02T00:00:00Z' },
      { id: 'c', status: 'activo' as const, startDate: '2026-11-01', createdAt: '2026-10-01T00:00:00Z' },
      { id: 'd', status: 'cerrado' as const, startDate: '2026-10-01', createdAt: '2026-09-01T00:00:00Z' },
    ];
    expect(nextPlannedSprint(sprints)?.id).toBe('b');
  });

  it('a igualdad de startDate, el creado antes (acepta Date y string)', () => {
    const sprints = [
      { id: 'late', status: 'planificado' as const, startDate: '2026-11-17', createdAt: new Date('2026-11-05T00:00:00Z') },
      { id: 'early', status: 'planificado' as const, startDate: '2026-11-17', createdAt: '2026-11-03T00:00:00Z' },
    ];
    expect(nextPlannedSprint(sprints)?.id).toBe('early');
  });

  it('sin planificados devuelve null', () => {
    expect(nextPlannedSprint([{ id: 'x', status: 'activo' as const, startDate: '2026-11-01', createdAt: '2026-10-01T00:00:00Z' }]))
      .toBeNull();
    expect(nextPlannedSprint([])).toBeNull();
  });
});

describe('canTransitionSprint', () => {
  it.each([
    ['planificado', 'activo'],
    ['activo', 'cerrado'],
  ] as const)('%s → %s está permitido', (from, to) => {
    expect(canTransitionSprint(from, to)).toBe(true);
  });

  it.each([
    ['planificado', 'cerrado'],
    ['planificado', 'planificado'],
    ['activo', 'activo'],
    ['activo', 'planificado'],
    ['cerrado', 'activo'],
    ['cerrado', 'planificado'],
    ['cerrado', 'cerrado'],
  ] as const)('%s → %s no está permitido', (from, to) => {
    expect(canTransitionSprint(from, to)).toBe(false);
  });
});

describe('isValidSprintRange', () => {
  it('el mismo día es válido', () => {
    expect(isValidSprintRange('2026-11-17', '2026-11-17')).toBe(true);
  });

  it('fin posterior es válido y fin anterior no', () => {
    expect(isValidSprintRange('2026-11-17', '2026-11-30')).toBe(true);
    expect(isValidSprintRange('2026-11-17', '2026-11-16')).toBe(false);
  });
});

describe('groupTasksBySprint', () => {
  const active: SprintLike = { id: 'sa', name: 'Sprint 2', status: 'activo', startDate: '2026-11-03' };
  const plannedLate: SprintLike = { id: 'sp2', name: 'Sprint 4', status: 'planificado', startDate: '2026-12-01' };
  const plannedEarly: SprintLike = { id: 'sp1', name: 'Sprint 3', status: 'planificado', startDate: '2026-11-17' };
  const closed: SprintLike = { id: 'sc', name: 'Sprint 1', status: 'cerrado', startDate: '2026-10-20' };

  const tasks: SprintTaskLike[] = [
    { id: 't1', sprintId: null, status: 'no_iniciada', estimate: 3 },
    { id: 't2', sprintId: null, status: 'completada', estimate: 5 },
    { id: 't3', sprintId: null, status: 'en_proceso', estimate: null },
    { id: 't4', sprintId: 'sa', status: 'en_proceso', estimate: 3 },
    { id: 't5', sprintId: 'sa', status: 'completada', estimate: null },
    { id: 't6', sprintId: 'sp1', status: 'no_iniciada', estimate: 8 },
    { id: 't7', sprintId: 'sc', status: 'no_iniciada', estimate: 2 },
  ];

  it('el backlog excluye las completadas y las que tienen sprint; null cuenta como 0', () => {
    const groups = groupTasksBySprint(tasks, [active, plannedLate, plannedEarly, closed]);
    expect(groups.backlog.tasks.map(t => t.id)).toEqual(['t1', 't3']);
    expect(groups.backlog.estimateTotal).toBe(3);
  });

  it('el activo lleva sus tareas y la suma de estimaciones', () => {
    const groups = groupTasksBySprint(tasks, [active, plannedLate, plannedEarly, closed]);
    expect(groups.active?.sprint.id).toBe('sa');
    expect(groups.active?.tasks.map(t => t.id)).toEqual(['t4', 't5']);
    expect(groups.active?.estimateTotal).toBe(3);
  });

  it('los planificados salen ordenados por startDate, sin los cerrados', () => {
    const groups = groupTasksBySprint(tasks, [active, plannedLate, plannedEarly, closed]);
    expect(groups.planned.map(g => g.sprint.id)).toEqual(['sp1', 'sp2']);
    expect(groups.planned[0].tasks.map(t => t.id)).toEqual(['t6']);
    expect(groups.planned[0].estimateTotal).toBe(8);
    expect(groups.planned[1].tasks).toEqual([]);
    expect(groups.planned[1].estimateTotal).toBe(0);
  });

  it('active es null si no hay sprint activo', () => {
    const groups = groupTasksBySprint(tasks, [plannedEarly]);
    expect(groups.active).toBeNull();
  });
});
