import { z } from 'zod';

export const TASK_KINDS = ['feature', 'bug', 'mejora', 'deuda', 'chore'] as const;
const taskKind = z.enum(TASK_KINDS);
// Puntos de historia: serie de Fibonacci acotada, como en la mayoría de equipos.
const estimate = z.number().int().min(0).max(100).nullable();
const branch = z.string().trim().max(200).regex(/^[\w./#@-]*$/, 'Rama inválida').nullable().transform(v => v || null);
const prUrl = z.string().trim().max(500).url('Enlace inválido').refine(u => /^https?:\/\//.test(u), 'Debe empezar por http(s)').or(z.literal('')).nullable().transform(v => v || null);
const labels = z.array(z.string().trim().min(1).max(30)).max(8);

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
  kind: taskKind.default('feature'),
  estimate: estimate.optional(),
  branch: branch.optional(),
  prUrl: prUrl.optional(),
  labels: labels.optional(),
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
    'infraestructura', 'diseno', 'producto', 'qa', 'seguridad', 'terceros',
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
  kind: taskKind.optional(),
  estimate: estimate.optional(),
  branch: branch.optional(),
  prUrl: prUrl.optional(),
  labels: labels.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
