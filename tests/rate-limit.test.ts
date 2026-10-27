import { describe, it, expect } from 'vitest';
import { evaluateWindow, formatWait, WINDOW_MS } from '../src/lib/rate-limit-policy';

const now = new Date('2026-10-27T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('evaluateWindow', () => {
  it('permite si nunca hubo intentos fallidos', () => {
    expect(evaluateWindow(undefined, 8, now)).toEqual({ allowed: true });
  });

  it('permite mientras no se alcance el máximo', () => {
    expect(evaluateWindow({ count: 7, windowStart: ago(60_000) }, 8, now).allowed).toBe(true);
  });

  it('bloquea al llegar al máximo y dice cuánto falta', () => {
    const s = evaluateWindow({ count: 8, windowStart: ago(5 * 60_000) }, 8, now);
    expect(s.allowed).toBe(false);
    expect(s.retryAfterMs).toBe(WINDOW_MS - 5 * 60_000);
  });

  it('vuelve a permitir cuando la ventana ya venció, aunque el contador siga alto', () => {
    expect(evaluateWindow({ count: 50, windowStart: ago(WINDOW_MS) }, 8, now).allowed).toBe(true);
  });
});

describe('formatWait', () => {
  it.each([
    [1_000, 'menos de un minuto'],
    [60_000, 'menos de un minuto'],
    [61_000, '2 minutos'],
    [5 * 60_000, '5 minutos'],
    [WINDOW_MS, '15 minutos'],
  ])('%i ms -> %s', (ms, text) => {
    expect(formatWait(ms)).toBe(text);
  });
});
