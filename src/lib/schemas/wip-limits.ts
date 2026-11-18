import { z } from 'zod';

export const WIP_LIMIT_MIN = 1;
export const WIP_LIMIT_MAX = 99;
export const WIP_LIMIT_MESSAGE = `El límite debe ser un número entero entre ${WIP_LIMIT_MIN} y ${WIP_LIMIT_MAX}`;

const limit = z
  .number({ error: WIP_LIMIT_MESSAGE })
  .int(WIP_LIMIT_MESSAGE)
  .min(WIP_LIMIT_MIN, WIP_LIMIT_MESSAGE)
  .max(WIP_LIMIT_MAX, WIP_LIMIT_MESSAGE)
  .nullable();

/** Cuerpo de PUT /api/spaces/[id]/wip-limits: las dos claves, obligatorias; null = sin límite. */
export const wipLimitsSchema = z.strictObject({
  en_proceso: limit,
  en_revision: limit,
});

export type WipLimitsInput = z.infer<typeof wipLimitsSchema>;
