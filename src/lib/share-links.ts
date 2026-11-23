import { createHash, randomBytes } from 'crypto';

/**
 * Enlaces públicos de sólo lectura de un proyecto (/compartido/<token>).
 * En la BD sólo se guarda el SHA-256 del token: el token en claro se devuelve una
 * única vez al crearlo y nunca se registra en auditoría ni en logs. La búsqueda es
 * por hash exacto en la BD, así que no hace falta comparar en tiempo constante.
 */

const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** SHA-256 en hex (64 caracteres) del token. */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token aleatorio de 32 bytes en base64url (43 caracteres) y su hash. */
export function generateShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashShareToken(token) };
}

/** true si el texto tiene la forma de un token (43 caracteres base64url). */
export function isWellFormedShareToken(token: string): boolean {
  return typeof token === 'string' && SHARE_TOKEN_RE.test(token);
}

/** Ruta pública del enlace. */
export function shareLinkPath(token: string): string {
  return `/compartido/${token}`;
}
