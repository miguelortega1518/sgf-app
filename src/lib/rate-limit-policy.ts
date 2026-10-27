/** Reglas del límite de intentos de login. Sin acceso a base de datos para poder probarlas solas. */

export const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
export const MAX_FAILURES_PER_IP = 20;
export const MAX_FAILURES_PER_ACCOUNT = 8;

export type RateStatus = { allowed: boolean; retryAfterMs?: number };

/** Decide si una clave sigue permitida, dado su último registro. */
export function evaluateWindow(
  row: { count: number; windowStart: Date } | undefined,
  max: number,
  now: Date,
): RateStatus {
  if (!row) return { allowed: true };
  const elapsed = now.getTime() - row.windowStart.getTime();
  if (elapsed >= WINDOW_MS) return { allowed: true };
  if (row.count >= max) return { allowed: false, retryAfterMs: WINDOW_MS - elapsed };
  return { allowed: true };
}

/** "menos de un minuto", "1 minuto", "9 minutos". */
export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 60) return 'menos de un minuto';
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
