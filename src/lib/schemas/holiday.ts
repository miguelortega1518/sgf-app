import { z } from 'zod';
import { isValidIsoDate } from '../validation';

/** Fecha ISO (YYYY-MM-DD) calendárica real: rechaza '2026-02-30' o '2026-13-01'. */
const holidayDate = z.string({ error: 'Fecha inválida' }).refine(isValidIsoDate, 'Fecha inválida');

export const createHolidaySchema = z.object({
  date: holidayDate,
  description: z
    .string({ error: 'La descripción es requerida' })
    .trim()
    .min(1, 'La descripción es requerida')
    .max(200, 'La descripción no puede superar 200 caracteres'),
});

export const deleteHolidaySchema = z.object({
  date: holidayDate,
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type DeleteHolidayInput = z.infer<typeof deleteHolidaySchema>;
