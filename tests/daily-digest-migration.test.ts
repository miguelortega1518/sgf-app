import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "digest_runs"')) return { file, sql };
  }
  return undefined;
}

describe('migración del resumen diario', () => {
  const migration = findMigration();

  it('existe un 0005_*.sql que crea digest_runs', () => {
    expect(migration, 'falta la migración con CREATE TABLE "digest_runs"').toBeDefined();
    expect(migration!.file).toMatch(/^0005_.*\.sql$/);
  });

  it('define las columnas y la clave primaria compuesta (person_id, day)', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"person_id" uuid NOT NULL/);
    expect(sql).toMatch(/"day" date NOT NULL/);
    expect(sql).toMatch(/"created_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/PRIMARY KEY\("person_id","day"\)/);
  });

  it('tiene la FK de person_id a persons(id)', () => {
    expect(migration!.sql).toMatch(
      /ALTER TABLE "digest_runs" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("person_id"\) REFERENCES "public"\."persons"\("id"\)/,
    );
  });

  it('sólo contiene el CREATE TABLE y su FK', () => {
    const statements = migration!.sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^CREATE TABLE "digest_runs"/);
    expect(statements[1]).toMatch(/^ALTER TABLE "digest_runs" ADD CONSTRAINT/);
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

  it('el diario tiene la entrada idx 5 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 5);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0005 tiene public.digest_runs con sus columnas y la clave compuesta', () => {
    const path = resolve(FOLDER, 'meta/0005_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
      tables: Record<string, {
        columns: Record<string, { type: string; notNull: boolean; default?: unknown }>;
        compositePrimaryKeys: Record<string, { columns: string[] }>;
      }>;
    };
    const table = snapshot.tables['public.digest_runs'];
    expect(table).toBeDefined();
    expect(table.columns.person_id).toMatchObject({ type: 'uuid', notNull: true });
    expect(table.columns.day).toMatchObject({ type: 'date', notNull: true });
    expect(table.columns.created_at).toMatchObject({ type: 'timestamp with time zone', notNull: true });
    const pks = Object.values(table.compositePrimaryKeys);
    expect(pks).toHaveLength(1);
    expect(pks[0].columns).toEqual(['person_id', 'day']);
  });
});
