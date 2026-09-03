import {
  pgTable, pgEnum, text, integer, boolean, date,
  timestamp, uuid, uniqueIndex, index, check, jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
  'admin', 'miembro', 'observador',
]);

export const spaceTypeEnum = pgEnum('space_type', [
  'recurrente', 'proyecto', 'continuo',
]);

export const spaceStatusEnum = pgEnum('space_status', [
  'borrador', 'activo', 'cerrado',
]);

export const periodicityEnum = pgEnum('periodicity', [
  'mensual', 'trimestral', 'anual',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'no_iniciada', 'en_proceso', 'en_revision', 'completada', 'bloqueada',
]);

export const priorityEnum = pgEnum('priority', [
  'critica', 'alta', 'normal', 'baja',
]);

export const healthEnum = pgEnum('health', [
  'verde', 'amarillo', 'rojo',
]);

export const spaceRoleEnum = pgEnum('space_role', [
  'dueño', 'colaborador', 'observador',
]);

export const evidenceTypeEnum = pgEnum('evidence_type', [
  'enlace', 'archivo', 'captura',
]);

export const delayReasonEnum = pgEnum('delay_reason', [
  'falta_informacion_terceros',
  'documento_no_recibido_otra_area',
  'error_sistema',
  'capacidad_insuficiente',
  'dependencia_atrasada',
  'repriorizacion',
  'otro',
]);

export const blockedByAreaEnum = pgEnum('blocked_by_area', [
  'compras',
  'operaciones',
  'tesoreria',
  'contabilidad',
  'administracion',
  'presupuesto',
  'otro',
]);

// ─── Tables ───────────────────────────────────────────

export const companies = pgTable('companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const persons = pgTable('persons', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: userRoleEnum('role').notNull().default('miembro'),
  active: boolean('active').notNull().default(true),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const holidays = pgTable('holidays', {
  date: date('date', { mode: 'string' }).primaryKey(),
  description: text('description').notNull(),
});

export const spaceTemplates = pgTable('space_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  periodicity: periodicityEnum('periodicity').notNull(),
  targetCycleDays: integer('target_cycle_days').notNull(),
  autoGenerate: boolean('auto_generate').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  spaceTemplateId: uuid('space_template_id').notNull()
    .references(() => spaceTemplates.id),
  companyId: uuid('company_id').references(() => companies.id),
  taskName: text('task_name').notNull(),
  order: integer('order').notNull(),
  businessDayLimit: integer('business_day_limit').notNull(),
  defaultResponsibleId: uuid('default_responsible_id')
    .references(() => persons.id),
  alternateId: uuid('alternate_id').references(() => persons.id),
  reviewerId: uuid('reviewer_id').references(() => persons.id),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  requiresEvidence: boolean('requires_evidence').notNull().default(false),
  instructions: text('instructions'),
  doneDefinition: text('done_definition'),
  applies: boolean('applies').notNull().default(true),
  notApplicableReason: text('not_applicable_reason'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const templateDependencies = pgTable('template_dependencies', {
  templateId: uuid('template_id').notNull()
    .references(() => taskTemplates.id),
  predecessorId: uuid('predecessor_id').notNull()
    .references(() => taskTemplates.id),
}, (t) => [
  primaryKey({ columns: [t.templateId, t.predecessorId] }),
]);

export const spaces = pgTable('spaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  type: spaceTypeEnum('type').notNull(),
  spaceTemplateId: uuid('space_template_id')
    .references(() => spaceTemplates.id),
  period: text('period'),
  anchorDate: date('anchor_date', { mode: 'string' }),
  objective: text('objective'),
  ownerId: uuid('owner_id').notNull().references(() => persons.id),
  status: spaceStatusEnum('status').notNull().default('activo'),
  targetDate: date('target_date', { mode: 'string' }),
  declaredHealth: healthEnum('declared_health'),
  templateSnapshot: jsonb('template_snapshot'),
  openDate: date('open_date', { mode: 'string' }).notNull(),
  closeDate: date('close_date', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_template_period').on(t.spaceTemplateId, t.period),
]);

export const spaceMembers = pgTable('space_members', {
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  personId: uuid('person_id').notNull().references(() => persons.id),
  spaceRole: spaceRoleEnum('space_role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.spaceId, t.personId] }),
]);

export const milestones = pgTable('milestones', {
  id: uuid('id').defaultRandom().primaryKey(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  name: text('name').notNull(),
  targetDate: date('target_date', { mode: 'string' }).notNull(),
  targetDateOriginal: date('target_date_original', { mode: 'string' }).notNull(),
  completed: boolean('completed').notNull().default(false),
  order: integer('order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  templateId: uuid('template_id').references(() => taskTemplates.id),
  companyId: uuid('company_id').references(() => companies.id),
  milestoneId: uuid('milestone_id').references(() => milestones.id),
  title: text('title').notNull(),
  description: text('description'),
  responsibleId: uuid('responsible_id').notNull()
    .references(() => persons.id),
  reviewerId: uuid('reviewer_id').references(() => persons.id),
  creatorId: uuid('creator_id').notNull().references(() => persons.id),
  dueDate: date('due_date', { mode: 'string' }),
  dueDateOriginal: date('due_date_original', { mode: 'string' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: taskStatusEnum('status').notNull().default('no_iniciada'),
  delayReason: delayReasonEnum('delay_reason'),
  delayReasonText: text('delay_reason_text'),
  blockedByArea: blockedByAreaEnum('blocked_by_area'),
  blockedByAreaText: text('blocked_by_area_text'),
  blockedSince: date('blocked_since', { mode: 'string' }),
  priority: priorityEnum('priority').notNull().default('normal'),
  draggedFromId: uuid('dragged_from_id'),
  archived: boolean('archived').notNull().default(false),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  requiresEvidence: boolean('requires_evidence').notNull().default(false),
  doneDefinition: text('done_definition'),
  instructions: text('instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_task_responsible_due').on(t.responsibleId, t.dueDate),
  index('idx_task_reviewer').on(t.reviewerId),
  index('idx_task_space_status').on(t.spaceId, t.status),
  index('idx_task_company_space').on(t.companyId, t.spaceId),
]);

export const subtasks = pgTable('subtasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  title: text('title').notNull(),
  completed: boolean('completed').notNull().default(false),
  order: integer('order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_subtask_task').on(t.taskId),
]);

export const taskDependencies = pgTable('task_dependencies', {
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  predecessorId: uuid('predecessor_id').notNull()
    .references(() => tasks.id),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.predecessorId] }),
]);

export const spaceUpdates = pgTable('space_updates', {
  id: uuid('id').defaultRandom().primaryKey(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  authorId: uuid('author_id').notNull().references(() => persons.id),
  health: healthEnum('health').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id),
  spaceId: uuid('space_id').references(() => spaces.id),
  authorId: uuid('author_id').notNull().references(() => persons.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
}, (t) => [
  index('idx_comment_task').on(t.taskId),
  check('chk_comment_target', sql`
    (${t.taskId} IS NOT NULL AND ${t.spaceId} IS NULL) OR
    (${t.taskId} IS NULL AND ${t.spaceId} IS NOT NULL)
  `),
]);

export const evidence = pgTable('evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  urlOrFile: text('url_or_file').notNull(),
  type: evidenceTypeEnum('type').notNull(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => persons.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_evidence_task').on(t.taskId),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').references(() => tasks.id),
  spaceId: uuid('space_id').references(() => spaces.id),
  actorId: uuid('actor_id').notNull().references(() => persons.id),
  action: text('action').notNull(),
  previousValue: text('previous_value'),
  newValue: text('new_value'),
  reason: text('reason'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_audit_task').on(t.taskId),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientId: uuid('recipient_id').notNull().references(() => persons.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  taskId: uuid('task_id').references(() => tasks.id),
  spaceId: uuid('space_id').references(() => spaces.id),
  read: boolean('read').notNull().default(false),
  emailSent: boolean('email_sent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notification_recipient').on(t.recipientId),
]);

// ─── Type exports ─────────────────────────────────────

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

export type Holiday = typeof holidays.$inferSelect;

export type SpaceTemplate = typeof spaceTemplates.$inferSelect;
export type NewSpaceTemplate = typeof spaceTemplates.$inferInsert;

export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type NewTaskTemplate = typeof taskTemplates.$inferInsert;

export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;

export type SpaceMember = typeof spaceMembers.$inferSelect;

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Subtask = typeof subtasks.$inferSelect;

export type SpaceUpdate = typeof spaceUpdates.$inferSelect;

export type Comment = typeof comments.$inferSelect;

export type Evidence = typeof evidence.$inferSelect;

export type AuditLogEntry = typeof auditLog.$inferSelect;

export type Notification = typeof notifications.$inferSelect;
