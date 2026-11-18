import { z } from 'zod';
import { isValidIsoDate } from '../validation';
import { SPRINT_GOAL_MAX, SPRINT_NAME_MAX } from '../sprints';

export const SPRINT_DATES_MESSAGE = 'La fecha de fin no puede ser anterior a la de inicio';

const name = z.string().trim()
  .min(1, 'El nombre del sprint es requerido')
  .max(SPRINT_NAME_MAX, `El nombre del sprint no puede superar ${SPRINT_NAME_MAX} caracteres`);
const goal = z.string()
  .max(SPRINT_GOAL_MAX, `El objetivo del sprint no puede superar ${SPRINT_GOAL_MAX} caracteres`)
  .nullable();
const isoDate = z.string().refine(isValidIsoDate, 'Fecha inválida');

// El estado no se acepta: todo sprint nace 'planificado'.
export const createSprintSchema = z.object({
  name,
  goal: goal.optional(),
  startDate: isoDate,
  endDate: isoDate,
}).refine(v => v.endDate >= v.startDate, { message: SPRINT_DATES_MESSAGE, path: ['endDate'] });

export const updateSprintSchema = z.object({
  name: name.optional(),
  goal: goal.optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  status: z.enum(['activo', 'cerrado']).optional(),
}).refine(v => Object.values(v).some(x => x !== undefined), {
  message: 'Debe proporcionar al menos un campo para actualizar',
});

export type CreateSprintInput = z.infer<typeof createSprintSchema>;
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;
