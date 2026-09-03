import type { Person, Space, Task } from './db/schema';

type UserRole = Person['role'];
type SpaceType = Space['type'];

export function canViewAll(_role: UserRole): boolean {
  return true;
}

export function canComment(role: UserRole): boolean {
  return role !== 'observador';
}

export function canCreateSpace(role: UserRole): boolean {
  return role === 'admin' || role === 'miembro';
}

export function canCreateEditTemplates(role: UserRole): boolean {
  return role === 'admin';
}

export function canEditInstructions(role: UserRole): boolean {
  return role !== 'observador';
}

export function canGenerateOrCloseRecurring(role: UserRole): boolean {
  return role === 'admin';
}

export function canChangeDueDate(
  role: UserRole,
  spaceType: SpaceType,
  isOwner: boolean,
  isOwnTask: boolean,
): boolean {
  if (role === 'admin') return true;
  if (role === 'observador') return false;
  if (spaceType === 'recurrente') return false;
  if (isOwner) return true;
  return isOwnTask;
}

export function canChangeMilestoneDate(
  role: UserRole,
  isOwner: boolean,
): boolean {
  return role === 'admin' || isOwner;
}

export function canCreateAndAssignTask(role: UserRole): boolean {
  return role !== 'observador';
}

export function canChangeOwnTaskStatus(role: UserRole): boolean {
  return role !== 'observador';
}

export function canApproveTask(
  role: UserRole,
  userId: string,
  reviewerId: string | null,
): boolean {
  if (role === 'observador') return false;
  if (role === 'admin') return true;
  return userId === reviewerId;
}

export function canRequestExtension(role: UserRole): boolean {
  return role !== 'observador';
}

export function canGrantExtension(role: UserRole, spaceType: SpaceType): boolean {
  if (spaceType === 'recurrente') return role === 'admin';
  return role === 'admin';
}

export function canPublishUpdate(
  role: UserRole,
  isOwner: boolean,
): boolean {
  return role === 'admin' || isOwner;
}

export function canViewManagementPanel(role: UserRole): boolean {
  return role === 'admin';
}

export function canArchive(role: UserRole, isOwner: boolean): boolean {
  return role === 'admin' || isOwner;
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canExport(role: UserRole): boolean {
  return role !== 'observador';
}
