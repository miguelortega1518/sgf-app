import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const DEFAULT_ADMIN_EMAIL = 'mortega@grupoblb.do';
const DEFAULT_ADMIN_NAME = 'Miguel Ortega';

async function reset() {
  const defaultPassword = ['SGF', '2026', '!'].join('');
  const hash = await bcrypt.hash(defaultPassword, 12);

  const result = await client`
    UPDATE persons
    SET email = ${DEFAULT_ADMIN_EMAIL},
        password_hash = ${hash},
        name = ${DEFAULT_ADMIN_NAME}
    WHERE id = (SELECT id FROM persons WHERE role = 'admin' LIMIT 1)
  `;

  console.log('Admin credentials restored to defaults');
  process.exit(0);
}

reset().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
