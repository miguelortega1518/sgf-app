/**
 * Revisión estática de las migraciones. No necesita base de datos; corre en CI y antes de cada commit.
 *   npm run db:check
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateMigration, validateJournal, type JournalEntry } from '../src/lib/db/migration-guard';

const FOLDER = resolve(__dirname, '../src/lib/db/migrations');
const META = resolve(FOLDER, 'meta');

const journal = JSON.parse(readFileSync(resolve(META, '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
const sqlFiles = readdirSync(FOLDER).filter((f) => f.endsWith('.sql'));
const snapshots = readdirSync(META).filter((f) => f.endsWith('_snapshot.json'));

let failed = false;

for (const p of validateJournal(journal.entries, sqlFiles, snapshots)) {
  console.error(`✗ ${p}`);
  failed = true;
}

for (const entry of journal.entries) {
  const sql = readFileSync(resolve(FOLDER, `${entry.tag}.sql`), 'utf8');
  const verdict = evaluateMigration(sql);
  if (verdict.ok && verdict.findings.length === 0) {
    console.log(`✓ ${entry.tag}`);
  } else if (verdict.ok) {
    console.log(`⚠ ${entry.tag} contiene cambios destructivos AUTORIZADOS: ${verdict.reason}`);
    for (const f of verdict.findings) console.log(`    - ${f.rule}: ${f.statement}`);
  } else {
    failed = true;
    console.error(`✗ ${entry.tag} contiene cambios que pueden destruir datos o romper la versión anterior:`);
    for (const f of verdict.findings) console.error(`    - ${f.rule}: ${f.statement}`);
    console.error('    Si es intencional, haga el cambio en dos pasos (primero agregar, luego quitar) o añada al archivo:');
    console.error('    -- allow-destructive: <motivo y plan de respaldo>');
  }
}

if (failed) process.exit(1);
console.log(`\nMigraciones revisadas: ${journal.entries.length}`);
