import { z } from 'zod';

// Sólo se validan los campos que usa el webhook; el resto del payload de GitHub se ignora.

const MAX_TEXT = 65536;

export const pullRequestEventSchema = z.object({
  action: z.string('Falta la acción del evento').max(100, 'La acción del evento no puede superar 100 caracteres'),
  pull_request: z.object({
    html_url: z.string('Falta la URL del PR')
      .max(500, 'La URL del PR no puede superar 500 caracteres')
      .url('La URL del PR no es válida')
      .refine(u => u.startsWith('https://'), 'La URL del PR debe empezar por https://'),
    number: z.number('Falta el número del PR')
      .int('El número del PR debe ser un entero')
      .positive('El número del PR debe ser positivo')
      .max(1_000_000_000, 'El número del PR es demasiado grande'),
    title: z.string('Falta el título del PR').max(1000, 'El título del PR no puede superar 1000 caracteres'),
    body: z.string().max(MAX_TEXT, 'La descripción del PR no puede superar 65536 caracteres').nullable().optional(),
    draft: z.boolean('Falta el indicador de borrador del PR'),
    merged: z.boolean().nullable().optional(),
    head: z.object({
      ref: z.string('Falta la rama del PR').max(255, 'La rama del PR no puede superar 255 caracteres'),
    }, 'Falta la rama del PR'),
  }, 'Faltan los datos del PR'),
});

export const pushEventSchema = z.object({
  ref: z.string('Falta la referencia del push').max(255, 'La referencia del push no puede superar 255 caracteres'),
  repository: z.object({
    default_branch: z.string('Falta la rama por defecto del repositorio')
      .max(255, 'La rama por defecto del repositorio no puede superar 255 caracteres'),
  }, 'Faltan los datos del repositorio'),
  commits: z.array(
    z.object({
      message: z.string('Falta el mensaje del commit').max(MAX_TEXT, 'El mensaje del commit no puede superar 65536 caracteres'),
    }),
    'Los commits deben ser una lista',
  ).max(2048, 'El push no puede tener más de 2048 commits').default([]),
});

export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;
export type PushEvent = z.infer<typeof pushEventSchema>;
