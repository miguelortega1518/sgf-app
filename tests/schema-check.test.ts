import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as appSchema from '../src/lib/db/schema';
import {
  diffSchema,
  describeDiff,
  expectedFromModule,
  expectedFromSnapshot,
  isClean,
  type ActualSchema,
  type ExpectedSchema,
} from '../src/lib/db/schema-check';

const expected: ExpectedSchema = {
  tables: { tasks: ['id', 'number'], persons: ['id', 'email'] },
  enums: { task_kind: ['feature', 'bug'] },
};
const actualOk: ActualSchema = {
  columns: [
    { table_name: 'tasks', column_name: 'id' },
    { table_name: 'tasks', column_name: 'number' },
    { table_name: 'persons', column_name: 'id' },
    { table_name: 'persons', column_name: 'email' },
    { table_name: 'persons', column_name: 'extra_que_sobra' },
  ],
  enumValues: [
    { name: 'task_kind', value: 'feature' },
    { name: 'task_kind', value: 'bug' },
  ],
};

describe('diffSchema', () => {
  it('no reporta nada cuando la base tiene todo (columnas de más se toleran)', () => {
    const diff = diffSchema(expected, actualOk);
    expect(isClean(diff)).toBe(true);
    expect(describeDiff(diff)).toEqual([]);
  });

  it('detecta una columna que falta, que es el fallo que ya ocurrió en producción', () => {
    const actual = { ...actualOk, columns: actualOk.columns.filter((c) => c.column_name !== 'number') };
    const diff = diffSchema(expected, actual);
    expect(diff.missingColumns).toEqual(['tasks.number']);
    expect(isClean(diff)).toBe(false);
  });

  it('detecta tablas, enums y valores de enum que faltan', () => {
    const diff = diffSchema(expected, {
      columns: [{ table_name: 'persons', column_name: 'id' }, { table_name: 'persons', column_name: 'email' }],
      enumValues: [{ name: 'task_kind', value: 'feature' }],
    });
    expect(diff.missingTables).toEqual(['tasks']);
    expect(diff.missingEnumValues).toEqual(['task_kind.bug']);
    const none = diffSchema(expected, { columns: actualOk.columns, enumValues: [] });
    expect(none.missingEnums).toEqual(['task_kind']);
  });
});

describe('esquema real del proyecto', () => {
  const fromCode = expectedFromModule(appSchema);

  it('el código declara las 24 tablas esperadas y los campos de Forja', () => {
    expect(Object.keys(fromCode.tables)).toHaveLength(24);
    expect(fromCode.tables.space_share_links).toEqual([
      'space_id', 'token_hash', 'created_by', 'created_at', 'revoked_at',
    ]);
    expect(fromCode.tables.sprints).toEqual([
      'id', 'space_id', 'name', 'goal', 'start_date', 'end_date', 'status', 'started_at', 'summary',
      'created_at', 'updated_at',
    ]);
    expect(fromCode.tables.spaces).toContain('business_days_only');
    expect(fromCode.tables.sprint_capacity).toEqual([
      'sprint_id', 'person_id', 'points', 'created_at', 'updated_at',
    ]);
    expect(fromCode.tables.tasks).toContain('sprint_id');
    expect(fromCode.enums.sprint_status).toEqual(['planificado', 'activo', 'cerrado']);
    expect(fromCode.tables.digest_runs).toEqual(expect.arrayContaining(['person_id', 'day', 'created_at']));
    expect(fromCode.tables.github_deliveries).toEqual(expect.arrayContaining(['delivery_id', 'event', 'received_at', 'outcome']));
    expect(fromCode.tables.github_pull_requests).toEqual(expect.arrayContaining(['url', 'task_id', 'head_sha', 'reviewers', 'checks', 'first_review_at']));
    expect(fromCode.enums.github_pr_state).toEqual(['abierto', 'borrador', 'fusionado', 'cerrado']);
    expect(fromCode.tables.tasks).toContain('number');
    expect(fromCode.tables.tasks).toContain('pr_url');
    expect(fromCode.tables.persons).toContain('password_hash');
    expect(fromCode.enums.blocked_by_area).toContain('infraestructura');
  });

  it('el último snapshot de migraciones coincide con schema.ts (si no, falta generar una migración)', () => {
    const meta = resolve(__dirname, '../src/lib/db/migrations/meta');
    const latest = readdirSync(meta).filter((f) => f.endsWith('_snapshot.json')).sort().pop()!;
    const snap = expectedFromSnapshot(JSON.parse(readFileSync(resolve(meta, latest), 'utf8')));
    const sortAll = (e: ExpectedSchema) => ({
      tables: Object.fromEntries(Object.entries(e.tables).map(([k, v]) => [k, [...v].sort()]).sort()),
      enums: Object.fromEntries(Object.entries(e.enums).map(([k, v]) => [k, [...v].sort()]).sort()),
    });
    expect(sortAll(snap)).toEqual(sortAll(fromCode));
  });
});
