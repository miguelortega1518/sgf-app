import { NextRequest } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      const retryAfter = Math.ceil((limit.retryAfterMs ?? 60_000) / 1000);
      return error('Demasiados intentos. Intente más tarde.', 429);
    }

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
