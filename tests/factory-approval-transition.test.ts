import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/factory-approval', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/factory-approval')>(),
  approveFactoryPullRequest: vi.fn(),
}));
import { approveFactoryPullRequest } from '../src/lib/factory-approval';
import { applyStatusTransition } from '../src/lib/task-transitions';
import { logAudit } from '../src/lib/audit';
const approve = vi.mocked(approveFactoryPullRequest);
const task = { id: 'task', title: 'Factory task', status: 'en_revision', labels: ['ai-factory'],
  prUrl: 'https://github.com/o/r/pull/1', requiresApproval: false, requiresEvidence: true,
  responsibleId: 'robot', reviewerId: 'reviewer' };
function setup(evidence: unknown[] = [{ id: 'evidence' }]) {
  const set = vi.fn(() => ({ where: () => ({ returning: async () => [{ ...task, status: 'completada' }] }) }));
  const tx = { select: () => ({ from: () => ({ where: async () => evidence }) }), update: () => ({ set }), insert: vi.fn() };
  return { tx, set };
}
beforeEach(() => vi.resetAllMocks());
describe('factory transition ordering', () => {
  it('writes completion and audit only after a confirmed integration', async () => {
    const { tx, set } = setup();
    const integration = { prUrl: task.prUrl, headSha: 'abc', mergeSha: 'def', alreadyMerged: false };
    approve.mockImplementation(async () => {
      expect(set).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
      return integration;
    });
    await applyStatusTransition(tx as never, { id: 'reviewer', role: 'miembro' }, task as never,
      { status: 'activo' }, { status: 'completada' });
    expect(approve).toHaveBeenCalledWith(task.prUrl, 'reviewer');
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'completada', completedAt: expect.any(Date) }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'factory_pr_merged',
      newValue: JSON.stringify(integration) }), tx);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'task_approved' }), tx);
  });
  it('does not mutate the task or audit a successful approval after failed tests', async () => {
    const { tx, set } = setup();
    approve.mockRejectedValue(Object.assign(new Error('Pruebas pendientes'), { httpStatus: 409 }));
    await expect(applyStatusTransition(tx as never, { id: 'reviewer', role: 'miembro' }, task as never,
      { status: 'activo' }, { status: 'completada' })).rejects.toThrow('pendientes');
    expect(set).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('lets the factory account close its own task merged without a PR (commit link)', async () => {
    const { tx, set } = setup([]);
    const direct = { ...task, requiresEvidence: false, prUrl: 'https://github.com/o/r/commit/' + 'a'.repeat(40) };
    await applyStatusTransition(tx as never, { id: 'robot', role: 'miembro' }, direct as never,
      { status: 'activo' }, { status: 'completada' });
    expect(approve).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'completada' }));
    expect(logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'task_approved' }), tx);
  });
  it('completes a factory PR already merged on GitHub (webhook) without integrating again', async () => {
    const { tx, set } = setup([]);
    const merged = { ...task, requiresEvidence: false };
    await applyStatusTransition(tx as never, { id: 'github', role: 'miembro' }, merged as never,
      { status: 'activo' }, { status: 'completada' }, { mergedOnGitHub: true });
    expect(approve).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'completada' }));
  });
  it('refuses to approve while the factory is still working (review without any link)', async () => {
    const { tx, set } = setup();
    const working = { ...task, prUrl: null };
    await expect(applyStatusTransition(tx as never, { id: 'reviewer', role: 'admin' }, working as never,
      { status: 'activo' }, { status: 'completada' })).rejects.toThrow('todavía trabaja');
    expect(approve).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it.each(['permission', 'evidence', 'closed project'])('checks %s before any GitHub mutation', async reason => {
    const { tx, set } = setup(reason === 'evidence' ? [] : [{ id: 'evidence' }]);
    await expect(applyStatusTransition(tx as never,
      { id: reason === 'permission' ? 'other' : 'reviewer', role: 'miembro' }, task as never,
      { status: reason === 'closed project' ? 'cerrado' : 'activo' }, { status: 'completada' })).rejects.toThrow();
    expect(approve).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});
