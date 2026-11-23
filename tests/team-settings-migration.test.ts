import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "team_settings"')) return { file, sql };
  }
  return undefined;
}

type SnapshotColumn = { type: string; notNull: boolean; primaryKey?: boolean; default?: unknown };
type Snapshot = {
  tables: Record<string, {
    columns: Record<string, SnapshotColumn>;
    foreignKeys?: Record<string, { tableTo: string; columnsFrom: string[]; columnsTo: string[] }>;
  }>;
};

describe('migración de ajustes del equipo (team_settings)', () => {
  const migration = findMigration();

  it('existe un 0010_*.sql que crea team_settings', () => {
    expect(migration, 'falta la migración con CREATE TABLE "team_settings"').toBeDefined();
    expect(migration!.file).toMatch(/^0010_.*\.sql$/);
  });

  it('columnas, tipos y valores por defecto', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"id" integer PRIMARY KEY DEFAULT 1 NOT NULL/);
    expect(sql).toMatch(/"show_person_metrics" boolean DEFAULT true NOT NULL/);
    expect(sql).toMatch(/"updated_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/"updated_by" uuid[,\n]/);
    expect(sql).not.toMatch(/"updated_by" uuid NOT NULL/);
  });

  it('FK de updated_by a persons', () => {
    expect(migration!.sql).toMatch(/FOREIGN KEY \("updated_by"\) REFERENCES "public"\."persons"\("id"\)/);
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

  it('el diario tiene la entrada idx 10 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 10);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0010 tiene team_settings', () => {
    const path = resolve(FOLDER, 'meta/0010_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;

    const table = snapshot.tables['public.team_settings'];
    expect(table).toBeDefined();
    expect(Object.keys(table.columns).sort()).toEqual(['id', 'show_person_metrics', 'updated_at', 'updated_by']);
    expect(table.columns.id).toMatchObject({ type: 'integer', notNull: true, primaryKey: true, default: 1 });
    expect(table.columns.show_person_metrics).toMatchObject({ type: 'boolean', notNull: true, default: true });
    expect(table.columns.updated_at).toMatchObject({ type: 'timestamp with time zone', notNull: true, default: 'now()' });
    expect(table.columns.updated_by).toMatchObject({ type: 'uuid', notNull: false });

    const fks = Object.values(table.foreignKeys ?? {});
    expect(fks.map(fk => `${fk.columnsFrom[0]}->${fk.tableTo}.${fk.columnsTo[0]}`)).toEqual(['updated_by->persons.id']);
  });
});
