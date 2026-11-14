import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "github_deliveries"')) return { file, sql };
  }
  return undefined;
}

describe('migración de github_deliveries', () => {
  const migration = findMigration();

  it('existe un .sql que crea github_deliveries', () => {
    expect(migration, 'falta la migración con CREATE TABLE "github_deliveries"').toBeDefined();
    expect(migration!.file).toMatch(/^0002_.*\.sql$/);
  });

  it('delivery_id es la clave primaria y el resto de columnas tiene el tipo esperado', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"delivery_id" text PRIMARY KEY NOT NULL/);
    expect(sql).toMatch(/"event" text NOT NULL/);
    expect(sql).toMatch(/"received_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/"outcome" text(,|\s*\n)/);
  });

  it('inserta la persona de sistema GitHub inactiva y de forma idempotente', () => {
    const sql = migration!.sql;
    const insertIdx = sql.search(/INSERT INTO "persons"/);
    expect(insertIdx).toBeGreaterThan(sql.indexOf('CREATE TABLE "github_deliveries"'));
    const insert = sql.slice(insertIdx);
    expect(insert).toContain("'github@forja.system'");
    expect(insert).toContain("'GitHub'");
    expect(insert).toMatch(/'miembro'/);
    expect(insert).toMatch(/"active"/);
    expect(insert).toMatch(/"must_change_password"/);
    expect(insert).toMatch(/false,\s*false/);
    expect(insert).toContain('ON CONFLICT ("email") DO NOTHING');
    // El hash no es bcrypt ($2…) y lleva una parte aleatoria.
    expect(insert).toContain('md5(random()::text)');
    expect(insert).not.toMatch(/'\$2[aby]\$/);
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
