import { test, expect } from 'vitest';
import {
  taskKey, prLabel, initials, AREA_LABEL, STATUS_ORDER, STATUS_LABEL,
  DELAY_REASON_ORDER, DELAY_REASON_LABEL, delayReasonLabel,
} from '../src/lib/labels';
import { createTaskSchema, updateTaskSchema, updateTaskStatusSchema } from '../src/lib/schemas/task';

test('taskKey', () => {
  expect(taskKey(142)).toBe('FOR-142');
  expect(taskKey(null)).toBe('');
  expect(taskKey(undefined)).toBe('');
});

test('prLabel reconoce GitHub y GitLab', () => {
  expect(prLabel('https://github.com/org/repo/pull/218')).toBe('#218');
  expect(prLabel('https://gitlab.com/org/repo/-/merge_requests/57')).toBe('#57');
  expect(prLabel('https://www.example.com/algo')).toBe('example.com');
  expect(prLabel('')).toBe('');
  expect(prLabel('no es una url')).toBe('PR');
});

test('initials', () => {
  expect(initials('Ileana Encarnación')).toBe('IE');
  expect(initials('  luz  ')).toBe('L');
});

test('todos los estados tienen etiqueta y las áreas heredadas siguen legibles', () => {
  for (const s of STATUS_ORDER) expect(STATUS_LABEL[s]).toBeTruthy();
  expect(AREA_LABEL.tesoreria).toBe('Tesorería');
  expect(AREA_LABEL.qa).toBe('QA');
});

const delayReasonOptions: readonly string[] = updateTaskStatusSchema.shape.delayReason.unwrap().options;

test('cada motivo de retraso del schema tiene etiqueta propia', () => {
  expect(delayReasonOptions.length).toBeGreaterThan(0);
  for (const v of delayReasonOptions) {
    expect(Object.hasOwn(DELAY_REASON_LABEL, v)).toBe(true);
    const label = (DELAY_REASON_LABEL as Record<string, string>)[v];
    expect(label).toBeTruthy();
    expect(label).not.toBe(v);
  }
});

test('DELAY_REASON_ORDER coincide exactamente con el enum del schema', () => {
  expect([...DELAY_REASON_ORDER]).toEqual([...delayReasonOptions]);
});

test('delayReasonLabel traduce los códigos de motivo de retraso', () => {
  expect(delayReasonLabel('otro')).toBe('Otro');
  expect(delayReasonLabel('error_sistema')).toBe('Fallo de entorno o infraestructura');
  expect(delayReasonLabel('falta_informacion_terceros')).toBe('Falta información de un tercero');
  expect(delayReasonLabel('documento_no_recibido_otra_area')).toBe('Falta una definición de otro equipo');
  expect(delayReasonLabel('capacidad_insuficiente')).toBe('Capacidad insuficiente');
  expect(delayReasonLabel('dependencia_atrasada')).toBe('Dependencia atrasada');
  expect(delayReasonLabel('repriorizacion')).toBe('Repriorización');
});

test('delayReasonLabel devuelve el texto original si no es un código', () => {
  expect(delayReasonLabel('Moderado por admin')).toBe('Moderado por admin');
  expect(delayReasonLabel('')).toBe('');
});

test('delayReasonLabel no resuelve propiedades del prototipo', () => {
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    expect(delayReasonLabel(k)).toBe(k);
  }
});

const base = { spaceId: '11111111-1111-4111-8111-111111111111', title: 'x', responsibleId: '22222222-2222-4222-8222-222222222222' };

test('createTaskSchema aplica valores por defecto y valida los campos de desarrollo', () => {
  const ok = createTaskSchema.parse(base);
  expect(ok.kind).toBe('feature');
  const full = createTaskSchema.parse({ ...base, kind: 'bug', estimate: 5, branch: 'fix/login-timeout', prUrl: 'https://github.com/o/r/pull/9', labels: ['auth'] });
  expect(full.estimate).toBe(5);
  expect(full.prUrl).toBe('https://github.com/o/r/pull/9');
});

test('createTaskSchema rechaza datos inválidos', () => {
  expect(() => createTaskSchema.parse({ ...base, kind: 'epica' })).toThrow();
  expect(() => createTaskSchema.parse({ ...base, estimate: -1 })).toThrow();
  expect(() => createTaskSchema.parse({ ...base, estimate: 2.5 })).toThrow();
  expect(() => createTaskSchema.parse({ ...base, branch: 'rama con espacios' })).toThrow();
  expect(() => createTaskSchema.parse({ ...base, prUrl: 'javascript:alert(1)' })).toThrow();
  expect(() => createTaskSchema.parse({ ...base, labels: Array(9).fill('a') })).toThrow();
});

test('updateTaskSchema permite vaciar rama y PR con cadena vacía', () => {
  const r = updateTaskSchema.parse({ branch: '', prUrl: '' });
  expect(r.branch).toBe(null);
  expect(r.prUrl).toBe(null);
});
