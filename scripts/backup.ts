/**
 * Respaldo lógico de toda la base en un archivo .json.gz. Solo lee: no modifica nada.
 *   BACKUP_DIR=C:/ruta/respaldos npm run db:backup
 * Variables: DATABASE_URL (obligatoria), BACKUP_DIR (por defecto ./backups),
 *            BACKUP_KEEP_DAYS (por defecto 30; 0 = no borrar respaldos viejos).
 */
import postgres from 'postgres';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXCLUDED_TABLES, RAW_TEMPORAL_TYPES, quoteIdent, validateBackupFile, type BackupFile } from './lib/backup-format';

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) die('Falta DATABASE_URL');
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const dir = resolve(process.env.BACKUP_DIR ?? './backups');
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

  const sql = postgres(url, { max: 1, onnotice: () => {}, types: RAW_TEMPORAL_TYPES });
  let file: BackupFile;
  try {
    // Una sola instantánea consistente: todas las tablas se leen como estaban en el mismo instante.
    file = await sql.begin('isolation level repeatable read read only', async (tx) => {
      const bytea = await tx`select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type = 'bytea'`;
      if (bytea.length > 0) throw new Error(`Hay columnas binarias (${bytea.map((r) => `${r.table_name}.${r.column_name}`).join(', ')}) que este respaldo no sabe guardar.`);

      const tableRows = await tx`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
      const tables = tableRows.map((r) => r.table_name as string).filter((t) => !EXCLUDED_TABLES.includes(t));
      if (tables.length === 0) throw new Error('La base no tiene tablas: no hay nada que respaldar. ¿Es la base correcta?');

      const data: BackupFile['data'] = {};
      const counts: BackupFile['counts'] = {};
      for (const t of tables) {
        const rows = await tx.unsafe(`select * from ${quoteIdent(t)}`);
        data[t] = rows.map((r) => ({ ...r }));
        counts[t] = rows.length;
      }

      let migrations: BackupFile['migrations'] = { count: 0, lastCreatedAt: null };
      const [{ j }] = await tx<{ j: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations')::text as j`;
      if (j) {
        const [m] = await tx<{ n: number; last: string | null }[]>`select count(*)::int as n, max(created_at)::text as last from drizzle.__drizzle_migrations`;
        migrations = { count: m.n, lastCreatedAt: m.last };
      }

      return {
        format: 'forja-backup' as const,
        version: 1 as const,
        createdAt: new Date().toISOString(),
        database,
        host: parsed.hostname,
        migrations,
        excluded: EXCLUDED_TABLES,
        counts,
        data,
      };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  mkdirSync(dir, { recursive: true });
  const stamp = file.createdAt.replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const path = resolve(dir, `forja-${database}-${stamp}.json.gz`);
  writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(file))));

  // Verificación: se vuelve a leer del disco y se comparan los conteos.
  const back = validateBackupFile(JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')));
  for (const [t, n] of Object.entries(file.counts)) {
    if (back.counts[t] !== n || back.data[t].length !== n) die(`El archivo escrito no coincide con la base en la tabla ${t}. Se conserva en ${path} pero NO es confiable.`);
  }

  const total = Object.values(file.counts).reduce((a, b) => a + b, 0);
  console.log(`✓ Respaldo de "${database}" @ ${file.host}`);
  console.log(`  ${path}`);
  console.log(`  ${Object.keys(file.counts).length} tablas, ${total} filas, ${(statSync(path).size / 1024).toFixed(1)} KB`);
  console.log('  ' + Object.entries(file.counts).filter(([, n]) => n > 0).map(([t, n]) => `${t}:${n}`).join('  '));
  if ((file.counts.persons ?? 0) === 0) console.warn('⚠ La tabla persons está vacía. Si no es una base nueva, revise que apunte a la correcta.');

  if (keepDays > 0) {
    const limit = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    for (const f of readdirSync(dir)) {
      if (!/^forja-.*\.json\.gz$/.test(f)) continue;
      const p = resolve(dir, f);
      if (p !== path && statSync(p).mtimeMs < limit) {
        unlinkSync(p);
        console.log(`  (borrado respaldo con más de ${keepDays} días: ${f})`);
      }
    }
  }
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
