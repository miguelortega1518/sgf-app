import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "github_pull_requests"')) return { file, sql };
  }
  return undefined;
}

describe('migración de github_pull_requests', () => {
  const migration = findMigration();

  it('existe un 0003_*.sql que crea github_pull_requests', () => {
    expect(migration, 'falta la migración con CREATE TABLE "github_pull_requests"').toBeDefined();
    expect(migration!.file).toMatch(/^0003_.*\.sql$/);
  });

  it('crea el enum github_pr_state con los cuatro valores', () => {
    expect(migration!.sql).toContain(
      `CREATE TYPE "public"."github_pr_state" AS ENUM('abierto', 'borrador', 'fusionado', 'cerrado')`,
    );
  });

  it('url es la clave primaria y las columnas tienen el tipo esperado', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"url" text PRIMARY KEY NOT NULL/);
    expect(sql).toMatch(/"task_id" uuid NOT NULL/);
    expect(sql).toMatch(/"number" integer NOT NULL/);
    expect(sql).toMatch(/"title" text NOT NULL/);
    expect(sql).toMatch(/"state" "github_pr_state" NOT NULL/);
    expect(sql).toMatch(/"head_sha" text NOT NULL/);
    expect(sql).toMatch(/"author_login" text NOT NULL/);
    expect(sql).toMatch(/"opened_at" timestamp with time zone NOT NULL/);
    for (const col of ['ready_at', 'merged_at', 'closed_at', 'first_review_at']) {
      expect(sql).toMatch(new RegExp(`"${col}" timestamp with time zone(,|\\s*\\n)`));
    }
    expect(sql).toMatch(/"reviewers" jsonb DEFAULT '\[\]'::jsonb NOT NULL/);
    expect(sql).toMatch(/"checks" jsonb(,|\s*\n)/);
    expect(sql).toMatch(/"updated_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
  });

  it('task_id referencia a tasks con ON DELETE cascade', () => {
    expect(migration!.sql).toMatch(
      /FOREIGN KEY \("task_id"\) REFERENCES "public"\."tasks"\("id"\) ON DELETE cascade/,
    );
  });

  it('crea los índices de task_id y head_sha', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/CREATE INDEX "idx_github_pr_task" ON "github_pull_requests" USING btree \("task_id"\)/);
    expect(sql).toMatch(/CREATE INDEX "idx_github_pr_head_sha" ON "github_pull_requests" USING btree \("head_sha"\)/);
  });

  it('el diario tiene la entrada idx 3 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 3);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
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
