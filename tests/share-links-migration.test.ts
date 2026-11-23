import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { evaluateMigration } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');

function findMigration(): { file: string; sql: string } | undefined {
  for (const file of readdirSync(FOLDER).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(FOLDER, file), 'utf8');
    if (sql.includes('CREATE TABLE "space_share_links"')) return { file, sql };
  }
  return undefined;
}

type SnapshotColumn = { type: string; notNull: boolean; primaryKey?: boolean; default?: unknown };
type Snapshot = {
  tables: Record<string, {
    columns: Record<string, SnapshotColumn>;
    indexes?: Record<string, { name: string; isUnique: boolean; where?: string; columns: { expression: string }[] }>;
    foreignKeys?: Record<string, { tableTo: string; columnsFrom: string[]; columnsTo: string[] }>;
  }>;
};

describe('migración de enlaces públicos (space_share_links)', () => {
  const migration = findMigration();

  it('existe un 0009_*.sql que crea space_share_links', () => {
    expect(migration, 'falta la migración con CREATE TABLE "space_share_links"').toBeDefined();
    expect(migration!.file).toMatch(/^0009_.*\.sql$/);
  });

  it('columnas, tipos y PK en token_hash', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/"space_id" uuid NOT NULL/);
    expect(sql).toMatch(/"token_hash" text PRIMARY KEY NOT NULL/);
    expect(sql).toMatch(/"created_by" uuid NOT NULL/);
    expect(sql).toMatch(/"created_at" timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/"revoked_at" timestamp with time zone[,\n]/);
    expect(sql).not.toMatch(/"revoked_at" timestamp with time zone NOT NULL/);
    expect(sql).not.toMatch(/"token" /);
  });

  it('FKs a spaces y persons', () => {
    const sql = migration!.sql;
    expect(sql).toMatch(/FOREIGN KEY \("space_id"\) REFERENCES "public"\."spaces"\("id"\)/);
    expect(sql).toMatch(/FOREIGN KEY \("created_by"\) REFERENCES "public"\."persons"\("id"\)/);
  });

  it('índice único parcial: un enlace activo por proyecto', () => {
    expect(migration!.sql).toMatch(
      /CREATE UNIQUE INDEX "uq_share_link_active_per_space" ON "space_share_links" USING btree \("space_id"\) WHERE revoked_at IS NULL/,
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

  it('el diario tiene la entrada idx 9 con su tag', () => {
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[];
    };
    const entry = journal.entries.find(e => e.idx === 9);
    expect(entry).toBeDefined();
    expect(`${entry!.tag}.sql`).toBe(migration!.file);
  });

  it('el snapshot 0009 tiene space_share_links', () => {
    const path = resolve(FOLDER, 'meta/0009_snapshot.json');
    expect(existsSync(path)).toBe(true);
    const snapshot = JSON.parse(readFileSync(path, 'utf8')) as Snapshot;

    const table = snapshot.tables['public.space_share_links'];
    expect(table).toBeDefined();
    expect(Object.keys(table.columns).sort()).toEqual(
      ['created_at', 'created_by', 'revoked_at', 'space_id', 'token_hash'],
    );
    expect(table.columns.space_id).toMatchObject({ type: 'uuid', notNull: true });
    expect(table.columns.token_hash).toMatchObject({ type: 'text', notNull: true, primaryKey: true });
    expect(table.columns.created_by).toMatchObject({ type: 'uuid', notNull: true });
    expect(table.columns.created_at).toMatchObject({ type: 'timestamp with time zone', notNull: true, default: 'now()' });
    expect(table.columns.revoked_at).toMatchObject({ type: 'timestamp with time zone', notNull: false });

    const index = table.indexes?.uq_share_link_active_per_space;
    expect(index).toBeDefined();
    expect(index!.isUnique).toBe(true);
    expect(index!.where).toBe('revoked_at IS NULL');
    expect(index!.columns.map(c => c.expression)).toEqual(['space_id']);

    const fks = Object.values(table.foreignKeys ?? {});
    expect(fks.map(fk => `${fk.columnsFrom[0]}->${fk.tableTo}.${fk.columnsTo[0]}`).sort()).toEqual(
      ['created_by->persons.id', 'space_id->spaces.id'],
    );
  });
});
