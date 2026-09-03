import { z } from 'zod';

export const createTaskSchema = z.object({
  spaceId: z.string().uuid(),
  title: z.string().min(1, 'El título es requerido').max(500),
  description: z.string().max(5000).optional(),
  responsibleId: z.string().uuid('Responsable requerido'),
  reviewerId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['critica', 'alta', 'normal', 'baja']).default('normal'),
  requiresApproval: z.boolean().default(false),
  requiresEvidence: z.boolean().default(false),
  doneDefinition: z.string().max(2000).optional(),
  instructions: z.string().max(10000).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(['no_iniciada', 'en_proceso', 'en_revision', 'completada', 'bloqueada']),
  delayReason: z.enum([
    'falta_informacion_terceros',
    'documento_no_recibido_otra_area',
    'error_sistema',
    'capacidad_insuficiente',
    'dependencia_atrasada',
    'repriorizacion',
    'otro',
  ]).optional(),
  delayReasonText: z.string().max(500).optional(),
  blockedByArea: z.enum([
    'compras', 'operaciones', 'tesoreria',
    'contabilidad', 'administracion', 'presupuesto', 'otro',
  ]).optional(),
  blockedByAreaText: z.string().max(500).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  responsibleId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['critica', 'alta', 'normal', 'baja']).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
