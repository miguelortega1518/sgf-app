/**
 * Restaura un respaldo (.json.gz) en una base que YA tiene el esquema (corra db:migrate antes).
 *   tsx scripts/restore.ts <archivo>                                  solo si las tablas están vacías
 *   tsx scripts/restore.ts <archivo> --wipe --confirm-db=<base>       vacía las tablas antes; hay que escribir el nombre exacto de la base destino
 *   tsx scripts/restore.ts <archivo> --dry-run                        valida archivo y destino sin escribir
 * Todo ocurre en UNA transacción: si algo falla, la base queda exactamente como estaba.
 */
import postgres from 'postgres';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { RAW_TEMPORAL_TYPES, orderSelfReferencing, orderTables, quoteIdent, validateBackupFile } from './lib/backup-format';

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const wipe = args.includes('--wipe');
const dryRun = args.includes('--dry-run');
const confirmDb = args.find((a) => a.startsWith('--confirm-db='))?.split('=')[1];

async function main() {
  if (!path) die('Uso: restore.ts <archivo.json.gz> [--wipe --confirm-db=<base>] [--dry-run]');
  const url = process.env.DATABASE_URL;
  if (!url) die('Falta DATABASE_URL');
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.slice(1));

  const file = validateBackupFile(JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')));
  console.log(`Respaldo: "${file.database}" del ${file.createdAt} (${Object.values(file.counts).reduce((a, b) => a + b, 0)} filas)`);
  console.log(`Destino:  "${dbName}" @ ${parsed.hostname}${dryRun ? '   (ensayo: no se escribe nada)' : ''}`);

  if (wipe && confirmDb !== dbName) {
    die(`--wipe borra los datos actuales de la base destino. Para confirmar, agregue --confirm-db=${dbName}`);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {}, types: RAW_TEMPORAL_TYPES });
  try {
    const tables = Object.keys(file.data);

    // 1) El esquema del destino debe tener todo lo que trae el respaldo.
    const cols = await sql<{ table_name: string; column_name: string }[]>`select table_name, column_name from information_schema.columns where table_schema = 'public'`;
    const have = new Map<string, Set<string>>();
    for (const c of cols) {
      if (!have.has(c.table_name)) have.set(c.table_name, new Set());
      have.get(c.table_name)!.add(c.column_name);
    }
    const problems: string[] = [];
    for (const t of tables) {
      const dest = have.get(t);
      if (!dest) {
        problems.push(`falta la tabla ${t}`);
        continue;
      }
      const sample = file.data[t][0];
      if (sample) for (const c of Object.keys(sample)) if (!dest.has(c)) problems.push(`falta la columna ${t}.${c}`);
    }
    if (problems.length > 0) die(`El destino no tiene el esquema del respaldo (¿corrió db:migrate?): ${problems.join('; ')}`);

    // 2) Sin --wipe, el destino debe estar vacío.
    if (!wipe) {
      const nonEmpty: string[] = [];
      for (const t of tables) {
        const [{ n }] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from ${quoteIdent(t)}`);
        if (n > 0) nonEmpty.push(`${t} (${n})`);
      }
      if (nonEmpty.length > 0) die(`El destino ya tiene datos: ${nonEmpty.join(', ')}. No se toca nada. Use --wipe --confirm-db=${dbName} si quiere reemplazarlos.`);
    }

    // 3) Orden de inserción según las claves foráneas.
    const fkRows = await sql<{ child: string; parent: string; child_col: string; parent_col: string }[]>`
      select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
             a.attname as child_col, af.attname as parent_col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace`;
    const clean = (s: string) => s.replace(/^"|"$/g, '');
    const fks = fkRows.map((r) => ({ child: clean(r.child), parent: clean(r.parent), childCol: r.child_col, parentCol: r.parent_col }));
    const order = orderTables(tables, fks);

    if (dryRun) {
      console.log(`✓ Ensayo correcto. Orden de inserción: ${order.join(' → ')}`);
      return;
    }

    // 4) Todo en una transacción.
    await sql.begin(async (tx) => {
      if (wipe) {
        await tx.unsafe(`truncate ${order.map(quoteIdent).join(', ')} restart identity cascade`);
        console.log('  (tablas vaciadas dentro de la transacción)');
      }

      for (const t of order) {
        let rows = file.data[t];
        if (rows.length === 0) continue;
        const selfFk = fks.find((f) => f.child === t && f.parent === t);
        if (selfFk) rows = orderSelfReferencing(rows, selfFk.parentCol, selfFk.childCol);

        const columnCount = Object.keys(rows[0]).length;
        const chunk = Math.max(1, Math.min(500, Math.floor(60000 / columnCount)));
        for (let i = 0; i < rows.length; i += chunk) {
          await tx`insert into ${tx(t)} ${tx(rows.slice(i, i + chunk) as Record<string, never>[])}`;
        }
        console.log(`  ✓ ${t}: ${rows.length}`);
      }

      // Las secuencias (por ejemplo tasks.number) deben seguir después del último valor restaurado.
      const seqs = await tx<{ table_name: string; column_name: string; seq: string }[]>`
        select c.table_name, c.column_name, pg_get_serial_sequence(format('%I', c.table_name), c.column_name) as seq
        from information_schema.columns c
        where c.table_schema = 'public' and c.column_default like 'nextval(%'`;
      for (const s of seqs) {
        if (!s.seq || !file.data[s.table_name]) continue;
        await tx.unsafe(`select setval('${s.seq}', coalesce((select max(${quoteIdent(s.column_name)}) from ${quoteIdent(s.table_name)}), 1), (select max(${quoteIdent(s.column_name)}) is not null from ${quoteIdent(s.table_name)}))`);
      }

      // Verificación: si no coincide, la transacción se revierte.
      for (const t of tables) {
        const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from ${quoteIdent(t)}`);
        if (n !== file.counts[t]) throw new Error(`Tras restaurar, ${t} tiene ${n} filas y el respaldo ${file.counts[t]}. Se revierte todo.`);
      }
    });

    console.log('✓ Restauración completa y verificada (conteos iguales a los del respaldo).');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('✗ La restauración falló y no se aplicó nada:', err instanceof Error ? err.message : err);
  if (err && typeof err === 'object' && 'cause' in err) console.error('  Causa:', (err as { cause?: { message?: string } }).cause?.message);
  process.exit(1);
});
