/**
 * Restablece la contraseña de una cuenta de administrador a una temporal ALEATORIA y obliga a cambiarla
 * en el próximo ingreso. Imprime la contraseña una sola vez; no se guarda en ningún archivo.
 *   tsx scripts/reset-admin.ts                       (primer administrador)
 *   tsx scripts/reset-admin.ts correo@empresa.com    (un administrador concreto)
 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const email = process.argv[2];

async function reset() {
  const password = randomBytes(12).toString('base64url');
  const hash = await bcrypt.hash(password, 12);

  const rows = email
    ? await client`
        UPDATE persons SET password_hash = ${hash}, must_change_password = true, updated_at = now()
        WHERE email = ${email} AND role = 'admin' AND active = true
        RETURNING email`
    : await client`
        UPDATE persons SET password_hash = ${hash}, must_change_password = true, updated_at = now()
        WHERE id = (SELECT id FROM persons WHERE role = 'admin' AND active = true ORDER BY created_at LIMIT 1)
        RETURNING email`;

  if (rows.length === 0) {
    console.error('No se encontró un administrador activo' + (email ? ` con el correo ${email}` : '') + '. No se cambió nada.');
    process.exit(1);
  }

  console.log(`Cuenta restablecida: ${rows[0].email}`);
  console.log(`Contraseña temporal (se muestra una sola vez): ${password}`);
  console.log('Deberá cambiarla en el próximo ingreso.');
  await client.end();
}

reset().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
