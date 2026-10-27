import { test, expect } from 'vitest';
import { taskKey, prLabel, initials, AREA_LABEL, STATUS_ORDER, STATUS_LABEL } from '../src/lib/labels';
import { createTaskSchema, updateTaskSchema } from '../src/lib/schemas/task';

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
