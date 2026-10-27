import { eq, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { rateLimits } from './db/schema';
import { evaluateWindow, WINDOW_MS, type RateStatus } from './rate-limit-policy';

export { formatWait, MAX_FAILURES_PER_IP, MAX_FAILURES_PER_ACCOUNT, type RateStatus } from './rate-limit-policy';

/** Solo consulta: no cuenta como intento. */
export async function checkRateLimit(key: string, max: number): Promise<RateStatus> {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  return evaluateWindow(row, max, new Date());
}

/** Cuenta un intento fallido (reinicia la ventana si la anterior ya venció). */
export async function recordFailure(key: string): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < ${cutoff.toISOString()}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < ${cutoff.toISOString()}::timestamptz then ${now.toISOString()}::timestamptz else ${rateLimits.windowStart} end`,
      },
    });

  // Limpieza ocasional de claves viejas para que la tabla no crezca sin fin.
  if (Math.random() < 0.02) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  }
}

export async function clearFailures(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
