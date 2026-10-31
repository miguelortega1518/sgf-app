export interface GeneratedTaskAssignees {
  applies: boolean;
  defaultResponsibleId: string | null;
  reviewerId: string | null;
}

export interface GeneratedSpaceMember {
  personId: string;
  spaceRole: 'dueño' | 'colaborador';
}

export function buildGeneratedSpaceMembers(
  ownerId: string,
  taskAssignees: GeneratedTaskAssignees[],
): GeneratedSpaceMember[] {
  const personIds = new Set([ownerId]);

  for (const task of taskAssignees) {
    if (!task.applies) continue;
    personIds.add(task.defaultResponsibleId || ownerId);
    if (task.reviewerId) personIds.add(task.reviewerId);
  }

  return Array.from(personIds, personId => ({
    personId,
    spaceRole: personId === ownerId ? 'dueño' : 'colaborador',
  }));
}
