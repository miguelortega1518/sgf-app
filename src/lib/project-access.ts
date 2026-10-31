/**
 * Guardias centrales de autorización para proyectos y tareas.
 *
 * Política:
 *  - Admin global: acceso completo.
 *  - No-admin: acceso si es dueño del espacio O tiene fila en space_members.
 *  - Observador (rol global): siempre sólo lectura, independientemente del rol en el espacio.
 *  - Observador en space_members: sólo lectura, incluido el dueño si figura como observador.
 */

import { db as globalDb } from './db';
import { spaces, spaceMembers, tasks, persons, milestones, companies } from './db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { SessionUser } from './auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lanza 400 con httpStatus adjunto si el ID no tiene formato UUID válido. */
export function assertValidUuid(id: string, label = 'ID'): void {
  if (!UUID_REGEX.test(id)) {
    const err = new Error(`${label} con formato inválido`);
    Object.assign(err, { httpStatus: 400 });
    throw err;
  }
}

type SpaceRole = typeof spaceMembers.$inferSelect['spaceRole'];

/**
 * Función pura: determina si el usuario tiene acceso dado el contexto del espacio.
 * @param ownerId null indica que el espacio no existe.
 * @returns null = acceso concedido; objeto con httpStatus y message = acceso denegado.
 */
export function computeProjectAccess(
  session: Pick<SessionUser, 'id' | 'role'>,
  ownerId: string | null,
  membership: { spaceRole: SpaceRole } | undefined,
  mode: 'read' | 'write' = 'read',
): { httpStatus: number; message: string } | null {
  if (session.role === 'admin') return null;

  if (ownerId === null) {
    return { httpStatus: 404, message: 'Proyecto no encontrado' };
  }

  const isOwner = ownerId === session.id;

  if (!membership && !isOwner) {
    return { httpStatus: 403, message: 'Sin acceso a este proyecto' };
  }

  if (mode === 'write' && (session.role === 'observador' || membership?.spaceRole === 'observador')) {
    return { httpStatus: 403, message: 'Sin permisos de escritura en este proyecto' };
  }

  return null;
}

/**
 * Retorna los IDs de espacios accesibles para el usuario.
 * Devuelve null si el usuario es admin (accede a todo sin restricción).
 */
export async function accessibleSpaceIds(
  session: Pick<SessionUser, 'id' | 'role'>,
): Promise<string[] | null> {
  if (session.role === 'admin') return null;

  const [memberRows, ownerRows] = await Promise.all([
    globalDb
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(eq(spaceMembers.personId, session.id)),
    globalDb
      .select({ id: spaces.id })
      .from(spaces)
      .where(eq(spaces.ownerId, session.id)),
  ]);

  const idSet = new Set([
    ...memberRows.map(r => r.spaceId),
    ...ownerRows.map(r => r.id),
  ]);
  return [...idSet];
}

/**
 * Verifica acceso al proyecto. Lanza errores con httpStatus si está denegado.
 * Los errores son capturados por handleError en api-utils.
 */
export async function requireProjectAccess(
  session: Pick<SessionUser, 'id' | 'role'>,
  spaceId: string,
  mode: 'read' | 'write' = 'read',
  executor: Pick<typeof globalDb, 'select'> = globalDb,
) {
  assertValidUuid(spaceId, 'ID de proyecto');
  const [[membership], [spaceRow]] = await Promise.all([
    executor
      .select({ spaceRole: spaceMembers.spaceRole })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.personId, session.id)))
      .limit(1),
    executor
      .select()
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1),
  ]);

  if (!spaceRow) throw Object.assign(new Error('Proyecto no encontrado'), { httpStatus: 404 });
  const denied = computeProjectAccess(session, spaceRow.ownerId, membership, mode);
  if (denied) {
    const err = new Error(denied.message);
    Object.assign(err, { httpStatus: denied.httpStatus });
    throw err;
  }
  if (mode === 'write' && spaceRow.status === 'cerrado') {
    throw Object.assign(new Error('El proyecto está cerrado'), { httpStatus: 409 });
  }
  return spaceRow;
}

/**
 * Carga la tarea y verifica acceso al espacio al que pertenece.
 * Retorna la tarea si el acceso es válido.
 */
export async function requireTaskAccess(
  session: Pick<SessionUser, 'id' | 'role'>,
  taskId: string,
  mode: 'read' | 'write' = 'read',
): Promise<typeof tasks.$inferSelect> {
  assertValidUuid(taskId, 'ID de tarea');

  const [task] = await globalDb
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    const err = new Error('Tarea no encontrada');
    Object.assign(err, { httpStatus: 404 });
    throw err;
  }

  await requireProjectAccess(session, task.spaceId, mode);

  return task;
}

export async function visiblePersonIds(session: Pick<SessionUser, 'id' | 'role'>): Promise<string[] | null> {
  const ids = await accessibleSpaceIds(session);
  if (ids === null) return null;
  if (!ids.length) return [session.id];
  const [members, owners] = await Promise.all([
    globalDb.select({ id: spaceMembers.personId }).from(spaceMembers).where(inArray(spaceMembers.spaceId, ids)),
    globalDb.select({ id: spaces.ownerId }).from(spaces).where(inArray(spaces.id, ids)),
  ]);
  return [...new Set([session.id, ...members.map(p => p.id), ...owners.map(p => p.id)])];
}

export async function validateTaskReferences(
  spaceId: string,
  input: { responsibleId?: string; reviewerId?: string | null; milestoneId?: string | null; companyId?: string | null },
  executor: Pick<typeof globalDb, 'select'> = globalDb,
) {
  for (const id of new Set([input.responsibleId, input.reviewerId].filter((id): id is string => !!id))) {
    const [person] = await executor.select().from(persons).where(eq(persons.id, id)).limit(1);
    if (!person?.active || person.role === 'observador') {
      throw Object.assign(new Error('La persona asignada debe estar activa y tener permisos de escritura'), { httpStatus: 400 });
    }
    await requireProjectAccess(person, spaceId, 'write', executor);
  }
  if (input.milestoneId) {
    const [row] = await executor.select({ id: milestones.id }).from(milestones)
      .where(and(eq(milestones.id, input.milestoneId), eq(milestones.spaceId, spaceId))).limit(1);
    if (!row) throw Object.assign(new Error('El hito no pertenece al proyecto'), { httpStatus: 400 });
  }
  if (input.companyId) {
    const [row] = await executor.select({ id: companies.id }).from(companies).where(eq(companies.id, input.companyId)).limit(1);
    if (!row) throw Object.assign(new Error('Organización no encontrada'), { httpStatus: 400 });
  }
}
