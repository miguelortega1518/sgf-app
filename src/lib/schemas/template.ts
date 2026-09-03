import { z } from 'zod';

export const createSpaceTemplateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  periodicity: z.enum(['mensual', 'trimestral', 'anual']),
  targetCycleDays: z.number().int().min(1, 'Mínimo 1 día'),
  autoGenerate: z.boolean().optional().default(false),
});

export const updateSpaceTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  periodicity: z.enum(['mensual', 'trimestral', 'anual']).optional(),
  targetCycleDays: z.number().int().min(1).optional(),
  autoGenerate: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const createTaskTemplateSchema = z.object({
  taskName: z.string().min(1, 'Nombre de tarea requerido'),
  companyId: z.string().uuid().nullable().optional(),
  order: z.number().int().min(0),
  businessDayLimit: z.number().int().min(1, 'Mínimo 1 día hábil'),
  defaultResponsibleId: z.string().uuid().nullable().optional(),
  alternateId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  requiresApproval: z.boolean().optional().default(false),
  requiresEvidence: z.boolean().optional().default(false),
  instructions: z.string().nullable().optional(),
  doneDefinition: z.string().nullable().optional(),
  applies: z.boolean().optional().default(true),
  notApplicableReason: z.string().nullable().optional(),
});

export const updateTaskTemplateSchema = z.object({
  taskName: z.string().min(1).optional(),
  companyId: z.string().uuid().nullable().optional(),
  order: z.number().int().min(0).optional(),
  businessDayLimit: z.number().int().min(1).optional(),
  defaultResponsibleId: z.string().uuid().nullable().optional(),
  alternateId: z.string().uuid().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  requiresApproval: z.boolean().optional(),
  requiresEvidence: z.boolean().optional(),
  instructions: z.string().nullable().optional(),
  doneDefinition: z.string().nullable().optional(),
  applies: z.boolean().optional(),
  notApplicableReason: z.string().nullable().optional(),
});

export const generateCycleSchema = z.object({
  spaceTemplateId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato: YYYY-MM'),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD'),
  ownerId: z.string().uuid(),
});
