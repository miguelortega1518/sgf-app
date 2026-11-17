import { z } from 'zod';
import { isValidIsoDate } from '../validation';

export const TASK_KINDS = ['feature', 'bug', 'mejora', 'deuda', 'chore'] as const;
export const TASK_PRIORITIES = ['critica', 'alta', 'normal', 'baja'] as const;

// Límites por campo, compartidos con el importador CSV (src/lib/schemas/task-import.ts).
export const TASK_TITLE_MAX = 500;
export const TASK_DESCRIPTION_MAX = 5000;
export const TASK_ESTIMATE_MIN = 0;
export const TASK_ESTIMATE_MAX = 100;
export const TASK_LABELS_MAX = 8;
export const TASK_LABEL_MAX = 30;

const taskKind = z.enum(TASK_KINDS);
// Puntos de historia: serie de Fibonacci acotada, como en la mayoría de equipos.
const estimate = z.number().int().min(TASK_ESTIMATE_MIN).max(TASK_ESTIMATE_MAX).nullable();
const branch = z.string().trim().max(200).regex(/^[\w./#@-]*$/, 'Rama inválida').nullable().transform(v => v || null);
const prUrl = z.string().trim().max(500).url('Enlace inválido').refine(u => /^https?:\/\//.test(u), 'Debe empezar por http(s)').or(z.literal('')).nullable().transform(v => v || null);
const labels = z.array(z.string().trim().min(1).max(TASK_LABEL_MAX)).max(TASK_LABELS_MAX);

export const createTaskSchema = z.object({
  spaceId: z.string().uuid(),
  title: z.string().trim().min(1, 'El título es requerido').max(TASK_TITLE_MAX),
  description: z.string().max(TASK_DESCRIPTION_MAX).optional(),
  responsibleId: z.string().uuid('Responsable requerido'),
  reviewerId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  dueDate: z.string().refine(isValidIsoDate, 'Fecha inválida').optional(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
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
  title: z.string().trim().min(1).max(TASK_TITLE_MAX).optional(),
  description: z.string().max(TASK_DESCRIPTION_MAX).optional(),
  responsibleId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  dueDate: z.string().refine(isValidIsoDate, 'Fecha inválida').nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
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
