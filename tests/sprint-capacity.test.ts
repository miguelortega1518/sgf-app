import { describe, expect, it } from 'vitest';
import {
  SPRINT_CAPACITY_MAX,
  buildCapacityRows,
  capacityAuditValue,
  capacityFromLegacyTasks,
  capacityFromSummary,
  defaultCapacity,
  overloadPoints,
  type ClosedSprintCapacity,
} from '../src/lib/sprint-capacity';

const ana = 'ana';
const beto = 'beto';

function closed(endDate: string, points: Record<string, number>): ClosedSprintCapacity {
  return {
    endDate,
    byPerson: new Map(Object.entries(points).map(([personId, completedPoints]) => [
      personId, { participated: true, completedPoints },
    ])),
  };
}

describe('defaultCapacity', () => {
  it('media de los 3 sprints (8, 10, 13 → 10), redondeada', () => {
    const sprints = [
      closed('2026-10-01', { [ana]: 8 }),
      closed('2026-10-15', { [ana]: 10 }),
      closed('2026-10-29', { [ana]: 13 }),
    ];
    expect(defaultCapacity(ana, sprints)).toBe(10);
  });

  it('redondea con Math.round (10.5 → 11)', () => {
    const sprints = [closed('2026-10-01', { [ana]: 10 }), closed('2026-10-15', { [ana]: 11 })];
    expect(defaultCapacity(ana, sprints)).toBe(11);
  });

  it('sólo cuentan los 3 más recientes por endDate', () => {
    const sprints = [
      closed('2026-09-01', { [ana]: 100 }),
      closed('2026-10-29', { [ana]: 13 }),
      closed('2026-10-01', { [ana]: 8 }),
      closed('2026-10-15', { [ana]: 10 }),
    ];
    expect(defaultCapacity(ana, sprints)).toBe(10);
  });

  it('se saltan los sprints en los que la persona no participó', () => {
    const sprints = [
      closed('2026-09-01', { [ana]: 7 }),
      closed('2026-10-01', { [ana]: 8 }),
      closed('2026-10-15', { [beto]: 50 }),
      closed('2026-10-29', { [ana]: 9 }),
      {
        endDate: '2026-11-05',
        byPerson: new Map([[ana, { participated: false, completedPoints: 0 }]]),
      },
    ];
    expect(defaultCapacity(ana, sprints)).toBe(8);
  });

  it('participar con 0 puntos completados cuenta como 0', () => {
    const sprints = [closed('2026-10-01', { [ana]: 0 }), closed('2026-10-15', { [ana]: 6 })];
    expect(defaultCapacity(ana, sprints)).toBe(3);
  });

  it('sin datos → null', () => {
    expect(defaultCapacity(ana, [])).toBeNull();
    expect(defaultCapacity(ana, [closed('2026-10-01', { [beto]: 5 })])).toBeNull();
  });

  it('con 1 o 2 sprints, la media de los disponibles', () => {
    expect(defaultCapacity(ana, [closed('2026-10-01', { [ana]: 5 })])).toBe(5);
    expect(defaultCapacity(ana, [closed('2026-10-01', { [ana]: 5 }), closed('2026-10-15', { [ana]: 8 })])).toBe(7);
  });
});

describe('capacityFromLegacyTasks / capacityFromSummary', () => {
  it('heredado: participa con cualquier tarea y suma sólo las completadas (null = 0)', () => {
    const map = capacityFromLegacyTasks([
      { responsibleId: ana, status: 'completada', estimate: 5 },
      { responsibleId: ana, status: 'completada', estimate: null },
      { responsibleId: ana, status: 'en_proceso', estimate: 8 },
      { responsibleId: beto, status: 'no_iniciada', estimate: 3 },
    ]);
    expect(map.get(ana)).toEqual({ participated: true, completedPoints: 5 });
    expect(map.get(beto)).toEqual({ participated: true, completedPoints: 0 });
    expect(map.has('nadie')).toBe(false);
  });

  it('con summary: sale de byPerson', () => {
    const map = capacityFromSummary({
      byPerson: [
        { personId: ana, name: 'Ana', committedTasks: 2, committedPoints: 8, completedTasks: 1, completedPoints: 5 },
      ],
    });
    expect(map.get(ana)).toEqual({ participated: true, completedPoints: 5 });
  });

  it('con summary sin byPerson válido no lanza', () => {
    expect(capacityFromSummary({} as never).size).toBe(0);
  });
});

describe('buildCapacityRows', () => {
  const members = [
    { personId: beto, name: 'Beto', spaceRole: 'colaborador' },
    { personId: ana, name: 'Ana', spaceRole: 'dueño' },
    { personId: 'olga', name: 'Olga', spaceRole: 'observador' },
  ];

  it('valor guardado → isDefault false; sin guardar → defecto con isDefault true', () => {
    const rows = buildCapacityRows({
      members,
      saved: new Map([[ana, 6]]),
      defaults: new Map([[ana, 10], [beto, 7]]),
      sprintTasks: [],
    });
    expect(rows).toEqual([
      { personId: ana, name: 'Ana', points: 6, isDefault: false, assigned: 0, overloaded: false },
      { personId: beto, name: 'Beto', points: 7, isDefault: true, assigned: 0, overloaded: false },
    ]);
  });

  it('incluye al responsable que no es miembro, excluye a los observadores y ordena por nombre', () => {
    const rows = buildCapacityRows({
      members,
      saved: new Map(),
      defaults: new Map(),
      sprintTasks: [{ responsibleId: 'carla', responsibleName: 'Carla', estimate: 2 }],
    });
    expect(rows.map(r => r.name)).toEqual(['Ana', 'Beto', 'Carla']);
    expect(rows.find(r => r.personId === 'olga')).toBeUndefined();
    expect(rows.find(r => r.personId === 'carla')).toMatchObject({ points: null, isDefault: true, assigned: 2 });
  });

  it('un observador que es responsable de una tarea del sprint sí aparece', () => {
    const rows = buildCapacityRows({
      members,
      saved: new Map(),
      defaults: new Map(),
      sprintTasks: [{ responsibleId: 'olga', responsibleName: 'Olga', estimate: 1 }],
    });
    expect(rows.map(r => r.name)).toEqual(['Ana', 'Beto', 'Olga']);
  });

  it('assigned suma el estimate de todas sus tareas (null = 0)', () => {
    const rows = buildCapacityRows({
      members,
      saved: new Map(),
      defaults: new Map([[ana, 10]]),
      sprintTasks: [
        { responsibleId: ana, responsibleName: 'Ana', estimate: 5 },
        { responsibleId: ana, responsibleName: 'Ana', estimate: null },
        { responsibleId: ana, responsibleName: 'Ana', estimate: 3 },
      ],
    });
    expect(rows.find(r => r.personId === ana)?.assigned).toBe(8);
  });

  it('overloaded sólo si assigned > points estricto; capacidad null nunca sobrecarga', () => {
    const tasks = [
      { responsibleId: ana, responsibleName: 'Ana', estimate: 8 },
      { responsibleId: beto, responsibleName: 'Beto', estimate: 8 },
      { responsibleId: 'carla', responsibleName: 'Carla', estimate: 50 },
    ];
    const rows = buildCapacityRows({
      members,
      saved: new Map([[ana, 8], [beto, 5]]),
      defaults: new Map([['carla', null]]),
      sprintTasks: tasks,
    });
    expect(rows.find(r => r.personId === ana)?.overloaded).toBe(false);
    expect(rows.find(r => r.personId === beto)?.overloaded).toBe(true);
    expect(rows.find(r => r.personId === 'carla')).toMatchObject({ points: null, overloaded: false });
  });

  it('capacidad guardada 0 es un valor, no «sin datos»', () => {
    const rows = buildCapacityRows({
      members,
      saved: new Map([[ana, 0]]),
      defaults: new Map([[ana, 10]]),
      sprintTasks: [{ responsibleId: ana, responsibleName: 'Ana', estimate: 1 }],
    });
    expect(rows.find(r => r.personId === ana)).toMatchObject({ points: 0, isDefault: false, overloaded: true });
  });
});

describe('overloadPoints y capacityAuditValue', () => {
  it('overloadPoints devuelve el exceso o 0', () => {
    expect(overloadPoints({ points: 5, assigned: 8 })).toBe(3);
    expect(overloadPoints({ points: 8, assigned: 8 })).toBe(0);
    expect(overloadPoints({ points: null, assigned: 8 })).toBe(0);
  });

  it('valores legibles en singular y plural, y «por defecto»', () => {
    expect(capacityAuditValue('Sprint 3', 'Ana', 8)).toBe('Sprint 3 · Ana: 8 puntos');
    expect(capacityAuditValue('Sprint 3', 'Ana', 1)).toBe('Sprint 3 · Ana: 1 punto');
    expect(capacityAuditValue('Sprint 3', 'Ana', 0)).toBe('Sprint 3 · Ana: 0 puntos');
    expect(capacityAuditValue('Sprint 3', 'Ana', null)).toBe('Sprint 3 · Ana: por defecto');
  });

  it('el máximo es 999', () => {
    expect(SPRINT_CAPACITY_MAX).toBe(999);
  });
});
