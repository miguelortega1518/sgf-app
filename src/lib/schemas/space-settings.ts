import { z } from 'zod';

export const BUSINESS_DAYS_MESSAGE = 'Indique si se cuentan sólo los días hábiles';

/** Cuerpo de PUT /api/spaces/[id]/business-days. */
export const businessDaysSchema = z.object({
  businessDaysOnly: z.boolean({ error: BUSINESS_DAYS_MESSAGE }),
});

export type BusinessDaysInput = z.infer<typeof businessDaysSchema>;
