import { db } from './db';
import { rateLimits } from './db/schema';
import { eq } from 'drizzle-orm';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);

  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, ip))
    .limit(1);

  if (!existing) {
    await db.insert(rateLimits).values({ key: ip, count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.windowStart < windowCutoff) {
    await db
      .update(rateLimits)
      .set({ count: 1, windowStart: now })
      .where(eq(rateLimits.key, ip));
    return { allowed: true };
  }

  if (existing.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now.getTime() - existing.windowStart.getTime());
    return { allowed: false, retryAfterMs };
  }

  await db
    .update(rateLimits)
    .set({ count: existing.count + 1 })
    .where(eq(rateLimits.key, ip));

  return { allowed: true };
}
