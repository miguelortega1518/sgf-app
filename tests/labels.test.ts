import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskKey, prLabel, initials, AREA_LABEL, STATUS_ORDER, STATUS_LABEL } from '../src/lib/labels';
import { createTaskSchema, updateTaskSchema } from '../src/lib/schemas/task';

test('taskKey', () => {
  assert.equal(taskKey(142), 'FOR-142');
  assert.equal(taskKey(null), '');
  assert.equal(taskKey(undefined), '');
});

test('prLabel reconoce GitHub y GitLab', () => {
  assert.equal(prLabel('https://github.com/org/repo/pull/218'), '#218');
  assert.equal(prLabel('https://gitlab.com/org/repo/-/merge_requests/57'), '#57');
  assert.equal(prLabel('https://www.example.com/algo'), 'example.com');
  assert.equal(prLabel(''), '');
  assert.equal(prLabel('no es una url'), 'PR');
});

test('initials', () => {
  assert.equal(initials('Ileana Encarnación'), 'IE');
  assert.equal(initials('  luz  '), 'L');
});

test('todos los estados tienen etiqueta y las áreas heredadas siguen legibles', () => {
  for (const s of STATUS_ORDER) assert.ok(STATUS_LABEL[s]);
  assert.equal(AREA_LABEL.tesoreria, 'Tesorería');
  assert.equal(AREA_LABEL.qa, 'QA');
});

const base = { spaceId: '11111111-1111-4111-8111-111111111111', title: 'x', responsibleId: '22222222-2222-4222-8222-222222222222' };

test('createTaskSchema aplica valores por defecto y valida los campos de desarrollo', () => {
  const ok = createTaskSchema.parse(base);
  assert.equal(ok.kind, 'feature');
  const full = createTaskSchema.parse({ ...base, kind: 'bug', estimate: 5, branch: 'fix/login-timeout', prUrl: 'https://github.com/o/r/pull/9', labels: ['auth'] });
  assert.equal(full.estimate, 5);
  assert.equal(full.prUrl, 'https://github.com/o/r/pull/9');
});

test('createTaskSchema rechaza datos inválidos', () => {
  assert.throws(() => createTaskSchema.parse({ ...base, kind: 'epica' }));
  assert.throws(() => createTaskSchema.parse({ ...base, estimate: -1 }));
  assert.throws(() => createTaskSchema.parse({ ...base, estimate: 2.5 }));
  assert.throws(() => createTaskSchema.parse({ ...base, branch: 'rama con espacios' }));
  assert.throws(() => createTaskSchema.parse({ ...base, prUrl: 'javascript:alert(1)' }));
  assert.throws(() => createTaskSchema.parse({ ...base, labels: Array(9).fill('a') }));
});

test('updateTaskSchema permite vaciar rama y PR con cadena vacía', () => {
  const r = updateTaskSchema.parse({ branch: '', prUrl: '' });
  assert.equal(r.branch, null);
  assert.equal(r.prUrl, null);
});
