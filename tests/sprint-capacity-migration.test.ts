import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "sprint_capacity"')) return { file, sql };
  }
  return undefined;
}

type SnapshotColumn = { type: string; notNull: boolean; default?: unknown };
type Snapshot = {
  tables: Record<string, {
    columns: Record<string, SnapshotColumn>;
    compositePrimaryKeys?: Record<string, { columns: string[] }>;
    checkConstraints?: Record<string, { name: string; value: string }>;
  }>;
};

describe('migración de capacidad, arrastre y retrospectiva', () => {
  const migration = findMigration();

  it('existe un 0008_*.sql que crea sprint_capacity', () => {
    expect(migration, 'falta la migración con CREATE TABLE "sprint_capacity"').toBeDefined();
    expect(migration!.file).toMatch(/^0008_.*\.sql$/);
  });

  it('sprint_capacity: columnas, PK compuesta y CHECK de puntos', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"sprint_id" uuid NOT NULL/);
    expect(sql).toMatch(/"person_id" uuid NOT NULL/);
    expect(sql).toMatch(/"points" integer NOT NULL/);
    expect(sql).toMatch(/"created_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/"updated_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/PRIMARY KEY\("sprint_id","person_id"\)/);
    expect(sql).toMatch(/CONSTRAINT "chk_sprint_capacity_points" CHECK \("sprint_capacity"\."points" >= 0\)/);
  });

  it('sprint_capacity: FKs a sprints y persons', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/FOREIGN KEY \("sprint_id"\) REFERENCES "public"\."sprints"\("id"\)/);
    expect(sql).toMatch(/FOREIGN KEY \("person_id"\) REFERENCES "public"\."persons"\("id"\)/);
  });

  it('añade sprints.summary, sprints.started_at y spaces.business_days_only', () => {
    const sql = migration!.sql;
    expect(sql).toContain('ALTER TABLE "sprints" ADD COLUMN "summary" jsonb;');
    expect(sql).toContain('ALTER TABLE "sprints" ADD COLUMN "started_at" timestamp with time zone;');
    expect(sql).toContain('ALTER TABLE "spaces" ADD COLUMN "business_days_only" boolean DEFAULT true NOT NULL;');
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

  it('el diario tiene la entrada idx 8 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 8);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0008 tiene sprint_capacity y las columnas nuevas', () => {
    const path = resolve(FOLDER, 'meta/0008_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;

    const capacity = snapshot.tables['public.sprint_capacity'];
    expect(capacity).toBeDefined();
    expect(capacity.columns.sprint_id).toMatchObject({ type: 'uuid', notNull: true });
    expect(capacity.columns.person_id).toMatchObject({ type: 'uuid', notNull: true });
    expect(capacity.columns.points).toMatchObject({ type: 'integer', notNull: true });
    expect(Object.values(capacity.compositePrimaryKeys ?? {})[0]?.columns).toEqual(['sprint_id', 'person_id']);
    expect(Object.keys(capacity.checkConstraints ?? {})).toContain('chk_sprint_capacity_points');

    const sprints = snapshot.tables['public.sprints'].columns;
    expect(sprints.summary).toMatchObject({ type: 'jsonb', notNull: false });
    expect(sprints.started_at).toMatchObject({ type: 'timestamp with time zone', notNull: false });

    const businessDays = snapshot.tables['public.spaces'].columns.business_days_only;
    expect(businessDays).toMatchObject({ type: 'boolean', notNull: true, default: true });
  });
});
