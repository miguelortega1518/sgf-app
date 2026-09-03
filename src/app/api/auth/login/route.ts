import { NextRequest } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas/auth';
import { success, error, handleError } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await authenticate(email, password);
    if (!user) {
      return error('Credenciales incorrectas', 401);
    }

    await createSession(user);
    return success({ user });
  } catch (err) {
    return handleError(err);
  }
}
