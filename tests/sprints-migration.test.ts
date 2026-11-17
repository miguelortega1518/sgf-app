import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "sprints"')) return { file, sql };
  }
  return undefined;
}

describe('migración de sprints', () => {
  const migration = findMigration();

  it('existe un 0006_*.sql que crea sprints', () => {
    expect(migration, 'falta la migración con CREATE TABLE "sprints"').toBeDefined();
    expect(migration!.file).toMatch(/^0006_.*\.sql$/);
  });

  it('crea el enum sprint_status con sus valores en orden', () => {
    expect(migration!.sql).toMatch(
      /CREATE TYPE "public"\."sprint_status" AS ENUM\('planificado', 'activo', 'cerrado'\)/,
    );
  });

  it('define las columnas de sprints y el CHECK de fechas', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"id" uuid PRIMARY KEY DEFAULT gen_random_uuid\(\) NOT NULL/);
    expect(sql).toMatch(/"space_id" uuid NOT NULL/);
    expect(sql).toMatch(/"name" text NOT NULL/);
    expect(sql).toMatch(/"goal" text,/);
    expect(sql).toMatch(/"start_date" date NOT NULL/);
    expect(sql).toMatch(/"end_date" date NOT NULL/);
    expect(sql).toMatch(/"status" "sprint_status" DEFAULT 'planificado' NOT NULL/);
    expect(sql).toMatch(/CONSTRAINT "chk_sprint_dates" CHECK/);
  });

  it('añade tasks.sprint_id nullable con FK ON DELETE set null', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/ALTER TABLE "tasks" ADD COLUMN "sprint_id" uuid;/);
    expect(sql).not.toMatch(/"sprint_id" uuid NOT NULL/);
    expect(sql).toMatch(
      /ALTER TABLE "tasks" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("sprint_id"\) REFERENCES "public"\."sprints"\("id"\) ON DELETE set null/,
    );
  });

  it('tiene la FK de sprints.space_id a spaces(id)', () => {
    expect(migration!.sql).toMatch(
      /ALTER TABLE "sprints" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("space_id"\) REFERENCES "public"\."spaces"\("id"\)/,
    );
  });

  it('crea los índices, incluido el único parcial de sprint activo', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/CREATE INDEX "idx_sprint_space" ON "sprints"/);
    expect(sql).toMatch(/CREATE INDEX "idx_task_sprint" ON "tasks"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "uq_sprint_active_per_space" ON "sprints"[^;]*WHERE[^;]*'activo'/);
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

  it('el diario tiene la entrada idx 6 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 6);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0006 tiene public.sprints y tasks.sprint_id', () => {
    const path = resolve(FOLDER, 'meta/0006_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as {
      tables: Record<string, {
        columns: Record<string, { type: string; notNull: boolean }>;
        indexes: Record<string, { isUnique: boolean; where?: string }>;
      }>;
    };
    const sprints = snapshot.tables['public.sprints'];
    expect(sprints).toBeDefined();
    expect(sprints.columns.space_id).toMatchObject({ type: 'uuid', notNull: true });
    expect(sprints.columns.status).toMatchObject({ type: 'sprint_status', notNull: true });
    expect(sprints.indexes.uq_sprint_active_per_space).toMatchObject({ isUnique: true });
    expect(sprints.indexes.uq_sprint_active_per_space.where).toMatch(/activo/);
    const tasks = snapshot.tables['public.tasks'];
    expect(tasks.columns.sprint_id).toMatchObject({ type: 'uuid', notNull: false });
  });
});
