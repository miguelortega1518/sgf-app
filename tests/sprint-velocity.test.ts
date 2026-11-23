import { describe, expect, it } from 'vitest';
import { buildSprintVelocity, type VelocitySprintInput } from '../src/lib/sprint-velocity';

function closed(i: number, tasks: number, points: number, overrides: Partial<VelocitySprintInput> = {}): VelocitySprintInput {
  const start = `2026-${String(i).padStart(2, '0')}-01`;
  const end = `2026-${String(i).padStart(2, '0')}-14`;
  return { id: `s${i}`, name: `Sprint ${i}`, startDate: start, endDate: end, completed: { tasks, points }, ...overrides };
}

describe('buildSprintVelocity', () => {
  it('con 0 o 1 sprints cerrados no hay datos suficientes', () => {
    expect(buildSprintVelocity([])).toEqual({ enoughData: false, unit: 'tasks', sprints: [] });
    const one = buildSprintVelocity([closed(1, 3, 8)]);
    expect(one.enoughData).toBe(false);
    expect(one.sprints).toHaveLength(1);
    expect(one.sprints[0].avgPoints).toBeNull();
  });

  it('con 2 cerrados: la media del 2.º promedia ambos y la del 1.º es null', () => {
    const v = buildSprintVelocity([closed(1, 2, 8), closed(2, 4, 13)]);
    expect(v.enoughData).toBe(true);
    expect(v.unit).toBe('points');
    expect(v.sprints).toEqual([
      { id: 's1', name: 'Sprint 1', startDate: '2026-01-01', endDate: '2026-01-14', tasks: 2, points: 8, avgTasks: null, avgPoints: null },
      { id: 's2', name: 'Sprint 2', startDate: '2026-02-01', endDate: '2026-02-14', tasks: 4, points: 13, avgTasks: 3, avgPoints: 10.5 },
    ]);
  });

  it('con 8 cerrados devuelve los 6 últimos y la media del primero usa los anteriores', () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8].map(i => closed(i, i, i * 10));
    const v = buildSprintVelocity(all);
    expect(v.sprints.map(s => s.id)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8']);
    // s3: media de s1, s2 y s3.
    expect(v.sprints[0].avgTasks).toBe(2);
    expect(v.sprints[0].avgPoints).toBe(20);
    expect(v.sprints[5].avgTasks).toBe(7);
  });

  it('ordena por endDate y luego startDate aunque lleguen desordenados', () => {
    const a = closed(1, 1, 0, { id: 'a', endDate: '2026-03-14', startDate: '2026-03-01' });
    const b = closed(2, 2, 0, { id: 'b', endDate: '2026-01-14', startDate: '2026-01-01' });
    const c = closed(3, 3, 0, { id: 'c', endDate: '2026-03-14', startDate: '2026-02-20' });
    const v = buildSprintVelocity([a, b, c]);
    expect(v.sprints.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('sin puntos en ninguno la unidad es tareas', () => {
    const v = buildSprintVelocity([closed(1, 2, 0), closed(2, 3, 0)]);
    expect(v.unit).toBe('tasks');
  });

  it('acepta limit y window', () => {
    const all = [1, 2, 3, 4].map(i => closed(i, i, 0));
    const v = buildSprintVelocity(all, { limit: 2, window: 2 });
    expect(v.sprints.map(s => s.id)).toEqual(['s3', 's4']);
    expect(v.sprints[0].avgTasks).toBe(2.5);
  });
});
