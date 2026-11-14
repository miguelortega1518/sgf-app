// Avisos de asignación: responsable (task_assigned) y revisor (review_assigned).
// Función pura; el envío lo hace la ruta con notify() fuera de la transacción.
import type { NotificationIntent } from './task-transitions';
import { taskKey } from './labels';

type AssignmentTask = {
  id: string;
  number: number | null;
  title: string;
  responsibleId: string;
  reviewerId: string | null;
};

type AssignmentParams = {
  actorId: string;
  task: AssignmentTask;
  /** Asignaciones anteriores; null si la tarea se acaba de crear. */
  previous: { responsibleId: string; reviewerId: string | null } | null;
  /** Si es false, no se avisa al revisor (p. ej. revisor por defecto al crear). */
  notifyReviewer: boolean;
};

function withKey(prefix: string, task: AssignmentTask): string {
  const key = taskKey(task.number);
  return key ? `${prefix} ${key} ${task.title}` : `${prefix} ${task.title}`;
}

export function buildAssignmentNotifications({
  actorId,
  task,
  previous,
  notifyReviewer,
}: AssignmentParams): NotificationIntent[] {
  const intents: NotificationIntent[] = [];

  const responsibleChanged = previous === null || previous.responsibleId !== task.responsibleId;
  if (task.responsibleId !== actorId && responsibleChanged) {
    intents.push({
      recipientId: task.responsibleId,
      type: 'task_assigned',
      title: withKey('Te asignaron:', task),
      body: 'Ahora eres responsable de esta tarea.',
      taskId: task.id,
    });
  }

  const reviewerChanged = previous === null || previous.reviewerId !== task.reviewerId;
  if (notifyReviewer && task.reviewerId && task.reviewerId !== actorId && reviewerChanged) {
    intents.push({
      recipientId: task.reviewerId,
      type: 'review_assigned',
      title: withKey('Te pidieron revisar:', task),
      body: 'Te asignaron como revisor de esta tarea.',
      taskId: task.id,
    });
  }

  return intents;
}
