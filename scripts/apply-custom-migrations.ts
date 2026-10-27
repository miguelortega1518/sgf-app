import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1, onnotice: () => {} });

function splitStatements(sql: string): string[] {
  const results: string[] = [];
  let current = '';
  let inDollarQuote = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inDollarQuote) continue;
    if (trimmed.length === 0 && !inDollarQuote) continue;

    current += line + '\n';

    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      for (const _ of dollarMatches) {
        inDollarQuote = !inDollarQuote;
      }
    }

    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 0) results.push(stmt);
      current = '';
    }
  }

  if (current.trim().length > 0) results.push(current.trim());
  return results;
}

async function apply() {
  const sqlPath = resolve(__dirname, '../src/lib/db/custom-migrations.sql');
  const sqlContent = readFileSync(sqlPath, 'utf-8');

  const statements = splitStatements(sqlContent);
  const failures: string[] = [];

  for (const stmt of statements) {
    const preview = stmt.slice(0, 60).replace(/\n/g, ' ');
    try {
      await client.unsafe(stmt);
      console.log(`✓ ${preview}...`);
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log(`⊘ Already exists, skipping`);
      } else {
        // Antes este error solo se imprimía y el deploy seguía como si nada. Ahora detiene el deploy.
        console.error(`✗ Error: ${err.message}\n    en: ${preview}`);
        failures.push(preview);
      }
    }
  }

  await client.end({ timeout: 5 });

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} sentencia(s) fallaron. Los triggers y funciones personalizados pueden estar incompletos.`);
    process.exit(1);
  }
  console.log('\n✅ Custom migrations applied');
}

apply().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
