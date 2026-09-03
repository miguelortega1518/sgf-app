const attempts = new Map<string, number[]>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const timestamps = attempts.get(ip) ?? [];

  const recent = timestamps.filter(t => now - t < WINDOW_MS);

  if (recent.length >= MAX_ATTEMPTS) {
    const oldest = recent[0];
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }

  recent.push(now);
  attempts.set(ip, recent);

  if (attempts.size > 10_000) {
    const cutoff = now - WINDOW_MS;
    for (const [key, ts] of attempts) {
      if (ts.every(t => t < cutoff)) attempts.delete(key);
    }
  }

  return { allowed: true };
}
