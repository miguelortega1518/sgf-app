/**
 * Aplica las migraciones pendientes de forma segura. Es lo que corre el deploy.
 *   npm run db:migrate            aplica
 *   npm run db:migrate -- --plan  solo muestra qué haría, sin cambiar nada
 *
 * Garantías:
 *  - Todas las migraciones pendientes se aplican en UNA transacción: o entran todas o ninguna.
 *  - Una base creada antes con `db:push` se adopta como línea base SOLO si coincide con ella.
 *  - Se niega a aplicar cambios destructivos que no estén autorizados por escrito en el archivo.
 *  - Después de migrar verifica que la base tenga todo lo que el código espera.
 *  - Un candado impide dos migraciones simultáneas; EXPECT_DB_NAME evita apuntar a la base equivocada.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as appSchema from '../src/lib/db/schema';
import {
  checkSchema,
  describeDiff,
  expectedFromModule,
  expectedFromSnapshot,
  isClean,
  type Query,
} from '../src/lib/db/schema-check';
import { evaluateMigration, type JournalEntry } from '../src/lib/db/migration-guard';

const FOLDER = process.env.MIGRATIONS_FOLDER ? resolve(process.env.MIGRATIONS_FOLDER) : resolve(__dirname, '../src/lib/db/migrations');
const PLAN_ONLY = process.argv.includes('--plan');
const LOCK_KEY = 727274;

function die(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) die('Falta DATABASE_URL');

  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.slice(1));
  console.log(`Base de datos: ${dbName} @ ${parsed.hostname}${PLAN_ONLY ? '  (solo plan, no se cambia nada)' : ''}`);

  const expectName = process.env.EXPECT_DB_NAME;
  if (expectName && expectName !== dbName) {
    die(`EXPECT_DB_NAME=${expectName} pero DATABASE_URL apunta a "${dbName}". No se hace nada.`);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const query: Query = (text) => sql.unsafe(text) as unknown as Promise<Record<string, unknown>[]>;

  try {
    await sql`select pg_advisory_lock(${LOCK_KEY})`;
    await sql`set lock_timeout = '15s'`;

    const migrations = readMigrationFiles({ migrationsFolder: FOLDER });
    const journal = JSON.parse(readFileSync(resolve(FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
    if (migrations.length !== journal.entries.length || migrations.length === 0) die('El diario de migraciones está vacío o no coincide con los archivos.');

    const [{ j }] = await sql<{ j: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations')::text as j`;
    const [{ p }] = await sql<{ p: string | null }[]>`select to_regclass('public.persons')::text as p`;

    // En modo plan no se escribe nada, pero el informe debe reflejar lo que pasaría de verdad.
    let planAdopted = false;

    // Base creada con `db:push`: se adopta como línea base solo si coincide con ella.
    if (!j && p) {
      console.log('La base existe pero no tiene historial de migraciones (se creó con db:push).');
      const snapshot = JSON.parse(readFileSync(resolve(FOLDER, 'meta', '0000_snapshot.json'), 'utf8'));
      const diff = await checkSchema(query, expectedFromSnapshot(snapshot));
      if (!isClean(diff)) {
        console.error('La base NO coincide con la línea base:');
        for (const line of describeDiff(diff)) console.error(`  - ${line}`);
        die('No se adopta la base. No se modificó nada.');
      }
      console.log(`✓ Coincide con la línea base (${journal.entries[0].tag}).`);
      if (!PLAN_ONLY) {
        const baseline = migrations[0];
        await sql.begin(async (tx) => {
          await tx`create schema if not exists drizzle`;
          await tx`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
          await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${baseline.hash}, ${String(baseline.folderMillis)})`;
        });
        console.log('✓ Línea base marcada como aplicada (sin ejecutar su SQL: las tablas ya existen).');
      } else {
        planAdopted = true;
        console.log('  (plan) se marcaría la línea base como aplicada.');
      }
    }

    // ¿Qué falta por aplicar?
    let lastApplied = 0;
    const [{ j2 }] = await sql<{ j2: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations')::text as j2`;
    if (j2) {
      const rows = await sql<{ created_at: string }[]>`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`;
      if (rows[0]) lastApplied = Number(rows[0].created_at);
    }
    if (planAdopted) lastApplied = migrations[0].folderMillis;
    const pending = migrations
      .map((m, i) => ({ m, tag: journal.entries[i].tag }))
      .filter(({ m }) => m.folderMillis > lastApplied);

    if (pending.length === 0) {
      console.log('Sin migraciones pendientes.');
    } else {
      console.log(`Pendientes (${pending.length}): ${pending.map((x) => x.tag).join(', ')}`);
      let blocked = false;
      for (const { tag } of pending) {
        const text = readFileSync(resolve(FOLDER, `${tag}.sql`), 'utf8');
        const verdict = evaluateMigration(text);
        if (!verdict.ok) {
          blocked = true;
          console.error(`✗ ${tag} contiene cambios que pueden destruir datos o romper la versión anterior:`);
          for (const f of verdict.findings) console.error(`    - ${f.rule}: ${f.statement}`);
        } else if (verdict.findings.length) {
          console.log(`⚠ ${tag} trae cambios destructivos autorizados: ${verdict.reason}`);
        }
      }
      if (blocked) die('Migración bloqueada. Hágala en dos pasos o autorícela con "-- allow-destructive: <motivo>" en el archivo.');

      if (!PLAN_ONLY) {
        const started = Date.now();
        await migrate(drizzle(sql), { migrationsFolder: FOLDER });
        console.log(`✓ Migraciones aplicadas en una sola transacción (${Date.now() - started} ms).`);
      }
    }

    if (PLAN_ONLY) {
      console.log('\nPlan terminado. No se cambió nada.');
      return;
    }

    // Verificación final: la base debe tener todo lo que el código necesita.
    const diff = await checkSchema(query, expectedFromModule(appSchema));
    if (!isClean(diff)) {
      console.error('Después de migrar, la base no coincide con lo que el código espera:');
      for (const line of describeDiff(diff)) console.error(`  - ${line}`);
      die('Esquema inconsistente: falta generar una migración (npm run db:generate).');
    }
    console.log('✓ El esquema de la base coincide con el código.');
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\n✗ La migración falló y se revirtió:', err instanceof Error ? err.message : err);
  if (err && typeof err === 'object' && 'cause' in err) console.error('  Causa:', (err as { cause?: { message?: string } }).cause?.message ?? (err as { cause: unknown }).cause);
  process.exit(1);
});
