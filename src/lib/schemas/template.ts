import { z } from 'zod';

/** Longitud máxima del nombre de una plantilla o de una tarea de plantilla. */
export const TEMPLATE_NAME_MAX = 200;
/** Longitud máxima de los textos libres de una tarea de plantilla. */
export const TEMPLATE_TEXT_MAX = 5000;

/** Tamaño máximo (bytes) del archivo Excel aceptado por POST /api/templates/import-excel. */
export const IMPORT_EXCEL_MAX_BYTES = 5 * 1024 * 1024;
/** Número máximo de hojas del libro que se importa. */
export const IMPORT_EXCEL_MAX_SHEETS = 50;
/** Número máximo de filas de datos, sumando todas las hojas del libro. */
export const IMPORT_EXCEL_MAX_ROWS = 2000;

const NAME_TOO_LONG = `El nombre no puede superar ${TEMPLATE_NAME_MAX} caracteres`;
const textTooLong = (label: string) => `${label} no puede superar ${TEMPLATE_TEXT_MAX} caracteres`;

/** Normaliza un nombre que no pasa por Zod (p. ej. importación de Excel): trim y recorte. */
export function clampTemplateName(value: string): string {
  return value.trim().slice(0, TEMPLATE_NAME_MAX);
}

export const createSpaceTemplateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(TEMPLATE_NAME_MAX, NAME_TOO_LONG),
  periodicity: z.enum(['mensual', 'trimestral', 'anual']),
  targetCycleDays: z.number().int().min(1, 'Mínimo 1 día'),
  autoGenerate: z.boolean().optional().default(false),
});

export const updateSpaceTemplateSchema = z.object({
  name: z.string().min(1).max(TEMPLATE_NAME_MAX, NAME_TOO_LONG).optional(),
  periodicity: z.enum(['mensual', 'trimestral', 'anual']).optional(),
  targetCycleDays: z.number().int().min(1).optional(),
  autoGenerate: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const createTaskTemplateSchema = z.object({
  taskName: z.string().min(1, 'Nombre de tarea requerido').max(TEMPLATE_NAME_MAX, NAME_TOO_LONG),
  companyId: z.string().uuid().nullable().optional(),
  order: z.number().int().min(0),
  businessDayLimit: z.number().int().min(1, 'Mínimo 1 día hábil'),
  defaultResponsibleId: z.string().uuid().nullable().optional(),
  alternateId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  requiresApproval: z.boolean().optional().default(false),
  requiresEvidence: z.boolean().optional().default(false),
  instructions: z.string().max(TEMPLATE_TEXT_MAX, textTooLong('Las instrucciones')).nullable().optional(),
  doneDefinition: z.string().max(TEMPLATE_TEXT_MAX, textTooLong('La definición de hecho')).nullable().optional(),
  applies: z.boolean().optional().default(true),
  notApplicableReason: z.string().max(TEMPLATE_TEXT_MAX, textTooLong('El motivo de no aplica')).nullable().optional(),
});

export const updateTaskTemplateSchema = z.object({
  taskName: z.string().min(1).max(TEMPLATE_NAME_MAX, NAME_TOO_LONG).optional(),
  companyId: z.string().uuid().nullable().optional(),
  order: z.number().int().min(0).optional(),
  businessDayLimit: z.number().int().min(1).optional(),
  defaultResponsibleId: z.string().uuid().nullable().optional(),
  alternateId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  requiresEvidence: z.boolean().optional(),
  instructions: z.string().max(TEMPLATE_TEXT_MAX, textTooLong('Las instrucciones')).nullable().optional(),
  doneDefinition: z.string().max(TEMPLATE_TEXT_MAX, textTooLong('La definición de hecho')).nullable().optional(),
  applies: z.boolean().optional(),
  notApplicableReason: z.string().max(TEMPLATE_TEXT_MAX, textTooLong('El motivo de no aplica')).nullable().optional(),
});

export const generateCycleSchema = z.object({
  spaceTemplateId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato: YYYY-MM'),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  ownerId: z.string().uuid(),
});
