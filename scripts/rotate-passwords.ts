/**
 * Pone una contraseña temporal ALEATORIA a cada cuenta activa y obliga a cambiarla en el próximo ingreso.
 * Sirve para anular de inmediato cualquier contraseña anterior (por ejemplo, una que haya quedado publicada).
 *
 *   tsx scripts/rotate-passwords.ts --out C:/ruta/credenciales-temporales.txt
 *   tsx scripts/rotate-passwords.ts --out C:/ruta/credenciales.txt --emails=ana@empresa.com,luis@empresa.com
 *
 * Las contraseñas NO se imprimen en pantalla: se escriben solo en el archivo de --out. Entregue cada una por un
 * canal privado y BORRE el archivo después. Todo ocurre en una transacción.
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? (args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined);
const emails = args.find((a) => a.startsWith('--emails='))?.split('=')[1]?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  if (!out) die('Indique dónde guardar las contraseñas temporales: --out <archivo>');
  if (!process.env.DATABASE_URL) die('Falta DATABASE_URL');
  const dbName = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
  if (process.env.EXPECT_DB_NAME && process.env.EXPECT_DB_NAME !== dbName) {
    die(`EXPECT_DB_NAME=${process.env.EXPECT_DB_NAME} pero DATABASE_URL apunta a "${dbName}". No se hace nada.`);
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const accounts = await sql<{ id: string; name: string; email: string }[]>`
      select id, name, email from persons where active = true order by email`;
    const targets = emails ? accounts.filter((a) => emails.includes(a.email.toLowerCase())) : accounts;
    if (targets.length === 0) die('No hay cuentas activas que coincidan. No se cambió nada.');
    if (emails) {
      const missing = emails.filter((e) => !targets.some((t) => t.email.toLowerCase() === e));
      if (missing.length) die(`No existen (o no están activas): ${missing.join(', ')}. No se cambió nada.`);
    }

    const lines: string[] = [`Contraseñas temporales de Forja (base "${dbName}") — ${new Date().toISOString()}`, 'Entregue cada una por un canal privado y borre este archivo. Cada persona deberá cambiarla al entrar.', ''];
    await sql.begin(async (tx) => {
      for (const a of targets) {
        const password = randomBytes(12).toString('base64url');
        const hash = await bcrypt.hash(password, 12);
        await tx`update persons set password_hash = ${hash}, must_change_password = true, updated_at = now() where id = ${a.id}`;
        lines.push(`${a.name} <${a.email}>: ${password}`);
      }
    });
    writeFileSync(out, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
    console.log(`✓ ${targets.length} cuenta(s) con contraseña temporal aleatoria; deberán cambiarla al entrar.`);
    console.log(`  Contraseñas escritas en: ${out}`);
    console.log('  ⚠ Entréguelas por un canal privado y borre ese archivo.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
