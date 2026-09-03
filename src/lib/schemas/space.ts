import { z } from 'zod';

export const createSpaceSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  type: z.enum(['recurrente', 'proyecto', 'continuo']),
  objective: z.string().max(2000).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});

export const updateSpaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  objective: z.string().max(2000).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['borrador', 'activo', 'cerrado']).optional(),
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
