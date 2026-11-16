import { describe, expect, it } from 'vitest';
import {
  MAX_CHECK_RUNS,
  MAX_REVIEWERS,
  applyCheckRun,
  applyCheckSuite,
  applyReview,
  checkStateFrom,
  formatDuration,
  nextFirstReviewAt,
  prStateFrom,
  pullRequestView,
  reconcileRequestedReviewers,
  resetChecks,
  reviewWait,
  summarizeChecks,
} from '../src/lib/github-pull-request';
import type { GithubPullRequest, PrChecks, PrReviewer } from '../src/lib/db/schema';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('prStateFrom', () => {
  it.each([
    [{ state: 'open', draft: false }, 'abierto'],
    [{ state: 'open', draft: true }, 'borrador'],
    [{ state: 'closed', draft: false, merged: false, merged_at: null }, 'cerrado'],
    [{ state: 'closed', draft: true, merged: false }, 'cerrado'],
    [{ state: 'closed', draft: false, merged: true }, 'fusionado'],
    [{ state: 'closed', draft: false, merged: null, merged_at: '2026-11-16T10:00:00Z' }, 'fusionado'],
  ] as const)('%j → %s', (pr, expected) => {
    expect(prStateFrom(pr)).toBe(expected);
  });
});

describe('reconcileRequestedReviewers', () => {
  const author = 'ana';

  it('añade como pendiente a los pedidos sin entrada y ordena por login', () => {
    expect(reconcileRequestedReviewers([], ['luis', 'carla'], { author })).toEqual([
      { login: 'carla', state: 'pendiente' },
      { login: 'luis', state: 'pendiente' },
    ]);
  });

  it('quita los pendientes que ya no se piden y conserva las revisiones enviadas', () => {
    const current: PrReviewer[] = [
      { login: 'carla', state: 'pendiente' },
      { login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00.000Z' },
      { login: 'marta', state: 'pendiente' },
    ];
    expect(reconcileRequestedReviewers(current, ['marta'], { author })).toEqual([
      { login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00.000Z' },
      { login: 'marta', state: 'pendiente' },
    ]);
  });

  it('excluye al autor aunque esté pedido o tuviera entrada', () => {
    const current: PrReviewer[] = [{ login: 'ana', state: 'comentado', submittedAt: '2026-11-16T10:00:00.000Z' }];
    expect(reconcileRequestedReviewers(current, ['ana', 'luis'], { author, requestedNow: 'ana' })).toEqual([
      { login: 'luis', state: 'pendiente' },
    ]);
  });

  it('review_requested vuelve a dejar pendiente a quien ya aprobó', () => {
    const current: PrReviewer[] = [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00.000Z' }];
    const result = reconcileRequestedReviewers(current, ['luis'], { author, requestedNow: 'luis' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ login: 'luis', state: 'pendiente' }));
  });

  it('no modifica la lista recibida', () => {
    const current: PrReviewer[] = [{ login: 'carla', state: 'pendiente' }];
    reconcileRequestedReviewers(current, [], { author });
    expect(current).toEqual([{ login: 'carla', state: 'pendiente' }]);
  });

  it(`acota la lista a ${MAX_REVIEWERS} personas`, () => {
    const logins = Array.from({ length: 150 }, (_, i) => `u${String(i).padStart(3, '0')}`);
    const result = reconcileRequestedReviewers([], logins, { author });
    expect(result).toHaveLength(MAX_REVIEWERS);
    expect(result[0].login).toBe('u000');
  });
});

describe('applyReview', () => {
  const author = 'ana';
  const base = { author, requested: false };

  it.each([
    ['approved', 'aprobado'],
    ['changes_requested', 'cambios'],
    ['commented', 'comentado'],
    ['APPROVED', 'aprobado'],
  ])('%s → %s', (state, expected) => {
    expect(applyReview([], { ...base, login: 'luis', state, submittedAt: '2026-11-16T10:00:00Z' })).toEqual([
      { login: 'luis', state: expected, submittedAt: '2026-11-16T10:00:00Z' },
    ]);
  });

  it('gana la revisión más reciente de cada persona', () => {
    let reviewers = applyReview([], { ...base, login: 'luis', state: 'changes_requested', submittedAt: '2026-11-16T09:00:00Z' });
    reviewers = applyReview(reviewers, { ...base, login: 'luis', state: 'approved', submittedAt: '2026-11-16T10:00:00Z' });
    expect(reviewers).toEqual([{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00Z' }]);
  });

  it('una revisión más antigua que llega tarde no pisa una más nueva', () => {
    const current: PrReviewer[] = [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00Z' }];
    expect(applyReview(current, { ...base, login: 'luis', state: 'changes_requested', submittedAt: '2026-11-16T09:00:00Z' }))
      .toEqual(current);
  });

  it('dismissed deja pendiente a quien sigue pedido', () => {
    const current: PrReviewer[] = [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00Z' }];
    const result = applyReview(current, { author, requested: true, login: 'luis', state: 'dismissed', submittedAt: '2026-11-16T10:00:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ login: 'luis', state: 'pendiente' }));
  });

  it('dismissed elimina a quien ya no está pedido', () => {
    const current: PrReviewer[] = [
      { login: 'carla', state: 'pendiente' },
      { login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00Z' },
    ];
    expect(applyReview(current, { ...base, login: 'luis', state: 'dismissed', submittedAt: '2026-11-16T10:00:00Z' }))
      .toEqual([{ login: 'carla', state: 'pendiente' }]);
  });

  it('dismissed de una revisión antigua no quita una más nueva', () => {
    const current: PrReviewer[] = [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-16T10:00:00Z' }];
    expect(applyReview(current, { ...base, login: 'luis', state: 'dismissed', submittedAt: '2026-11-16T08:00:00Z' }))
      .toEqual(current);
  });

  it('ignora las revisiones del autor', () => {
    expect(applyReview([], { ...base, login: 'ana', state: 'approved', submittedAt: '2026-11-16T10:00:00Z' })).toEqual([]);
  });

  it('ignora un estado de revisión desconocido', () => {
    const current: PrReviewer[] = [{ login: 'luis', state: 'pendiente' }];
    expect(applyReview(current, { ...base, login: 'luis', state: 'pending', submittedAt: null })).toEqual(current);
  });

  it('ordena por login', () => {
    const current: PrReviewer[] = [{ login: 'marta', state: 'pendiente' }];
    const result = applyReview(current, { ...base, login: 'carla', state: 'commented', submittedAt: '2026-11-16T10:00:00Z' });
    expect(result.map(r => r.login)).toEqual(['carla', 'marta']);
  });
});

describe('nextFirstReviewAt', () => {
  it('toma el submitted_at de la primera revisión de alguien que no es el autor', () => {
    expect(nextFirstReviewAt(null, { login: 'luis', submittedAt: '2026-11-16T10:00:00Z' }, 'ana'))
      .toEqual(new Date('2026-11-16T10:00:00Z'));
  });

  it('el autor no cuenta', () => {
    expect(nextFirstReviewAt(null, { login: 'ana', submittedAt: '2026-11-16T10:00:00Z' }, 'ana')).toBeNull();
  });

  it('nunca se sobreescribe', () => {
    const first = new Date('2026-11-16T11:00:00Z');
    expect(nextFirstReviewAt(first, { login: 'luis', submittedAt: '2026-11-16T10:00:00Z' }, 'ana')).toBe(first);
  });

  it('sin submitted_at no cambia', () => {
    expect(nextFirstReviewAt(null, { login: 'luis', submittedAt: null }, 'ana')).toBeNull();
  });
});

describe('checkStateFrom', () => {
  it.each([
    ['completed', 'success', 'success'],
    ['completed', 'neutral', 'success'],
    ['completed', 'skipped', 'success'],
    ['completed', 'failure', 'failure'],
    ['completed', 'cancelled', 'failure'],
    ['completed', 'timed_out', 'failure'],
    ['completed', 'action_required', 'failure'],
    ['queued', null, 'pending'],
    ['in_progress', null, 'pending'],
    ['waiting', null, 'pending'],
    ['desconocido', 'success', 'pending'],
    [null, null, 'pending'],
  ] as const)('status=%s conclusion=%s → %s', (status, conclusion, expected) => {
    expect(checkStateFrom(status, conclusion)).toBe(expected);
  });
});

function run(overrides: Partial<{ id: number; name: string; headSha: string; status: string; conclusion: string | null; suiteId: number }> = {}) {
  return { id: 1, name: 'lint', headSha: 'sha1', status: 'completed', conclusion: 'success', suiteId: 10, ...overrides };
}

describe('resetChecks', () => {
  it('reinicia los contadores al sha indicado', () => {
    expect(resetChecks('sha2', NOW)).toEqual({
      sha: 'sha2', total: 0, success: 0, failure: 0, pending: 0, updatedAt: NOW.toISOString(), runs: {}, suites: {},
    });
  });
});

describe('applyCheckRun', () => {
  it('agrega los checks por nombre', () => {
    let checks: PrChecks = resetChecks('sha1', NOW);
    checks = applyCheckRun(checks, run({ id: 1, name: 'lint' }), NOW)!;
    checks = applyCheckRun(checks, run({ id: 2, name: 'test', conclusion: 'failure' }), NOW)!;
    checks = applyCheckRun(checks, run({ id: 3, name: 'build', status: 'in_progress', conclusion: null }), NOW)!;
    expect(checks).toEqual(expect.objectContaining({ sha: 'sha1', total: 3, success: 1, failure: 1, pending: 1 }));
    expect(checks.updatedAt).toBe(NOW.toISOString());
  });

  it('el id mayor gana por nombre', () => {
    let checks: PrChecks = resetChecks('sha1', NOW);
    checks = applyCheckRun(checks, run({ id: 5, conclusion: 'failure' }), NOW)!;
    checks = applyCheckRun(checks, run({ id: 4, conclusion: 'success' }), NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, success: 0, failure: 1 }));
    checks = applyCheckRun(checks, run({ id: 6, status: 'queued', conclusion: null }), NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, failure: 0, pending: 1 }));
  });

  it('con el mismo id un completado no vuelve a pendiente', () => {
    let checks: PrChecks = resetChecks('sha1', NOW);
    checks = applyCheckRun(checks, run({ id: 5, conclusion: 'success' }), NOW)!;
    checks = applyCheckRun(checks, run({ id: 5, status: 'in_progress', conclusion: null }), NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, success: 1, pending: 0 }));
  });

  it('otro sha → null', () => {
    expect(applyCheckRun(resetChecks('sha1', NOW), run({ headSha: 'otro' }), NOW)).toBeNull();
  });

  it(`ignora nombres nuevos por encima de ${MAX_CHECK_RUNS} runs`, () => {
    let checks: PrChecks = resetChecks('sha1', NOW);
    for (let i = 0; i < MAX_CHECK_RUNS + 5; i++) {
      checks = applyCheckRun(checks, run({ id: i + 1, name: `check-${i}` }), NOW)!;
    }
    expect(Object.keys(checks.runs)).toHaveLength(MAX_CHECK_RUNS);
    expect(checks.total).toBe(MAX_CHECK_RUNS);
  });

  it('no modifica el objeto recibido', () => {
    const checks = resetChecks('sha1', NOW);
    applyCheckRun(checks, run(), NOW);
    expect(checks.runs).toEqual({});
    expect(checks.total).toBe(0);
  });
});

describe('applyCheckSuite', () => {
  const suite = { id: 10, headSha: 'sha1', status: 'completed', conclusion: 'success' };

  it('cuenta la suite si ninguno de sus runs ha llegado', () => {
    const checks = applyCheckSuite(resetChecks('sha1', NOW), suite, NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, success: 1 }));
  });

  it('una suite pedida cuenta como pendiente', () => {
    const checks = applyCheckSuite(resetChecks('sha1', NOW), { ...suite, status: 'queued', conclusion: null }, NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, pending: 1 }));
  });

  it('no cuenta la suite si ya llegó alguno de sus runs', () => {
    let checks = applyCheckSuite(resetChecks('sha1', NOW), { ...suite, conclusion: 'failure' }, NOW)!;
    checks = applyCheckRun(checks, run({ id: 1, suiteId: 10, conclusion: 'success' }), NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, success: 1, failure: 0 }));
    checks = applyCheckSuite(checks, { ...suite, conclusion: 'failure' }, NOW)!;
    expect(checks).toEqual(expect.objectContaining({ total: 1, success: 1, failure: 0 }));
  });

  it('otro sha → null', () => {
    expect(applyCheckSuite(resetChecks('sha1', NOW), { ...suite, headSha: 'otro' }, NOW)).toBeNull();
  });
});

describe('summarizeChecks', () => {
  it.each([
    [{ total: 4, success: 3, failure: 1, pending: 0 }, '3/4 en verde · 1 fallando'],
    [{ total: 4, success: 4, failure: 0, pending: 0 }, '4/4 en verde'],
    [{ total: 5, success: 2, failure: 1, pending: 2 }, '2/5 en verde · 1 fallando · 2 pendientes'],
    [{ total: 3, success: 0, failure: 0, pending: 3 }, '3 pendientes'],
    [{ total: 0, success: 0, failure: 0, pending: 0 }, 'Sin checks'],
    [null, 'Sin checks'],
  ])('%j → %s', (checks, expected) => {
    expect(summarizeChecks(checks)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, 'menos de 1 min'],
    [59_999, 'menos de 1 min'],
    [MIN, '1 min'],
    [45 * MIN + 30_000, '45 min'],
    [2 * HOUR, '2 h'],
    [2 * HOUR + 15 * MIN, '2 h 15 min'],
    [DAY, '1 d'],
    [DAY + 3 * HOUR + 20 * MIN, '1 d 3 h'],
    [10 * DAY, '10 d'],
    [-5 * MIN, 'menos de 1 min'],
  ])('%s ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('reviewWait', () => {
  const openedAt = '2026-11-15T12:00:00.000Z';

  it('revisado: cuenta desde openedAt hasta la primera revisión', () => {
    expect(reviewWait({ state: 'abierto', openedAt, readyAt: null, firstReviewAt: '2026-11-15T14:15:00.000Z' }, NOW))
      .toEqual({ kind: 'reviewed', ms: 2 * HOUR + 15 * MIN });
  });

  it('revisado: cuenta desde readyAt si existe', () => {
    expect(reviewWait({ state: 'abierto', openedAt, readyAt: '2026-11-15T14:00:00.000Z', firstReviewAt: '2026-11-15T14:30:00.000Z' }, NOW))
      .toEqual({ kind: 'reviewed', ms: 30 * MIN });
  });

  it('esperando: cuenta hasta ahora', () => {
    expect(reviewWait({ state: 'abierto', openedAt, readyAt: null, firstReviewAt: null }, NOW))
      .toEqual({ kind: 'waiting', ms: DAY });
  });

  it('un borrador sin readyAt y sin revisión → none', () => {
    expect(reviewWait({ state: 'borrador', openedAt, readyAt: null, firstReviewAt: null }, NOW).kind).toBe('none');
  });

  it.each(['fusionado', 'cerrado'] as const)('%s sin revisión → none', (state) => {
    expect(reviewWait({ state, openedAt, readyAt: null, firstReviewAt: null }, NOW).kind).toBe('none');
  });

  it('nunca es negativo', () => {
    expect(reviewWait({ state: 'abierto', openedAt, readyAt: '2026-11-15T15:00:00.000Z', firstReviewAt: '2026-11-15T14:00:00.000Z' }, NOW))
      .toEqual({ kind: 'reviewed', ms: 0 });
    expect(reviewWait({ state: 'abierto', openedAt: '2026-11-17T00:00:00.000Z', readyAt: null, firstReviewAt: null }, NOW))
      .toEqual({ kind: 'waiting', ms: 0 });
  });

  it('acepta fechas como Date', () => {
    expect(reviewWait({ state: 'abierto', openedAt: new Date(openedAt), readyAt: null, firstReviewAt: null }, NOW))
      .toEqual({ kind: 'waiting', ms: DAY });
  });
});

describe('pullRequestView', () => {
  it('expone revisores { login, state } y checks sin los mapas internos', () => {
    const row: GithubPullRequest = {
      url: 'https://github.com/forja/app/pull/7',
      taskId: crypto.randomUUID(),
      number: 7,
      title: 'Filtros',
      state: 'abierto',
      headSha: 'sha1',
      authorLogin: 'ana',
      openedAt: new Date('2026-11-15T12:00:00.000Z'),
      readyAt: null,
      mergedAt: null,
      closedAt: null,
      firstReviewAt: new Date('2026-11-15T14:15:00.000Z'),
      reviewers: [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-15T14:15:00.000Z' }],
      checks: { ...resetChecks('sha1', NOW), total: 1, success: 1, runs: { lint: { id: 1, suiteId: 10, state: 'success' } } },
      updatedAt: NOW,
    };
    expect(pullRequestView(row)).toEqual({
      url: row.url,
      number: 7,
      title: 'Filtros',
      state: 'abierto',
      authorLogin: 'ana',
      openedAt: '2026-11-15T12:00:00.000Z',
      readyAt: null,
      mergedAt: null,
      closedAt: null,
      firstReviewAt: '2026-11-15T14:15:00.000Z',
      reviewers: [{ login: 'luis', state: 'aprobado' }],
      checks: { sha: 'sha1', total: 1, success: 1, failure: 0, pending: 0, updatedAt: NOW.toISOString() },
    });
  });

  it('checks null se mantiene null', () => {
    const row = {
      url: 'https://github.com/forja/app/pull/7', taskId: 'x', number: 7, title: 't', state: 'borrador',
      headSha: 's', authorLogin: 'ana', openedAt: NOW, readyAt: null, mergedAt: null, closedAt: null,
      firstReviewAt: null, reviewers: [], checks: null, updatedAt: NOW,
    } as GithubPullRequest;
    expect(pullRequestView(row).checks).toBeNull();
  });
});
