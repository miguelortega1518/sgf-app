import { createHash, timingSafeEqual } from 'crypto';

const BEARER_RE = /^Bearer (\S+)$/;

/**
 * Comprueba la cabecera `Authorization: Bearer <CRON_SECRET>` de los endpoints
 * de cron. Compara los SHA-256 de token y secreto con timingSafeEqual, así que
 * los buffers siempre miden lo mismo y no se filtra la longitud. Ante cualquier
 * entrada inválida (secreto vacío, cabecera ausente o mal formada) devuelve
 * false; nunca lanza.
 */
export function verifyCronAuthorization(secret: string | undefined, header: string | null): boolean {
  try {
    if (typeof secret !== 'string' || secret === '') return false;
    if (typeof header !== 'string') return false;
    const match = BEARER_RE.exec(header);
    if (!match) return false;
    const received = createHash('sha256').update(match[1]).digest();
    const expected = createHash('sha256').update(secret).digest();
    return timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}
