import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approveFactoryPullRequest, factoryStillWorking, needsFactoryApproval } from '../src/lib/factory-approval';

const sha = 'a'.repeat(40);
const baseSha = 'b'.repeat(40);
const url = 'https://github.com/owner/app/pull/12';
const pr = () => ({ state: 'open', draft: false, merged: false, mergeable: true, mergeable_state: 'clean',
  head: { sha, ref: 'factory/run-1', repo: { full_name: 'owner/app' } },
  base: { sha: baseSha, ref: 'main', repo: { full_name: 'owner/app' } } });
let responses: unknown[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('FORJA_GITHUB_TOKEN', 'test-token');
  vi.stubEnv('FORJA_GITHUB_APPROVAL_REPOS', JSON.stringify({ 'owner/app': { base: 'main', checks: ['verify'] } }));
  responses = [pr(), { total_count: 1, check_runs: [{ name: 'verify', head_sha: sha, status: 'completed', conclusion: 'success' }] },
    { total_count: 0, statuses: [] }, { behind_by: 0 }, pr(), { merged: true, sha: 'c'.repeat(40) }];
  fetchMock = vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const mergeCalls = () => fetchMock.mock.calls.filter(c => (c as unknown[])[1] && ((c as unknown[])[1] as RequestInit).method === 'PUT');

describe('Forja approval and GitHub merge', () => {
  it('merges only the verified SHA after live checks and revalidation', async () => {
    expect(await approveFactoryPullRequest(url, 'human-1')).toMatchObject({ headSha: sha, alreadyMerged: false });
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.github.com/repos/owner/app/pulls/12/merge',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining(`"sha":"${sha}"`) }));
  });
  it.each(['pending', 'failure', 'skipped', 'neutral', 'cancelled'])('does not merge a %s check', async conclusion => {
    responses[1] = { total_count: 1, check_runs: [{ name: 'verify', head_sha: sha, status: 'completed', conclusion }] };
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('pruebas');
    expect(mergeCalls()).toHaveLength(0);
  });
  it('requires named tests even when all reported checks pass or none exist', async () => {
    responses[1] = { total_count: 0, check_runs: [] };
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('obligatorias');
    expect(mergeCalls()).toHaveLength(0);
  });
  it('rejects failed legacy statuses', async () => {
    responses[2] = { total_count: 1, statuses: [{ context: 'legacy', state: 'failure' }] };
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('pruebas');
    expect(mergeCalls()).toHaveLength(0);
  });
  it.each(['head', 'base'])('rejects a changed %s during validation', async ref => {
    const changed = pr();
    changed[ref as 'head' | 'base'].sha = 'd'.repeat(40);
    responses[4] = changed;
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('cambió');
    expect(mergeCalls()).toHaveLength(0);
  });
  it('rejects a branch behind base', async () => {
    responses[3] = { behind_by: 1 };
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('Actualiza');
    expect(mergeCalls()).toHaveLength(0);
  });
  it.each([null, 'https://evil.test/owner/app/pull/12', 'https://github.com/owner/app/commit/aaa'])('rejects invalid PR URL %s', async invalid => {
    await expect(approveFactoryPullRequest(invalid, 'human')).rejects.toThrow('enlace');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unconfigured repositories before sending the token', async () => {
    await expect(approveFactoryPullRequest('https://github.com/other/app/pull/1', 'human')).rejects.toThrow('configuradas');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['FORJA_GITHUB_TOKEN', 'FORJA_GITHUB_APPROVAL_REPOS'])('fails closed without %s', async key => {
    vi.stubEnv(key, '');
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['draft', 'conflict', 'closed', 'fork', 'wrong base', 'not factory'])('rejects %s PRs', async kind => {
    const changed = pr();
    if (kind === 'draft') changed.draft = true;
    if (kind === 'conflict') changed.mergeable = false;
    if (kind === 'closed') changed.state = 'closed';
    if (kind === 'fork') changed.head.repo.full_name = 'other/app';
    if (kind === 'wrong base') changed.base.ref = 'other';
    if (kind === 'not factory') changed.head.ref = 'feature/other';
    responses[0] = changed;
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow();
    expect(mergeCalls()).toHaveLength(0);
  });
  it('reconciles already merged PR after an interrupted request without another merge', async () => {
    responses[0] = { ...pr(), merged: true, state: 'closed' };
    expect(await approveFactoryPullRequest(url, 'human')).toMatchObject({ alreadyMerged: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not report success when merge was not confirmed', async () => {
    responses[5] = { merged: false };
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('no confirmó');
  });
  it('redacts upstream errors and handles a timeout', async () => {
    fetchMock.mockRejectedValue(new Error('test-token secret'));
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('No se pudo confirmar');
  });
  it('checks every page, including a failing check on page two', async () => {
    responses.splice(1, 1,
      { total_count: 2, check_runs: [{ name: 'verify', head_sha: sha, status: 'completed', conclusion: 'success' }] },
      { total_count: 2, check_runs: [{ name: 'other', head_sha: sha, status: 'in_progress', conclusion: null }] });
    await expect(approveFactoryPullRequest(url, 'human')).rejects.toThrow('pruebas');
    expect(fetchMock.mock.calls.some(c => String((c as unknown[])[0]).includes('page=2'))).toBe(true);
    expect(mergeCalls()).toHaveLength(0);
  });
  it('targets factory tasks with a PR, preserving ordinary tasks and direct-commit completion', () => {
    const commit = 'https://github.com/o/r/commit/' + 'a'.repeat(40);
    expect(needsFactoryApproval({ status: 'en_revision', labels: ['ai-factory'], prUrl: url })).toBe(true);
    expect(needsFactoryApproval({ status: 'en_proceso', labels: ['ai-factory'], prUrl: url })).toBe(true);
    expect(needsFactoryApproval({ status: 'en_revision', prUrl: url })).toBe(false);
    // La fábrica fusionó sola (riesgo bajo): la tarea está en revisión con enlace al commit.
    expect(needsFactoryApproval({ status: 'en_revision', labels: ['ai-factory'], prUrl: commit })).toBe(false);
    expect(needsFactoryApproval({ status: 'en_revision', labels: ['ai-factory'] })).toBe(false);
    expect(factoryStillWorking({ status: 'en_revision', labels: ['ai-factory'] })).toBe(true);
    expect(factoryStillWorking({ status: 'en_revision', labels: ['ai-factory'], prUrl: commit })).toBe(false);
    expect(factoryStillWorking({ status: 'en_revision' })).toBe(false);
  });
});
