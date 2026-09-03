import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { persons } from '@/lib/db/schema';
import { requireRole, requireSession, hashPassword } from '@/lib/auth';
import { createUserSchema } from '@/lib/schemas/user';
import { success, error, handleError } from '@/lib/api-utils';

export async function GET() {
  try {
    await requireSession();
    const users = await db.select({
      id: persons.id,
      name: persons.name,
      email: persons.email,
      role: persons.role,
      active: persons.active,
      createdAt: persons.createdAt,
    }).from(persons);
    return success(users);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');

    const body = await req.json();
    const input = createUserSchema.parse(body);

    const passwordHash = await hashPassword(input.password);

    const [user] = await db.insert(persons).values({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash,
    }).returning({
      id: persons.id,
      name: persons.name,
      email: persons.email,
      role: persons.role,
      active: persons.active,
    });

    return success(user, 201);
  } catch (err) {
    return handleError(err);
  }
}
