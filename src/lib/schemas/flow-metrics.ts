import { z } from 'zod';

export const FLOW_DAYS_MIN = 7;
export const FLOW_DAYS_MAX = 90;
export const FLOW_DAYS_DEFAULT = 30;
export const FLOW_DAYS_MESSAGE = `El parámetro days debe ser un número entero entre ${FLOW_DAYS_MIN} y ${FLOW_DAYS_MAX}`;

/**
 * Query de GET /api/metrics/flow. Pasa `searchParams.get(x) ?? undefined`: el
 * default sólo actúa si falta el parámetro (z.coerce convierte '' en 0).
 */
export const flowMetricsQuerySchema = z.object({
  days: z.coerce
    .number({ error: FLOW_DAYS_MESSAGE })
    .int(FLOW_DAYS_MESSAGE)
    .min(FLOW_DAYS_MIN, FLOW_DAYS_MESSAGE)
    .max(FLOW_DAYS_MAX, FLOW_DAYS_MESSAGE)
    .default(FLOW_DAYS_DEFAULT),
  spaceId: z.string().uuid('ID de proyecto con formato inválido').optional(),
});
