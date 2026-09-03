import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1 });

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

  for (const stmt of statements) {
    try {
      await client.unsafe(stmt);
      const preview = stmt.slice(0, 60).replace(/\n/g, ' ');
      console.log(`✓ ${preview}...`);
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log(`⊘ Already exists, skipping`);
      } else {
        console.error(`✗ Error: ${err.message}`);
      }
    }
  }

  console.log('\n✅ Custom migrations applied');
  process.exit(0);
}

apply().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
