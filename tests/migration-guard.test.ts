import { describe, it, expect } from 'vitest';
import { evaluateMigration, findRisky, splitStatements, validateJournal } from '../src/lib/db/migration-guard';

describe('findRisky', () => {
  it('deja pasar cambios que solo agregan', () => {
    const sql = `ALTER TABLE "tasks" ADD COLUMN "number" serial;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx" ON "tasks" ("number");--> statement-breakpoint
ALTER TYPE "public"."blocked_by_area" ADD VALUE 'qa';`;
    expect(findRisky(sql)).toEqual([]);
  });

  it.each([
    ['DROP TABLE "tasks";', 'elimina'],
    ['ALTER TABLE "tasks" DROP COLUMN "title";', 'elimina'],
    ['TRUNCATE TABLE "tasks" CASCADE;', 'vacía'],
    ['DELETE FROM "tasks" WHERE id = 1;', 'borra'],
    ['ALTER TABLE "tasks" ALTER COLUMN "estimate" SET DATA TYPE text;', 'tipo'],
    ['ALTER TABLE "tasks" ALTER COLUMN "title" SET NOT NULL;', 'obligatoria'],
    ['ALTER TABLE "tasks" RENAME COLUMN "title" TO "name";', 'renombra'],
    ['ALTER TABLE "tasks" ADD COLUMN "owner" text NOT NULL;', 'sin valor por defecto'],
  ])('marca como riesgosa: %s', (sql, fragment) => {
    const found = findRisky(sql);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toContain(fragment);
  });

  it('ignora lo que está dentro de comentarios', () => {
    expect(findRisky('-- DROP TABLE "tasks";\nALTER TABLE "tasks" ADD COLUMN "x" text;')).toEqual([]);
  });
});

describe('evaluateMigration', () => {
  it('bloquea un cambio destructivo sin autorización', () => {
    const v = evaluateMigration('ALTER TABLE "tasks" DROP COLUMN "title";');
    expect(v.ok).toBe(false);
    expect(v.reason).toBeNull();
  });

  it('lo permite si trae el motivo por escrito', () => {
    const v = evaluateMigration('-- allow-destructive: columna sin uso desde hace 3 meses, respaldo del 28-oct\nALTER TABLE "tasks" DROP COLUMN "title";');
    expect(v.ok).toBe(true);
    expect(v.findings).toHaveLength(1);
    expect(v.reason).toContain('respaldo');
  });

  it('una marca sin motivo no autoriza nada', () => {
    expect(evaluateMigration('-- allow-destructive:\nTRUNCATE "tasks";').ok).toBe(false);
  });
});

describe('splitStatements', () => {
  it('separa por el corte de drizzle-kit y por punto y coma', () => {
    expect(splitStatements('CREATE TABLE a (id int);--> statement-breakpoint\nCREATE TABLE b (id int);')).toEqual([
      'CREATE TABLE a (id int)',
      'CREATE TABLE b (id int)',
    ]);
  });
});

describe('validateJournal', () => {
  const entries = [
    { idx: 0, tag: '0000_baseline', when: 100 },
    { idx: 1, tag: '0001_x', when: 200 },
  ];
  const sql = ['0000_baseline.sql', '0001_x.sql'];
  const snaps = ['0000_snapshot.json', '0001_snapshot.json'];

  it('acepta un diario consistente', () => {
    expect(validateJournal(entries, sql, snaps)).toEqual([]);
  });

  it('detecta fechas que no crecen, que drizzle ignoraría en silencio', () => {
    const p = validateJournal([entries[0], { ...entries[1], when: 100 }], sql, snaps);
    expect(p.join(' ')).toContain('0001_x');
  });

  it('detecta archivos faltantes y huérfanos', () => {
    expect(validateJournal(entries, ['0000_baseline.sql'], snaps).join(' ')).toContain('Falta el archivo 0001_x.sql');
    expect(validateJournal(entries, [...sql, '0002_suelta.sql'], snaps).join(' ')).toContain('0002_suelta.sql no está en el diario');
    expect(validateJournal(entries, sql, ['0000_snapshot.json']).join(' ')).toContain('0001_snapshot.json');
  });
});
