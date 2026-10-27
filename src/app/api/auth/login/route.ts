import { NextRequest, NextResponse } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/schemas/auth';
import { success, error, handleError } from '@/lib/api-utils';
import {
  checkRateLimit,
  recordFailure,
  clearFailures,
  formatWait,
  MAX_FAILURES_PER_IP,
  MAX_FAILURES_PER_ACCOUNT,
} from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const body = await req.json().catch(() => null);
    const { email, password } = loginSchema.parse(body);

    // Solo cuentan los intentos fallidos: una persona que acierta no gasta cupo, y quien se equivoca
    // bloquea su propia cuenta (no a todo el que comparte su red).
    const ipKey = `ip:${ip}`;
    const accountKey = `acct:${email.trim().toLowerCase()}`;
    const [byIp, byAccount] = await Promise.all([
      checkRateLimit(ipKey, MAX_FAILURES_PER_IP),
      checkRateLimit(accountKey, MAX_FAILURES_PER_ACCOUNT),
    ]);
    if (!byIp.allowed || !byAccount.allowed) {
      const retryAfterMs = Math.max(byIp.retryAfterMs ?? 0, byAccount.retryAfterMs ?? 0);
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      logger.warn('rate_limit_exceeded', { ip, scope: !byAccount.allowed ? 'account' : 'ip' });
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Vuelva a intentarlo en ${formatWait(retryAfterMs)}.`, retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const user = await authenticate(email, password);
    if (!user) {
      await Promise.all([recordFailure(ipKey), recordFailure(accountKey)]);
      logger.warn('auth_failed', { email, ip });
      return error('Credenciales incorrectas', 401);
    }

    await clearFailures(accountKey);
    const { mustChangePassword, ...sessionUser } = user;
    await createSession(sessionUser);
    logger.info('auth_success', { userId: user.id, email });
    return success({ user: { ...sessionUser, mustChangePassword }, mustChangePassword });
  } catch (err) {
    return handleError(err);
  }
}
