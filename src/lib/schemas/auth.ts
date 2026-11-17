import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Preferencias de correo de la propia persona. Sin ids: la ruta sólo actualiza la fila de la sesión. */
export const updateEmailPreferencesSchema = z
  .strictObject(
    {
      emailImmediate: z.boolean({ error: 'Los avisos inmediatos deben ser verdadero o falso' }).optional(),
      emailDigest: z.boolean({ error: 'El resumen diario debe ser verdadero o falso' }).optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? 'Sólo se admiten las preferencias emailImmediate y emailDigest'
          : 'El cuerpo debe ser un objeto con las preferencias de correo',
    },
  )
  .refine(v => v.emailImmediate !== undefined || v.emailDigest !== undefined, {
    error: 'Indica al menos una preferencia',
  });

export type UpdateEmailPreferencesInput = z.infer<typeof updateEmailPreferencesSchema>;
