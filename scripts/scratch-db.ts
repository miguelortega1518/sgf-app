/**
 * Crea o borra bases de datos de ensayo en la misma instancia. Solo acepta nombres que empiecen por
 * "sgf_scratch", así que no puede tocar ni la base de producción ni la de desarrollo.
 *   tsx scripts/scratch-db.ts create sgf_scratch_ensayo
 *   tsx scripts/scratch-db.ts drop   sgf_scratch_ensayo
 * Necesita un usuario con permiso para crear bases: ADMIN_DATABASE_URL (si no existe, usa DATABASE_URL).
 * La base nueva queda a nombre del usuario de DATABASE_URL.
 */
import postgres from 'postgres';

const [action, name] = process.argv.slice(2);

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!['create', 'drop'].includes(action ?? '')) die('Uso: scratch-db.ts create|drop <nombre>');
if (!/^sgf_scratch[a-z0-9_]*$/.test(name ?? '')) die('El nombre debe empezar por "sgf_scratch" y usar solo minúsculas, números o _');
if (!process.env.DATABASE_URL) die('Falta DATABASE_URL');

const admin = new URL(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
admin.pathname = '/postgres';
const appUser = decodeURIComponent(new URL(process.env.DATABASE_URL).username);

async function main() {
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    if (action === 'create') {
      await sql.unsafe(`create database "${name}"`);
      // La base nueva nace a nombre del administrador; se le da todo al usuario de la app para que pueda migrar.
      await sql.unsafe(`grant all privileges on database "${name}" to "${appUser}"`);
      const inner = new URL(admin.toString());
      inner.pathname = `/${name}`;
      const db = postgres(inner.toString(), { max: 1, onnotice: () => {} });
      try {
        await db.unsafe(`grant all on schema public to "${appUser}"`);
      } finally {
        await db.end({ timeout: 5 });
      }
      console.log(`✓ Base ${name} creada y entregada a ${appUser}`);
    } else {
      await sql.unsafe(`drop database if exists "${name}" with (force)`);
      console.log(`✓ Base ${name} eliminada`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
