import { z } from 'zod';
import { newPasswordSchema } from '@/lib/password-policy';

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  email: z.string().trim().toLowerCase().email('Correo electrónico inválido'),
  password: newPasswordSchema,
  role: z.enum(['admin', 'miembro', 'observador']).default('miembro'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(['admin', 'miembro', 'observador']).optional(),
  active: z.boolean().optional(),
  password: newPasswordSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
