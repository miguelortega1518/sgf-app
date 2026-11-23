import { describe, expect, it } from 'vitest';
import {
  buildSharedProjectView,
  type SharedViewMilestone,
  type SharedViewSpace,
  type SharedViewTask,
} from '../src/lib/share-view';
import { HEALTH_LABEL, healthLabel, PUBLIC_BLOCK_AREA_LABEL, PUBLIC_STATUS_LABEL } from '../src/lib/labels';
import type { ProjectForecast } from '../src/lib/forecast';

const TODAY = '2026-11-23';

const space: SharedViewSpace = {
  name: 'Portal de proveedores',
  objective: 'Que Compras reciba las facturas en línea',
  declaredHealth: 'amarillo',
  status: 'activo',
};

let seq = 0;
function task(overrides: Partial<SharedViewTask> = {}): SharedViewTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    title: `Tarea ${seq}`,
    status: 'no_iniciada',
    dueDate: null,
    blockedByArea: null,
    milestoneId: null,
    sprintId: null,
    completedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    archived: false,
    ...overrides,
  };
}

function milestone(overrides: Partial<SharedViewMilestone> = {}): SharedViewMilestone {
  seq += 1;
  return {
    id: `m-${seq}`,
    name: `Hito ${seq}`,
    targetDate: '2026-12-15',
    completed: false,
    order: seq,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

const emptyForecast: ProjectForecast = {
  activeSprint: null,
  milestones: [],
  backtest: { hits: 0, total: 0, enough: false },
};

function build(input: {
  tasks?: SharedViewTask[];
  milestones?: SharedViewMilestone[];
  forecast?: ProjectForecast;
  space?: Partial<SharedViewSpace>;
} = {}) {
  return buildSharedProjectView({
    space: { ...space, ...input.space },
    milestones: input.milestones ?? [],
    tasks: input.tasks ?? [],
    forecast: input.forecast ?? emptyForecast,
    today: TODAY,
  });
}

describe('vocabulario público', () => {
  it('PUBLIC_STATUS_LABEL sin jerga de desarrollo', () => {
    expect(PUBLIC_STATUS_LABEL).toEqual({
      no_iniciada: 'Pendiente',
      en_proceso: 'En curso',
      en_revision: 'Esperando revisión',
      completada: 'Terminado',
      bloqueada: 'Bloqueado',
    });
  });

  it('HEALTH_LABEL y null → «Sin declarar»', () => {
    expect(HEALTH_LABEL).toEqual({ verde: 'En buen estado', amarillo: 'Requiere atención', rojo: 'Crítico' });
    expect(healthLabel(null)).toBe('Sin declarar');
    expect(healthLabel('rojo')).toBe('Crítico');
    expect(healthLabel('constructor')).toBe('Sin declarar');
  });

  it('PUBLIC_BLOCK_AREA_LABEL no tiene «otro»', () => {
    expect(PUBLIC_BLOCK_AREA_LABEL.qa).toBe('Pruebas');
    expect(PUBLIC_BLOCK_AREA_LABEL.terceros).toBe('un proveedor externo');
    expect(PUBLIC_BLOCK_AREA_LABEL.compras).toBe('Compras');
    expect(Object.hasOwn(PUBLIC_BLOCK_AREA_LABEL, 'otro')).toBe(false);
  });
});

describe('buildSharedProjectView: datos del proyecto', () => {
  it('nombre, objetivo, salud y estado', () => {
    const view = build();
    expect(view.name).toBe('Portal de proveedores');
    expect(view.objective).toBe('Que Compras reciba las facturas en línea');
    expect(view.health).toEqual({ code: 'amarillo', label: 'Requiere atención' });
    expect(view.status).toEqual({ code: 'activo', label: 'Activo' });
  });

  it('salud sin declarar', () => {
    expect(build({ space: { declaredHealth: null } }).health).toEqual({ code: null, label: 'Sin declarar' });
  });
});

describe('buildSharedProjectView: avance', () => {
  it('porcentaje redondeado y sin contar las archivadas', () => {
    const view = build({
      tasks: [
        task({ status: 'completada', completedAt: new Date() }),
        task({ status: 'en_proceso' }),
        task({ status: 'no_iniciada' }),
        task({ status: 'completada', archived: true }),
        task({ status: 'completada', archived: true }),
      ],
    });
    expect(view.totalTasks).toBe(3);
    expect(view.completedTasks).toBe(1);
    expect(view.percentComplete).toBe(33);
    expect(view.progressLabel).toBe('33 % completado');
  });

  it('redondea hacia el entero más cercano', () => {
    const view = build({
      tasks: [
        task({ status: 'completada' }), task({ status: 'completada' }), task({ status: 'en_proceso' }),
      ],
    });
    expect(view.percentComplete).toBe(67);
  });

  it('sin tareas: null y «Sin tareas todavía», nunca 100 % ni terminado', () => {
    const view = build({ tasks: [task({ status: 'completada', archived: true })] });
    expect(view.percentComplete).toBeNull();
    expect(view.progressLabel).toBe('Sin tareas todavía');
    expect(JSON.stringify(view)).not.toContain('100');
  });

  it('recuento por estado con etiquetas públicas', () => {
    const view = build({
      tasks: [
        task({ status: 'en_proceso' }), task({ status: 'en_proceso' }),
        task({ status: 'en_revision' }), task({ status: 'bloqueada' }),
        task({ status: 'en_proceso', archived: true }),
      ],
    });
    expect(view.statusCounts).toEqual([
      { status: 'no_iniciada', label: 'Pendiente', count: 0 },
      { status: 'en_proceso', label: 'En curso', count: 2 },
      { status: 'en_revision', label: 'Esperando revisión', count: 1 },
      { status: 'completada', label: 'Terminado', count: 0 },
      { status: 'bloqueada', label: 'Bloqueado', count: 1 },
    ]);
  });
});

describe('buildSharedProjectView: hitos', () => {
  it('ordenados por order con estado Cumplido / Atrasado / En curso', () => {
    const done = milestone({ name: 'Diseño aprobado', order: 3, completed: true, targetDate: '2026-11-01' });
    const late = milestone({ name: 'Piloto', order: 1, targetDate: '2026-11-22' });
    const onTrack = milestone({ name: 'Lanzamiento', order: 2, targetDate: TODAY });
    const view = build({ milestones: [done, late, onTrack] });
    expect(view.milestones.map(m => [m.name, m.targetDate, m.statusLabel])).toEqual([
      ['Piloto', '2026-11-22', 'Atrasado'],
      ['Lanzamiento', TODAY, 'En curso'],
      ['Diseño aprobado', '2026-11-01', 'Cumplido'],
    ]);
    expect(view.milestones.map(m => m.status)).toEqual(['atrasado', 'en_curso', 'cumplido']);
  });

  it('cada hito lleva su pronóstico y el recuento de tareas abiertas', () => {
    const m = milestone({ id: 'm-x' });
    const empty = milestone({ id: 'm-empty' });
    const forecast: ProjectForecast = {
      ...emptyForecast,
      milestones: [
        { id: 'm-x', forecast: { kind: 'insufficient', closedTasks: 3, historyWeeks: 1 } },
        { id: 'm-empty', forecast: { kind: 'done' } },
      ],
    };
    const view = build({
      milestones: [m, empty],
      tasks: [
        task({ milestoneId: 'm-x', status: 'en_proceso' }),
        task({ milestoneId: 'm-x', status: 'completada' }),
        task({ milestoneId: 'm-x', status: 'en_proceso', archived: true }),
      ],
      forecast,
    });
    expect(view.milestones[0]).toMatchObject({
      taskCount: 2, openTasks: 1, forecast: { kind: 'insufficient', closedTasks: 3, historyWeeks: 1 },
    });
    expect(view.milestones[1]).toMatchObject({ taskCount: 0, openTasks: 0 });
    expect(view.backtest).toEqual(emptyForecast.backtest);
  });

  it('los hitos cumplidos no llevan pronóstico', () => {
    const view = build({ milestones: [milestone({ completed: true })] });
    expect(view.milestones[0].forecast).toBeNull();
  });
});

describe('buildSharedProjectView: sprint activo', () => {
  it('sin sprint activo → null', () => {
    expect(build().activeSprint).toBeNull();
  });

  it('pronóstico del sprint activo con su recuento de tareas, sin el id', () => {
    const view = build({
      tasks: [task({ sprintId: 's-1', status: 'en_proceso' }), task({ sprintId: 's-1', status: 'completada' })],
      forecast: { ...emptyForecast, activeSprint: { id: 's-1', forecast: { kind: 'no_throughput' } } },
    });
    expect(view.activeSprint).toEqual({ taskCount: 2, openTasks: 1, forecast: { kind: 'no_throughput' } });
  });
});

describe('buildSharedProjectView: riesgos', () => {
  it('bloqueada por un área con etiqueta pública → «Bloqueado por Compras»', () => {
    const view = build({ tasks: [task({ title: 'Orden de compra', status: 'bloqueada', blockedByArea: 'compras' })] });
    expect(view.risks).toEqual([{ title: 'Orden de compra', reasons: ['Bloqueado por Compras'] }]);
  });

  it('bloqueada por «otro» → sólo «Bloqueado», sin el texto libre', () => {
    const view = build({
      tasks: [{ ...task({ title: 'Firma', status: 'bloqueada', blockedByArea: 'otro' }), blockedByAreaText: 'Juan Pérez' } as SharedViewTask],
    });
    expect(view.risks).toEqual([{ title: 'Firma', reasons: ['Bloqueado'] }]);
    expect(JSON.stringify(view)).not.toContain('Juan Pérez');
  });

  it('bloqueada sin área → «Bloqueado»', () => {
    const view = build({ tasks: [task({ title: 'X', status: 'bloqueada' })] });
    expect(view.risks[0].reasons).toEqual(['Bloqueado']);
  });

  it('vencida → «Vencida desde el …» con fecha corta RD', () => {
    const view = build({ tasks: [task({ title: 'Contrato', status: 'en_proceso', dueDate: '2026-11-20' })] });
    expect(view.risks).toEqual([{ title: 'Contrato', reasons: ['Vencida desde el 20 nov'] }]);
  });

  it('vence hoy no es riesgo', () => {
    expect(build({ tasks: [task({ dueDate: TODAY })] }).risks).toEqual([]);
  });

  it('bloqueada y vencida → un solo riesgo con los dos motivos', () => {
    const view = build({
      tasks: [task({ title: 'Pago', status: 'bloqueada', blockedByArea: 'tesoreria', dueDate: '2025-12-30' })],
    });
    expect(view.risks).toEqual([
      { title: 'Pago', reasons: ['Bloqueado por Tesorería', 'Vencida desde el 30 dic 2025'] },
    ]);
  });

  it('las completadas y las archivadas no generan riesgo', () => {
    const view = build({
      tasks: [
        task({ status: 'completada', dueDate: '2026-11-01' }),
        task({ status: 'bloqueada', archived: true }),
        task({ status: 'en_proceso', dueDate: '2026-11-01', archived: true }),
      ],
    });
    expect(view.risks).toEqual([]);
  });
});

describe('buildSharedProjectView: lista blanca de campos', () => {
  it('no filtra personas, correos, comentarios, número FOR-, PR ni rama', () => {
    const leaky = {
      ...task({ title: 'Integrar pasarela', status: 'bloqueada', blockedByArea: 'otro', dueDate: '2026-11-01' }),
      number: 142,
      description: 'Descripción interna secreta',
      responsible: { name: 'María Gómez', email: 'maria@empresa.do' },
      responsibleId: 'p-1',
      reviewer: { name: 'Pedro Ruiz', email: 'pedro@empresa.do' },
      prUrl: 'https://github.com/org/repo/pull/218',
      branch: 'feature/FOR-142-pasarela',
      blockedByAreaText: 'Esperando a María Gómez',
      comments: [{ content: 'Comentario privado del equipo', author: 'María Gómez' }],
    };
    const view = build({
      space: { ...space, ownerEmail: 'jefe@empresa.do', ownerName: 'Ana Jefa' } as unknown as SharedViewSpace,
      tasks: [leaky as unknown as SharedViewTask],
      milestones: [{ ...milestone(), targetDateOriginal: '2026-01-01', spaceId: 'secret-space' } as SharedViewMilestone],
    });
    const json = JSON.stringify(view);
    for (const forbidden of [
      '@', 'María', 'Pedro', 'Ana Jefa', 'Comentario privado', 'FOR-', '142', 'github.com', 'pull/218',
      'feature/', 'Descripción interna', 'p-1', 'secret-space', '2026-01-01', 't-', 'm-',
    ]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
    expect(json).toContain('Integrar pasarela');
  });
});
