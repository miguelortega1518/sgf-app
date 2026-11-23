import { z } from 'zod';
import { SPRINT_CAPACITY_MAX } from '../sprint-capacity';

export const SPRINT_CAPACITY_MIN = 0;
export const SPRINT_CAPACITY_MESSAGE =
  `La capacidad debe ser un número entero entre ${SPRINT_CAPACITY_MIN} y ${SPRINT_CAPACITY_MAX}`;

/** Cuerpo de PUT /api/sprints/[id]/capacity. points null = volver a la capacidad por defecto. */
export const sprintCapacitySchema = z.object({
  personId: z.string({ error: 'La persona es requerida' }).uuid('Persona inválida'),
  points: z
    .number({ error: SPRINT_CAPACITY_MESSAGE })
    .int(SPRINT_CAPACITY_MESSAGE)
    .min(SPRINT_CAPACITY_MIN, SPRINT_CAPACITY_MESSAGE)
    .max(SPRINT_CAPACITY_MAX, SPRINT_CAPACITY_MESSAGE)
    .nullable(),
});

export type SprintCapacityInput = z.infer<typeof sprintCapacitySchema>;
