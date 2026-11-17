import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

const IMMEDIATE_SQL = 'ALTER TABLE "persons" ADD COLUMN "email_immediate" boolean DEFAULT true NOT NULL';
const DIGEST_SQL = 'ALTER TABLE "persons" ADD COLUMN "email_digest" boolean DEFAULT true NOT NULL';

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('"email_immediate"')) return { file, sql };
  }
  return undefined;
}

describe('migración de preferencias de correo', () => {
  const migration = findMigration();

  it('existe un 0004_*.sql que añade las columnas a persons', () => {
    expect(migration, 'falta la migración con "email_immediate"').toBeDefined();
    expect(migration!.file).toMatch(/^0004_.*\.sql$/);
  });

  it('añade email_immediate y email_digest como boolean DEFAULT true NOT NULL', () => {
    expect(migration!.sql).toContain(IMMEDIATE_SQL);
    expect(migration!.sql).toContain(DIGEST_SQL);
  });

  it('sólo contiene los dos ALTER TABLE ... ADD COLUMN', () => {
    const statements = migration!.sql
      .split('--> statement-breakpoint')
      .map(s => s.trim().replace(/;$/, ''))
      .filter(Boolean);
    expect(statements.sort()).toEqual([DIGEST_SQL, IMMEDIATE_SQL].sort());
  });

  it('el diario tiene la entrada idx 4 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 4);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0004 tiene ambas columnas en persons', () => {
    const path = resolve(FOLDER, 'meta/0004_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
      tables: Record<string, { columns: Record<string, { type: string; notNull: boolean; default?: unknown }> }>;
    };
    const columns = snapshot.tables['public.persons'].columns;
    for (const name of ['email_immediate', 'email_digest']) {
      expect(columns[name]).toMatchObject({ type: 'boolean', notNull: true, default: true });
    }
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
});
