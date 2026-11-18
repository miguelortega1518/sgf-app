// Límites de trabajo en curso (WIP) por proyecto: spaces.wip_limits.
// Sólo avisan en el tablero; nunca bloquean mover tareas.

import { STATUS_LABEL } from '@/lib/labels';
import { WIP_LIMIT_MAX, WIP_LIMIT_MIN } from '@/lib/schemas/wip-limits';

export const WIP_LIMITED_STATUSES = ['en_proceso', 'en_revision'] as const;
export type WipLimitedStatus = (typeof WIP_LIMITED_STATUSES)[number];

export type WipLimits = Record<WipLimitedStatus, number | null>;

export type WipLimitState = 'none' | 'under' | 'at' | 'over';

function validLimit(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= WIP_LIMIT_MIN && v <= WIP_LIMIT_MAX ? v : null;
}

/**
 * Lectura tolerante del jsonb guardado: cualquier valor ausente o inválido se
 * trata como «sin límite» (null). Nunca lanza.
 */
export function parseWipLimits(raw: unknown): WipLimits {
  const obj = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    en_proceso: validLimit(obj.en_proceso),
    en_revision: validLimit(obj.en_revision),
  };
}

/** Estado de una columna respecto a su límite. */
export function wipLimitState(count: number, limit: number | null): WipLimitState {
  if (limit === null) return 'none';
  if (count < limit) return 'under';
  if (count === limit) return 'at';
  return 'over';
}

/** Texto legible para audit_log: 'Portal · En progreso: 4' o '… : sin límite'. */
export function wipLimitAuditValue(spaceName: string, status: WipLimitedStatus, limit: number | null): string {
  return `${spaceName} · ${STATUS_LABEL[status]}: ${limit === null ? 'sin límite' : limit}`;
}
