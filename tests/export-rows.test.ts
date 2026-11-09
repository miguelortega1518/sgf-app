import { describe, it, expect } from 'vitest';
import {
  taskExportRow,
  personaReportRow,
  repoReportRow,
  dueReportRow,
  type TaskExportInput,
} from '@/lib/export-rows';

const base: TaskExportInput = {
  spaceName: 'Checkout',
  spaceType: 'recurrente',
  companyName: 'web-app',
  taskTitle: 'Arreglar pago',
  responsibleName: 'Ana',
  reviewerName: 'Luis',
  status: 'en_revision',
  priority: 'critica',
  dueDate: '2026-11-12',
  dueDateOriginal: '2026-11-10',
  completedAt: null,
  blockedByArea: 'qa',
  delayReason: 'Esperando QA',
};

const TASK_KEYS = [
  'Proyecto', 'Tipo', 'Repositorio', 'Tarea', 'Responsable', 'Revisor', 'Estado', 'Prioridad',
  'Fecha límite', 'Fecha original', 'Completada', 'Bloqueada por', 'Razón retraso',
];

describe('taskExportRow', () => {
  it('traduce estado, prioridad, tipo y área con el vocabulario de labels.ts', () => {
    const row = taskExportRow(base);
    expect(row['Estado']).toBe('En code review');
    expect(row['Prioridad']).toBe('Crítica');
    expect(row['Tipo']).toBe('Sprint');
    expect(row['Bloqueada por']).toBe('QA');
    expect(row['Proyecto']).toBe('Checkout');
    expect(row['Repositorio']).toBe('web-app');
  });

  it('tiene exactamente las columnas esperadas y en orden', () => {
    const keys = Object.keys(taskExportRow(base));
    expect(keys).toEqual(TASK_KEYS);
    expect(keys).not.toContain('Espacio');
    expect(keys).not.toContain('Empresa');
  });

  it('los null dan cadena vacía', () => {
    const row = taskExportRow({
      ...base,
      companyName: null,
      reviewerName: null,
      blockedByArea: null,
      completedAt: null,
      dueDate: null,
      dueDateOriginal: null,
      delayReason: null,
    });
    expect(row['Repositorio']).toBe('');
    expect(row['Revisor']).toBe('');
    expect(row['Bloqueada por']).toBe('');
    expect(row['Completada']).toBe('');
    expect(row['Fecha límite']).toBe('');
    expect(row['Fecha original']).toBe('');
    expect(row['Razón retraso']).toBe('');
  });

  it('los valores desconocidos caen al valor crudo', () => {
    const row = taskExportRow({ ...base, status: 'xyz', priority: 'xyz', spaceType: 'xyz', blockedByArea: 'xyz' });
    expect(row['Estado']).toBe('xyz');
    expect(row['Prioridad']).toBe('xyz');
    expect(row['Tipo']).toBe('xyz');
    expect(row['Bloqueada por']).toBe('xyz');
  });

  it('Completada se calcula en hora RD', () => {
    expect(taskExportRow({ ...base, completedAt: new Date('2026-11-10T02:00:00Z') })['Completada']).toBe('2026-11-09');
    expect(taskExportRow({ ...base, completedAt: '2026-11-10T02:00:00Z' })['Completada']).toBe('2026-11-09');
  });
});

describe('personaReportRow', () => {
  it('usa STATUS_LABEL y las columnas Proyecto/Repositorio', () => {
    const row = personaReportRow({
      spaceName: 'Checkout',
      title: 'Arreglar pago',
      status: 'completada',
      priority: 'alta',
      companyName: null,
      reviewerName: null,
      dueDate: '2026-11-10',
      dueDateOriginal: '2026-11-10',
      completedAt: new Date('2026-11-10T02:00:00Z'),
      blockedByArea: 'diseno',
    });
    expect(row['Estado']).toBe('Hecho');
    expect(row['Prioridad']).toBe('Alta');
    expect(row['Bloqueada por']).toBe('Diseño');
    expect(row['Completada']).toBe('2026-11-09');
    expect(row['Repositorio']).toBe('');
    const keys = Object.keys(row);
    expect(keys).toEqual([
      'Proyecto', 'Tarea', 'Estado', 'Prioridad', 'Repositorio', 'Revisor',
      'Fecha límite', 'Fecha original', 'Completada', 'Bloqueada por',
    ]);
    expect(keys).not.toContain('Espacio');
    expect(keys).not.toContain('Empresa');
  });
});

describe('repoReportRow', () => {
  it('usa STATUS_LABEL y la columna Proyecto', () => {
    const row = repoReportRow({
      spaceName: 'Checkout',
      title: 'Arreglar pago',
      responsibleName: 'Ana',
      reviewerName: null,
      status: 'completada',
      priority: 'normal',
      dueDate: null,
      completedAt: null,
      blockedByArea: null,
    });
    expect(row['Estado']).toBe('Hecho');
    expect(row['Proyecto']).toBe('Checkout');
    const keys = Object.keys(row);
    expect(keys).toEqual([
      'Proyecto', 'Tarea', 'Responsable', 'Revisor', 'Estado', 'Prioridad',
      'Fecha límite', 'Completada', 'Bloqueada por',
    ]);
    expect(keys).not.toContain('Espacio');
  });
});

describe('dueReportRow', () => {
  const due = {
    spaceName: 'Checkout',
    title: 'Arreglar pago',
    responsibleName: 'Ana',
    status: 'en_proceso',
    priority: 'baja',
    companyName: 'web-app',
    dueDate: '2026-11-06',
    dueDateOriginal: '2026-11-06',
    blockedByArea: null,
  };

  it('marca las vencidas con los días de retraso', () => {
    const row = dueReportRow(due, '2026-11-09');
    expect(row['Estado vencimiento']).toBe('VENCIDA (3 días)');
    expect(row['Estado']).toBe('En progreso');
    expect(row['Prioridad']).toBe('Baja');
    expect(row['Repositorio']).toBe('web-app');
    expect(row['Fecha ajustada']).toBe('');
  });

  it('muestra los días restantes de las próximas', () => {
    const row = dueReportRow({ ...due, dueDateOriginal: '2026-11-12', dueDate: '2026-11-14' }, '2026-11-09');
    expect(row['Estado vencimiento']).toBe('3 días restantes');
    expect(row['Fecha límite']).toBe('2026-11-12');
    expect(row['Fecha ajustada']).toBe('2026-11-14');
  });

  it('tiene las columnas esperadas y en orden', () => {
    expect(Object.keys(dueReportRow(due, '2026-11-09'))).toEqual([
      'Estado vencimiento', 'Proyecto', 'Tarea', 'Responsable', 'Estado', 'Prioridad',
      'Repositorio', 'Fecha límite', 'Fecha ajustada', 'Bloqueada por',
    ]);
  });
});
