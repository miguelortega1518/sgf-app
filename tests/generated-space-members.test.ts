import { describe, expect, it } from 'vitest';
import { buildGeneratedSpaceMembers } from '../src/lib/generated-space-members';

describe('buildGeneratedSpaceMembers', () => {
  it('includes reviewers of applicable generated tasks in the new project', () => {
    expect(buildGeneratedSpaceMembers('owner-1', [
      { applies: true, defaultResponsibleId: 'owner-1', reviewerId: 'reviewer-1' },
      { applies: true, defaultResponsibleId: 'worker-1', reviewerId: 'reviewer-1' },
      { applies: false, defaultResponsibleId: 'unused-1', reviewerId: 'unused-2' },
    ])).toEqual([
      { personId: 'owner-1', spaceRole: 'dueño' },
      { personId: 'reviewer-1', spaceRole: 'colaborador' },
      { personId: 'worker-1', spaceRole: 'colaborador' },
    ]);
  });
});
