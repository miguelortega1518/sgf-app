import { z } from 'zod';

/** Cuerpo de PATCH /api/settings/team (DECISIONES §22). */
export const teamSettingsSchema = z
  .object({
    showPersonMetrics: z.boolean({ error: 'showPersonMetrics debe ser verdadero o falso' }),
  })
  .strict();

export type TeamSettingsInput = z.infer<typeof teamSettingsSchema>;
