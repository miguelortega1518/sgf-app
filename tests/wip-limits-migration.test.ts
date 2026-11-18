import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('"wip_limits"')) return { file, sql };
  }
  return undefined;
}

describe('migración de límites WIP', () => {
  const migration = findMigration();

  it('existe un 0007_*.sql que añade spaces.wip_limits', () => {
    expect(migration, 'falta la migración con "wip_limits"').toBeDefined();
    expect(migration!.file).toMatch(/^0007_.*\.sql$/);
  });

  it('añade la columna jsonb NOT NULL con valor por defecto {}', () => {
    expect(migration!.sql).toContain(
      `ALTER TABLE "spaces" ADD COLUMN "wip_limits" jsonb DEFAULT '{}'::jsonb NOT NULL`,
    );
  });

  it('no contiene cambios destructivos', () => {
    const sql = migration!.sql;
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/allow-destructive/);
    const verdict = evaluateMigration(sql);
    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([]);
  });

  it('el diario tiene la entrada idx 7 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 7);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0007 tiene public.spaces.columns.wip_limits jsonb NOT NULL', () => {
    const path = resolve(FOLDER, 'meta/0007_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
      tables: Record<string, { columns: Record<string, { type: string; notNull: boolean; default?: string }> }>;
    };
    const column = snapshot.tables['public.spaces'].columns.wip_limits;
    expect(column).toMatchObject({ type: 'jsonb', notNull: true });
    expect(column.default).toBe(`'{}'::jsonb`);
  });
});
