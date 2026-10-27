import { randomUUID } from 'node:crypto';

/**
 * Clasificación de errores del servidor. Drizzle envuelve los fallos de Postgres en un mensaje genérico
 * ("Failed query: ...") y deja la causa real en `err.cause`; sin recorrerla, un fallo de conexión o de
 * esquema se ve igual que cualquier otro "Error interno".
 */

export type ErrorKind = 'db_unavailable' | 'schema_mismatch' | 'unknown';

export type ClassifiedError = {
  kind: ErrorKind;
  /** Código de la causa que decidió la clasificación (p. ej. ECONNREFUSED, 42703). */
  code?: string;
  /** Mensaje de la causa raíz, sin parámetros de consulta y recortado. */
  detail: string;
};

type Link = { code?: string; message: string };

const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN',
  'CONNECT_TIMEOUT', 'CONNECTION_CLOSED', 'CONNECTION_ENDED', 'CONNECTION_DESTROYED',
  '57P01', '57P02', '57P03', // apagado / reinicio del servidor
  '08000', '08001', '08003', '08004', '08006', // fallos de conexión
  '28000', '28P01', // autenticación
  '3D000', // la base no existe
  '53300', // demasiadas conexiones
]);

// 42P01 = tabla inexistente, 42703 = columna inexistente: el código espera un esquema que la base no tiene.
const SCHEMA_MISMATCH_CODES = new Set(['42P01', '42703']);

function chain(err: unknown): Link[] {
  const links: Link[] = [];
  let current: unknown = err;
  for (let depth = 0; current && depth < 6; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    links.push({
      code: typeof e.code === 'string' ? e.code : undefined,
      message: typeof e.message === 'string' ? e.message : String(current),
    });
    // AggregateError (Node al probar varias direcciones): se mira el primer error interno.
    if (Array.isArray(e.errors) && e.errors.length > 0) {
      const inner = e.errors[0] as { code?: unknown; message?: unknown };
      links.push({
        code: typeof inner.code === 'string' ? inner.code : undefined,
        message: typeof inner.message === 'string' ? inner.message : String(e.errors[0]),
      });
    }
    current = e.cause;
  }
  return links;
}

/** Quita los parámetros de la consulta (pueden traer correos o hashes) y recorta. */
export function redact(message: string): string {
  return message.split(/\bparams:/i)[0].replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function classifyError(err: unknown): ClassifiedError {
  const links = chain(err);
  const root = links[links.length - 1];
  let kind: ErrorKind = 'unknown';
  let code = root?.code;

  for (const link of links) {
    if (link.code && SCHEMA_MISMATCH_CODES.has(link.code)) { kind = 'schema_mismatch'; code = link.code; break; }
    if (link.code === '22P02' && /enum/i.test(link.message)) { kind = 'schema_mismatch'; code = link.code; break; }
    if (link.code && DB_UNAVAILABLE_CODES.has(link.code)) { kind = 'db_unavailable'; code = link.code; break; }
  }
  if (kind === 'unknown' && links.some((l) => /getaddrinfo|ECONNREFUSED|password authentication failed|Connection terminated/i.test(l.message))) {
    kind = 'db_unavailable';
  }

  return { kind, code, detail: redact(root?.message ?? '') };
}

/** Referencia corta que se muestra al usuario y se escribe en el registro para poder cruzarlos. */
export function newErrorId(): string {
  return randomUUID().slice(0, 8);
}
