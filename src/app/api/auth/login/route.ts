import { NextRequest } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limit = await checkRateLimit(ip);
    if (!limit.allowed) {
      logger.warn('rate_limit_exceeded', { ip });
      return error('Demasiados intentos. Intente más tarde.', 429);
    }

    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await authenticate(email, password);
    if (!user) {
      logger.warn('auth_failed', { email, ip });
      return error('Credenciales incorrectas', 401);
    }

    await createSession(user);
    logger.info('auth_success', { userId: user.id, email });
    return success({ user });
  } catch (err) {
    return handleError(err);
  }
}
