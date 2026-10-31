import { z } from 'zod';
import { isValidIsoDate } from '../validation';

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  type: z.enum(['recurrente', 'proyecto', 'continuo']),
  objective: z.string().max(2000).optional(),
  targetDate: z.string().refine(isValidIsoDate, 'Fecha inválida').optional(),
  leaderId: z.string().uuid().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

export const updateSpaceSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  objective: z.string().max(2000).nullable().optional(),
  targetDate: z.string().refine(isValidIsoDate, 'Fecha inválida').nullable().optional(),
  leaderId: z.string().uuid().nullable().optional(),
  status: z.enum(['borrador', 'activo', 'cerrado']).optional(),
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
