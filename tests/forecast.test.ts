import { describe, expect, it } from 'vitest';
import {
  BACKTEST_MIN_CASES,
  FORECAST_TRIALS,
  MIN_CLOSED_TASKS,
  MIN_HISTORY_WEEKS,
  THROUGHPUT_WINDOW_DAYS,
  backtest,
  buildProjectForecast,
  completionDates,
  createRng,
  dailyThroughput,
  forecastEligibility,
  simulateCompletion,
  type ForecastMilestone,
  type ForecastSprint,
  type ForecastTask,
} from '../src/lib/forecast';

/** Suma días a una fecha 'YYYY-MM-DD' (aritmética UTC, sólo para construir datos de prueba). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Instante a las 11:00 hora RD (15:00Z) del día dado. */
function at(iso: string): string {
  return `${iso}T15:00:00Z`;
}

let seq = 0;
function task(overrides: Partial<ForecastTask> = {}): ForecastTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    status: 'no_iniciada',
    completedAt: null,
    createdAt: at('2026-06-01'),
    sprintId: null,
    milestoneId: null,
    ...overrides,
  };
}

function closed(day: string, overrides: Partial<ForecastTask> = {}): ForecastTask {
  return task({ status: 'completada', completedAt: at(day), ...overrides });
}

/** Una tarea cerrada por día, de `from` a `to` (ambos incluidos). */
function dailyClosures(from: string, to: string, overrides: Partial<ForecastTask> = {}): ForecastTask[] {
  const out: ForecastTask[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(closed(d, overrides));
  return out;
}

/** n fechas de cierre, una por día, empezando hace `daysAgo` días respecto de asOf. */
function datesFrom(asOf: string, daysAgo: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(asOf, -daysAgo + i));
}

describe('constantes', () => {
  it('exporta los parámetros del plan', () => {
    expect(FORECAST_TRIALS).toBe(10000);
    expect(THROUGHPUT_WINDOW_DAYS).toBe(56);
    expect(MIN_CLOSED_TASKS).toBe(15);
    expect(MIN_HISTORY_WEEKS).toBe(4);
    expect(BACKTEST_MIN_CASES).toBe(5);
  });
});

describe('createRng', () => {
  it('es determinista y devuelve valores en [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 1000 }, () => a());
    const ys = Array.from({ length: 1000 }, () => b());
    expect(xs).toEqual(ys);
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
  });

  it('semillas distintas dan secuencias distintas', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });
});

describe('simulateCompletion', () => {
  const constant = Array(56).fill(2);

  it('con throughput constante de 2/día y 10 pendientes, p50=p70=p85 = asOf + 4', () => {
    const r = simulateCompletion({ samples: constant, remaining: 10, asOf: '2026-11-18', targetDate: '2026-11-22', seed: 1 });
    expect(r).toEqual({
      kind: 'forecast',
      remaining: 10,
      p50: '2026-11-22',
      p70: '2026-11-22',
      p85: '2026-11-22',
      probability: 1,
      targetDate: '2026-11-22',
    });
  });

  it('probabilidad 0 si el objetivo es anterior a la fecha de fin o a asOf', () => {
    const base = { samples: constant, remaining: 10, asOf: '2026-11-18', seed: 1 };
    expect(simulateCompletion({ ...base, targetDate: '2026-11-21' })).toMatchObject({ kind: 'forecast', probability: 0 });
    expect(simulateCompletion({ ...base, targetDate: '2026-11-10' })).toMatchObject({ kind: 'forecast', probability: 0 });
    expect(simulateCompletion({ ...base, targetDate: '2026-12-31' })).toMatchObject({ kind: 'forecast', probability: 1 });
  });

  it('sin muestras o con todas a 0 devuelve no_throughput sin colgarse', () => {
    const base = { remaining: 5, asOf: '2026-11-18', targetDate: '2026-11-30', seed: 1 };
    expect(simulateCompletion({ ...base, samples: [] })).toEqual({ kind: 'no_throughput' });
    expect(simulateCompletion({ ...base, samples: Array(56).fill(0) })).toEqual({ kind: 'no_throughput' });
  });

  it('con remaining=0 devuelve done', () => {
    expect(simulateCompletion({ samples: constant, remaining: 0, asOf: '2026-11-18', targetDate: '2026-11-30', seed: 1 }))
      .toEqual({ kind: 'done' });
  });

  it('cruza el cambio de mes y de año', () => {
    const r = simulateCompletion({ samples: [1], remaining: 3, asOf: '2026-12-30', targetDate: '2027-01-01', seed: 1 });
    expect(r).toMatchObject({ kind: 'forecast', p85: '2027-01-01', probability: 1 });
  });

  it('la misma semilla da el mismo resultado; percentiles ordenados', () => {
    const samples = [0, 1, 3, 0, 0, 2, 5, 1, 0, 0, 4, 1, 0, 2];
    const input = { samples, remaining: 30, asOf: '2026-11-18', targetDate: '2026-12-10' };
    const a = simulateCompletion({ ...input, seed: 7 });
    const b = simulateCompletion({ ...input, seed: 7 });
    expect(a).toEqual(b);
    if (a.kind !== 'forecast') throw new Error('se esperaba un pronóstico');
    expect(a.p50 <= a.p70).toBe(true);
    expect(a.p70 <= a.p85).toBe(true);
    expect(a.probability).toBeGreaterThan(0);
    expect(a.probability).toBeLessThan(1);

    // Semillas distintas pueden dar resultados distintos (con pocas pruebas se nota).
    const results = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(seed => JSON.stringify(simulateCompletion({ ...input, trials: 50, seed }))),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it('rendimiento: 10 000 pruebas con remaining=60 y muestras dispersas en < 200 ms', () => {
    const samples = Array(56).fill(0);
    samples[3] = 1;
    samples[20] = 2;
    samples[41] = 1;
    // Calentamiento del JIT para no medir la compilación.
    simulateCompletion({ samples, remaining: 60, asOf: '2026-11-18', targetDate: '2027-06-01', trials: 200, seed: 3 });
    const start = performance.now();
    const r = simulateCompletion({ samples, remaining: 60, asOf: '2026-11-18', targetDate: '2027-06-01', trials: 10000, seed: 3 });
    const elapsed = performance.now() - start;
    expect(r.kind).toBe('forecast');
    expect(elapsed).toBeLessThan(200);
  });
});

describe('completionDates y dailyThroughput', () => {
  it('sólo cuenta tareas completadas con completedAt, por día RD', () => {
    const dates = completionDates([
      task({ status: 'completada', completedAt: '2026-11-17T01:00:00Z' }), // 16 nov 21:00 en RD
      task({ status: 'completada', completedAt: null }),
      task({ status: 'en_proceso', completedAt: '2026-11-10T15:00:00Z' }),
      task({ status: 'completada', completedAt: new Date('2026-11-10T15:00:00Z') }),
    ]);
    expect(dates.sort()).toEqual(['2026-11-10', '2026-11-16']);
  });

  it('devuelve 56 posiciones de asOf−56 a asOf−1, con 0 en los días sin cierres', () => {
    const samples = dailyThroughput(
      ['2026-11-16', '2026-11-16', '2026-09-23', '2026-09-22', '2026-11-18', '2026-11-17'],
      '2026-11-18',
    );
    expect(samples).toHaveLength(56);
    expect(samples[0]).toBe(1); // 23 sep
    expect(samples[54]).toBe(2); // 16 nov
    expect(samples[55]).toBe(1); // 17 nov
    expect(samples.reduce((a, b) => a + b, 0)).toBe(4); // 22 sep y 18 nov quedan fuera
  });

  it('admite otra ventana', () => {
    expect(dailyThroughput(['2026-11-17'], '2026-11-18', 7)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
});

describe('forecastEligibility', () => {
  const asOf = '2026-11-18';

  it('14 cierres que empiezan hace 40 días: no elegible', () => {
    expect(forecastEligibility(datesFrom(asOf, 40, 14), asOf)).toEqual({ eligible: false, closedTasks: 14, historyWeeks: 5 });
  });

  it('15 cierres que empiezan hace 40 días: elegible', () => {
    expect(forecastEligibility(datesFrom(asOf, 40, 15), asOf)).toEqual({ eligible: true, closedTasks: 15, historyWeeks: 5 });
  });

  it('20 cierres que empiezan hace 20 días: no elegible por historial', () => {
    expect(forecastEligibility(datesFrom(asOf, 20, 20), asOf)).toEqual({ eligible: false, closedTasks: 20, historyWeeks: 2 });
  });

  it('el primer cierre justo 28 días antes ya es elegible', () => {
    expect(forecastEligibility(datesFrom(asOf, 28, 15), asOf).eligible).toBe(true);
    expect(forecastEligibility(datesFrom(asOf, 27, 15), asOf).eligible).toBe(false);
  });

  it('los cierres en asOf o después no cuentan', () => {
    const dates = [...datesFrom(asOf, 40, 14), asOf, addDays(asOf, 3)];
    expect(forecastEligibility(dates, asOf)).toMatchObject({ eligible: false, closedTasks: 14 });
  });

  it('sin cierres', () => {
    expect(forecastEligibility([], asOf)).toEqual({ eligible: false, closedTasks: 0, historyWeeks: 0 });
  });
});

describe('backtest', () => {
  const today = '2026-11-18';
  // Historial de fondo: una tarea cerrada cada día desde el 1 de julio.
  const background = () => dailyClosures('2026-07-01', '2026-11-17');

  function sprint(id: string, startDate: string, endDate: string, status = 'cerrado'): ForecastSprint {
    return { id, status, startDate, endDate };
  }

  function milestone(id: string, createdOn: string, targetDate: string, completed = true): ForecastMilestone {
    return { id, completed, targetDate, createdAt: at(createdOn) };
  }

  function scenario() {
    const tasks: ForecastTask[] = [
      ...background(),
      // A: acierto. 3 tareas cerradas el mismo día de inicio.
      ...[1, 2, 3].map(() => closed('2026-09-01', { sprintId: 'A' })),
      // B: fallo. Terminó más de un mes después de lo pronosticado.
      ...[1, 2, 3].map(() => closed('2026-10-20', { sprintId: 'B' })),
      // C: hito con una tarea aún abierta y p85 ya pasado: fallo.
      closed('2026-10-02', { milestoneId: 'C' }),
      task({ milestoneId: 'C' }),
      // D: no elegible al empezar (poco historial antes del 10 de julio).
      closed('2026-07-11', { sprintId: 'D' }),
      // F: abierto con p85 aún por llegar: pendiente, se omite.
      ...Array.from({ length: 20 }, () => task({ sprintId: 'F' })),
      // G: todo su trabajo se cerró antes del inicio: sin trabajo pendiente.
      closed('2026-08-01', { sprintId: 'G' }),
      // Sprint activo: no es un caso.
      closed('2026-11-02', { sprintId: 'ACT' }),
      // Hito no completado: no es un caso.
      closed('2026-10-11', { milestoneId: 'OPEN' }),
    ];
    const sprints = [
      sprint('A', '2026-09-01', '2026-09-14'),
      sprint('B', '2026-09-15', '2026-09-28'),
      sprint('D', '2026-07-10', '2026-07-23'),
      sprint('E', '2026-10-05', '2026-10-18'), // sin tareas
      sprint('F', '2026-11-10', '2026-11-30'),
      sprint('G', '2026-09-20', '2026-10-03'),
      sprint('ACT', '2026-11-01', '2026-11-14', 'activo'),
    ];
    const milestones = [
      milestone('C', '2026-10-01', '2026-10-10'),
      milestone('OPEN', '2026-10-10', '2026-12-01', false),
    ];
    return { tasks, sprints, milestones };
  }

  it('cuenta aciertos y fallos y omite los casos no evaluables', () => {
    const { tasks, sprints, milestones } = scenario();
    expect(backtest(tasks, sprints, milestones, today, 1)).toEqual({ hits: 1, total: 3, enough: false });
  });

  it('con 5 casos o más, enough=true', () => {
    const { tasks, sprints, milestones } = scenario();
    tasks.push(
      ...[1, 2].map(() => closed('2026-08-20', { milestoneId: 'H1' })),
      ...[1, 2].map(() => closed('2026-09-05', { milestoneId: 'H2' })),
    );
    milestones.push(milestone('H1', '2026-08-20', '2026-08-25'), milestone('H2', '2026-09-05', '2026-09-10'));
    expect(backtest(tasks, sprints, milestones, today, 1)).toEqual({ hits: 3, total: 5, enough: true });
  });

  it('los cierres posteriores al inicio no influyen en el pronóstico del caso', () => {
    // Antes del inicio: 1 tarea/día. Después: ráfagas de 10/día que, si se filtraran,
    // harían que el pronóstico esperase terminar el primer día.
    const start = '2026-10-01';
    const tasks: ForecastTask[] = [
      ...dailyClosures('2026-07-01', '2026-09-30'),
      ...Array.from({ length: 10 }, (_, i) => Array.from({ length: 10 }, () => closed(addDays(start, 10 + i)))).flat(),
      // 5 tareas del caso que terminan el cuarto día (p85 sin fuga = inicio + 4).
      ...[1, 2, 3, 4, 5].map(() => closed(addDays(start, 3), { sprintId: 'S' })),
    ];
    const sprints = [sprint('S', start, '2026-10-14')];
    expect(backtest(tasks, sprints, [], today, 1)).toEqual({ hits: 1, total: 1, enough: false });
  });

  it('las tareas archivadas no cuentan como trabajo del caso', () => {
    const tasks: ForecastTask[] = [
      ...background(),
      ...[1, 2, 3].map(() => closed('2026-09-01', { sprintId: 'A' })),
      task({ sprintId: 'A', archived: true }),
    ];
    expect(backtest(tasks, [sprint('A', '2026-09-01', '2026-09-14')], [], today, 1))
      .toEqual({ hits: 1, total: 1, enough: false });
  });

  it('sólo evalúa los 20 casos más recientes', () => {
    const tasks: ForecastTask[] = background();
    const sprints: ForecastSprint[] = [];
    // 25 sprints cerrados de un día; los 5 más antiguos son fallos, los 20 recientes aciertos.
    for (let i = 0; i < 25; i++) {
      const start = addDays('2026-08-15', i * 3);
      const id = `S${i}`;
      sprints.push(sprint(id, start, start));
      tasks.push(closed(i < 5 ? addDays(start, 40) : start, { sprintId: id }));
    }
    expect(backtest(tasks, sprints, [], today, 1)).toEqual({ hits: 20, total: 20, enough: true });
  });
});

describe('buildProjectForecast', () => {
  const today = '2026-11-18';
  const history = () => dailyClosures('2026-08-01', '2026-11-17');

  it('sin sprint activo, activeSprint es null; sólo hitos sin completar', () => {
    const result = buildProjectForecast({
      tasks: [...history(), task({ milestoneId: 'M1' }), task({ milestoneId: 'M2' })],
      sprints: [{ id: 'P', status: 'planificado', startDate: '2026-11-20', endDate: '2026-12-03' }],
      milestones: [
        { id: 'M1', completed: false, targetDate: '2026-12-01', createdAt: at('2026-11-01') },
        { id: 'M2', completed: true, targetDate: '2026-11-10', createdAt: at('2026-11-01') },
      ],
      today,
    });
    expect(result.activeSprint).toBeNull();
    expect(result.milestones.map(m => m.id)).toEqual(['M1']);
    expect(result.milestones[0].forecast).toMatchObject({ kind: 'forecast', remaining: 1, targetDate: '2026-12-01' });
    expect(result.backtest).toEqual(expect.objectContaining({ hits: expect.any(Number), total: expect.any(Number) }));
  });

  it('el sprint activo cuenta sus tareas abiertas no archivadas', () => {
    const result = buildProjectForecast({
      tasks: [
        ...history(),
        task({ sprintId: 'ACT' }),
        task({ sprintId: 'ACT', status: 'en_proceso' }),
        task({ sprintId: 'ACT', archived: true }),
        closed('2026-11-17', { sprintId: 'ACT' }),
      ],
      sprints: [{ id: 'ACT', status: 'activo', startDate: '2026-11-10', endDate: '2026-11-23' }],
      milestones: [],
      today,
    });
    expect(result.activeSprint?.id).toBe('ACT');
    expect(result.activeSprint?.forecast).toMatchObject({ kind: 'forecast', remaining: 2, targetDate: '2026-11-23' });
    expect(result.milestones).toEqual([]);
  });

  it('sprint activo sin trabajo pendiente: done', () => {
    const result = buildProjectForecast({
      tasks: [...history(), closed('2026-11-17', { sprintId: 'ACT' })],
      sprints: [{ id: 'ACT', status: 'activo', startDate: '2026-11-10', endDate: '2026-11-23' }],
      milestones: [],
      today,
    });
    expect(result.activeSprint?.forecast).toEqual({ kind: 'done' });
  });

  it('las tareas archivadas no cuentan para el historial', () => {
    const result = buildProjectForecast({
      tasks: [...dailyClosures('2026-08-01', '2026-11-17', { archived: true }), task({ sprintId: 'ACT' })],
      sprints: [{ id: 'ACT', status: 'activo', startDate: '2026-11-10', endDate: '2026-11-23' }],
      milestones: [],
      today,
    });
    expect(result.activeSprint?.forecast).toEqual({ kind: 'insufficient', closedTasks: 0, historyWeeks: 0 });
  });

  it('proyecto elegible pero parado en las últimas 8 semanas: no_throughput', () => {
    const result = buildProjectForecast({
      tasks: [...dailyClosures('2026-05-01', '2026-06-30'), task({ sprintId: 'ACT' })],
      sprints: [{ id: 'ACT', status: 'activo', startDate: '2026-11-10', endDate: '2026-11-23' }],
      milestones: [],
      today,
    });
    expect(result.activeSprint?.forecast).toEqual({ kind: 'no_throughput' });
  });

  it('es estable entre llamadas (semilla fija por defecto)', () => {
    const input = {
      tasks: [...history(), ...Array.from({ length: 12 }, () => task({ sprintId: 'ACT' }))],
      sprints: [{ id: 'ACT', status: 'activo', startDate: '2026-11-10', endDate: '2026-11-23' }],
      milestones: [],
      today,
    };
    expect(buildProjectForecast(input)).toEqual(buildProjectForecast(input));
  });
});
