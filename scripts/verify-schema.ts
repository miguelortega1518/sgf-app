/**
 * Verifica que la base tenga todo lo que el código espera. Solo lee.
 *   npm run db:verify
 */
import postgres from 'postgres';
import * as appSchema from '../src/lib/db/schema';
import { checkSchema, describeDiff, expectedFromModule, isClean, type Query } from '../src/lib/db/schema-check';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ Falta DATABASE_URL');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const query: Query = (text) => sql.unsafe(text) as unknown as Promise<Record<string, unknown>[]>;
    const expected = expectedFromModule(appSchema);
    const diff = await checkSchema(query, expected);
    const nTables = Object.keys(expected.tables).length;
    if (isClean(diff)) {
      console.log(`✓ Esquema correcto (${nTables} tablas, ${Object.keys(expected.enums).length} tipos enumerados).`);
      return;
    }
    console.error('✗ La base no coincide con el código:');
    for (const line of describeDiff(diff)) console.error(`  - ${line}`);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('✗ No se pudo verificar:', err instanceof Error ? err.message : err);
  process.exit(1);
});
