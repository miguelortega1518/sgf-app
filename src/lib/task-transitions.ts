/**
 * Servicio centralizado de transiciones de estado de tareas.
 *
 * Separa la lógica pura de validación (testeable sin BD) de la ejecución
 * transaccional (que recibe el objeto tx de Drizzle).
 */

import { db as globalDb } from './db';
import { tasks, spaces, evidence } from './db/schema';
import { eq } from 'drizzle-orm';
import { canApproveTask } from './permissions';
import { logAudit } from './audit';

type Task = typeof tasks.$inferSelect;
type Space = typeof spaces.$inferSelect;

export type StatusInput = {
  status: string;
  delayReason?: string;
  delayReasonText?: string;
  blockedByArea?: string;
  blockedByAreaText?: string;
};

export type NotificationIntent = {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  taskId: string;
};

export type TransitionDenied = { httpStatus: number; message: string };

/**
 * Función pura: valida si la transición de estado está permitida.
 * @returns null si está permitida; objeto con error si no.
 */
export function validateStatusTransition(params: {
  session: { id: string; role: string };
  task: Pick<Task, 'status' | 'requiresApproval' | 'requiresEvidence' | 'reviewerId' | 'responsibleId'>;
  spaceStatus: string;
  newStatus: string;
  input: StatusInput;
  evidenceCount: number;
}): TransitionDenied | null {
  const { session, task, spaceStatus, newStatus, input, evidenceCount } = params;

  if (session.role === 'observador') {
    return { httpStatus: 403, message: 'Sin permisos para cambiar el estado' };
  }

  if (spaceStatus === 'cerrado') {
    return { httpStatus: 409, message: 'No se puede modificar tareas de un proyecto cerrado' };
  }

  // Estado repetido: no-op, no hay error
  if (task.status === newStatus) return null;

  if (newStatus === 'bloqueada') {
    if (!input.blockedByArea) {
      return { httpStatus: 400, message: 'Indique qué bloquea la tarea' };
    }
    if (input.blockedByArea === 'otro' && !input.blockedByAreaText) {
      return { httpStatus: 400, message: 'Especifique qué bloquea la tarea' };
    }
  }

  if (newStatus === 'completada' && task.requiresApproval) {
    const canApprove = canApproveTask(
      session.role as 'admin' | 'miembro' | 'observador',
      session.id,
      task.reviewerId,
    );
    if (!canApprove) {
      return { httpStatus: 403, message: 'Solo el revisor asignado o un admin puede aprobar esta tarea' };
    }
    if (task.status !== 'en_revision') {
      return { httpStatus: 400, message: 'La tarea debe estar en revisión para ser aprobada' };
    }
  }

  if (newStatus === 'completada' && task.requiresEvidence && evidenceCount === 0) {
    return { httpStatus: 400, message: 'Se requiere evidencia para completar esta tarea' };
  }

  return null;
}

type DbLike = Pick<typeof globalDb, 'select' | 'update' | 'insert'>;

/**
 * Aplica la transición de estado dentro de una transacción Drizzle.
 * La auditoría se escribe usando el mismo tx.
 * Las notificaciones se retornan como intents para ejecutar FUERA de la tx.
 */
export async function applyStatusTransition(
  tx: DbLike,
  session: { id: string; role: string },
  task: Task,
  space: Pick<Space, 'status'>,
  input: StatusInput,
): Promise<{ task: Task; notifications: NotificationIntent[]; isNoop: boolean }> {
  // Contar evidencias (necesario para validación)
  const evidenceRows = await tx
    .select({ id: evidence.id })
    .from(evidence)
    .where(eq(evidence.taskId, task.id));

  const denied = validateStatusTransition({
    session,
    task,
    spaceStatus: space.status,
    newStatus: input.status,
    input,
    evidenceCount: evidenceRows.length,
  });

  if (denied) {
    const err = new Error(denied.message);
    Object.assign(err, { httpStatus: denied.httpStatus });
    throw err;
  }

  // No-op: estado repetido
  if (task.status === input.status) {
    return { task, notifications: [], isNoop: true };
  }

  const updateData: Record<string, unknown> = { status: input.status };

  if (input.status === 'completada') {
    updateData.completedAt = new Date();
    if (input.delayReason) {
      updateData.delayReason = input.delayReason;
      updateData.delayReasonText = input.delayReasonText ?? null;
    }
  }

  // Reabrir: limpiar completedAt
  if (task.status === 'completada' && input.status !== 'completada') {
    updateData.completedAt = null;
  }

  if (input.status === 'bloqueada') {
    updateData.blockedByArea = input.blockedByArea;
    updateData.blockedByAreaText = input.blockedByAreaText ?? null;
    updateData.blockedSince = new Date().toISOString().slice(0, 10);
  }

  // Desbloquear: limpiar campos de bloqueo
  if (task.status === 'bloqueada' && input.status !== 'bloqueada') {
    updateData.blockedByArea = null;
    updateData.blockedByAreaText = null;
    updateData.blockedSince = null;
  }

  const [updated] = await tx
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, task.id))
    .returning();

  // Auditoría de aprobación (antes del log general para semántica)
  if (input.status === 'completada' && task.requiresApproval) {
    const isAdminOverride = session.id !== task.reviewerId && session.role === 'admin';
    await logAudit({
      actorId: session.id,
      action: isAdminOverride ? 'task_approved_admin_override' : 'task_approved',
      taskId: task.id,
    }, tx);
  }

  // Log de cambio de estado
  await logAudit({
    actorId: session.id,
    action: 'status_changed',
    taskId: task.id,
    previousValue: task.status,
    newValue: input.status,
    reason: input.delayReason,
  }, tx);

  // Construir intents de notificación (se ejecutan fuera de la tx)
  const notifications: NotificationIntent[] = [];

  if (input.status === 'completada' && task.reviewerId && task.reviewerId !== session.id) {
    notifications.push({
      recipientId: task.reviewerId,
      type: 'task_completed',
      title: `Hecho: ${task.title}`,
      body: 'Una tarea que revisas ya está hecha.',
      taskId: task.id,
    });
  }

  if (input.status === 'en_revision' && task.reviewerId) {
    notifications.push({
      recipientId: task.reviewerId,
      type: 'task_review',
      title: `En revisión: ${task.title}`,
      body: 'Hay cambios esperando tu revisión.',
      taskId: task.id,
    });
  }

  if (input.status === 'bloqueada' && task.responsibleId !== session.id) {
    notifications.push({
      recipientId: task.responsibleId,
      type: 'task_blocked',
      title: `Tarea bloqueada: ${task.title}`,
      body: `Bloqueada por: ${input.blockedByArea || 'sin especificar'}`,
      taskId: task.id,
    });
  }

  return { task: updated, notifications, isNoop: false };
}
