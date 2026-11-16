import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyGithubSignature,
  extractTaskNumber,
  extractClosingTaskNumbers,
  classifyPullRequest,
  targetStatusFor,
  summarizeOutcome,
  summarizePanelOutcome,
  type GithubTrigger,
} from '../src/lib/github-webhook';
import {
  checkRunEventSchema,
  checkSuiteEventSchema,
  pullRequestEventSchema,
  pullRequestReviewEventSchema,
} from '../src/lib/schemas/github-webhook';

const SECRET = 'secreto-de-prueba';

function sign(body: Buffer, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  const body = Buffer.from(JSON.stringify({ hola: 'mundo', acento: 'á' }));

  it('acepta una firma correcta', () => {
    expect(verifyGithubSignature(SECRET, body, sign(body))).toBe(true);
  });

  it('rechaza si cambia un byte del cuerpo', () => {
    const altered = Buffer.from(body);
    altered[2] = altered[2] ^ 1;
    expect(verifyGithubSignature(SECRET, altered, sign(body))).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    expect(verifyGithubSignature(SECRET, body, sign(body, 'otro'))).toBe(false);
  });

  it.each([
    ['ausente', null],
    ['vacía', ''],
    ['sin prefijo sha256=', createHmac('sha256', SECRET).update(body).digest('hex')],
    ['con prefijo sha1=', `sha1=${createHmac('sha256', SECRET).update(body).digest('hex')}`],
    ['con hex corto', 'sha256=abcdef'],
    ['con hex largo', `${sign(body)}00`],
    ['con caracteres no hex', `sha256=${'z'.repeat(64)}`],
  ])('rechaza una cabecera %s sin lanzar', (_name, header) => {
    expect(() => verifyGithubSignature(SECRET, body, header)).not.toThrow();
    expect(verifyGithubSignature(SECRET, body, header)).toBe(false);
  });

  it.each([[undefined], ['']])('rechaza con secreto %j', (secret) => {
    expect(verifyGithubSignature(secret, body, sign(body, ''))).toBe(false);
  });

  it('acepta el hex en mayúsculas', () => {
    expect(verifyGithubSignature(SECRET, body, sign(body).toUpperCase().replace('SHA256=', 'sha256='))).toBe(true);
  });
});

describe('extractTaskNumber', () => {
  it.each([
    ['feat/FOR-12-filtros', 12],
    ['for-12', 12],
    ['FOR-1', 1],
    ['fix: FOR-999999999 al final', 999999999],
  ])('%s → %s', (text, expected) => {
    expect(extractTaskNumber(text)).toBe(expected);
  });

  it('la rama gana al título y el título al cuerpo', () => {
    expect(extractTaskNumber('feat/FOR-1-x', 'FOR-2 título', 'FOR-3 cuerpo')).toBe(1);
    expect(extractTaskNumber('feat/sin-clave', 'FOR-2 título', 'FOR-3 cuerpo')).toBe(2);
    expect(extractTaskNumber('feat/sin-clave', 'Título', 'Cierra FOR-3')).toBe(3);
  });

  it('acepta textos nulos o indefinidos', () => {
    expect(extractTaskNumber(null, undefined, 'FOR-4')).toBe(4);
  });

  it.each([
    ['sin clave'],
    ['FOR-1234567890'],
    ['XFOR-12'],
    ['FOR-'],
    ['FOR12'],
  ])('%s → null', (text) => {
    expect(extractTaskNumber(text)).toBeNull();
  });

  it('sin textos → null', () => {
    expect(extractTaskNumber()).toBeNull();
  });
});

describe('extractClosingTaskNumbers', () => {
  it('detecta Closes, Fixes y Resolves sin distinguir mayúsculas', () => {
    expect(extractClosingTaskNumbers(['Closes FOR-12', 'fixes for-7', 'RESOLVES FOR-3'])).toEqual([12, 7, 3]);
  });

  it('ignora otras palabras', () => {
    expect(extractClosingTaskNumbers(['Refs FOR-12', 'FOR-13 sin verbo', 'Close FOR-14'])).toEqual([]);
  });

  it('deduplica y respeta el orden de aparición', () => {
    expect(extractClosingTaskNumbers(['Fixes FOR-2 y closes FOR-1', 'Resolves FOR-2'])).toEqual([2, 1]);
  });

  it('respeta el máximo de 50 claves', () => {
    const messages = Array.from({ length: 80 }, (_, i) => `Closes FOR-${i + 1}`);
    const result = extractClosingTaskNumbers(messages);
    expect(result).toHaveLength(50);
    expect(result[0]).toBe(1);
    expect(result[49]).toBe(50);
  });

  it('admite un máximo distinto', () => {
    expect(extractClosingTaskNumbers(['Closes FOR-1, closes FOR-2, closes FOR-3'], 2)).toEqual([1, 2]);
  });

  it('no acepta claves de 10 dígitos', () => {
    expect(extractClosingTaskNumbers(['Closes FOR-1234567890'])).toEqual([]);
  });
});

describe('classifyPullRequest', () => {
  it.each([
    ['opened', false, false, 'pr_ready'],
    ['reopened', false, false, 'pr_ready'],
    ['ready_for_review', false, false, 'pr_ready'],
    ['opened', true, false, 'pr_draft'],
    ['reopened', true, false, 'pr_draft'],
    ['closed', false, true, 'pr_merged'],
    ['closed', false, false, 'pr_closed'],
    ['closed', false, null, 'pr_closed'],
    ['synchronize', false, false, null],
    ['edited', false, false, null],
    ['labeled', false, false, null],
  ] as const)('%s (draft=%s, merged=%s) → %s', (action, draft, merged, expected) => {
    expect(classifyPullRequest(action, { draft, merged })).toBe(expected);
  });
});

type Status = 'no_iniciada' | 'en_proceso' | 'en_revision' | 'completada' | 'bloqueada';

function task(status: Status, extra: { requiresApproval?: boolean; requiresEvidence?: boolean } = {}) {
  return { status, requiresApproval: false, requiresEvidence: false, ...extra };
}

describe('targetStatusFor', () => {
  it.each([
    ['pr_ready', task('en_proceso'), 'en_revision'],
    ['pr_ready', task('no_iniciada'), 'en_revision'],
    ['pr_ready', task('en_revision'), null],
    ['pr_draft', task('en_proceso'), null],
    ['pr_merged', task('en_revision'), 'completada'],
    ['pr_merged', task('en_proceso'), 'completada'],
    ['pr_merged', task('en_proceso', { requiresApproval: true }), 'en_revision'],
    ['pr_merged', task('en_revision', { requiresApproval: true }), null],
    ['pr_merged', task('en_proceso', { requiresEvidence: true }), 'en_revision'],
    ['pr_merged', task('en_revision', { requiresEvidence: true }), null],
    ['pr_closed', task('en_revision'), 'en_proceso'],
    ['pr_closed', task('no_iniciada'), null],
    ['pr_closed', task('en_proceso'), null],
    ['pr_closed', task('bloqueada'), null],
    ['push_closes', task('en_revision'), 'completada'],
    ['push_closes', task('en_proceso', { requiresApproval: true }), 'en_revision'],
    ['push_closes', task('en_revision', { requiresEvidence: true }), null],
  ] as const)('%s con %j → %s', (trigger, t, expected) => {
    expect(targetStatusFor(trigger, t)).toBe(expected);
  });

  it.each(['pr_ready', 'pr_draft', 'pr_merged', 'pr_closed', 'push_closes'] as GithubTrigger[])(
    '%s nunca mueve una tarea completada',
    (trigger) => {
      expect(targetStatusFor(trigger, task('completada'))).toBeNull();
      expect(targetStatusFor(trigger, task('completada', { requiresApproval: true }))).toBeNull();
    },
  );
});

describe('summarizeOutcome', () => {
  it('resume cada tarea', () => {
    expect(summarizeOutcome([
      { taskNumber: 12, outcome: 'aplicado' },
      { taskNumber: 13, outcome: 'sin_tarea' },
    ])).toBe('FOR-12: aplicado, FOR-13: sin_tarea');
  });

  it('trunca a 500 caracteres', () => {
    const results = Array.from({ length: 50 }, (_, i) => ({ taskNumber: 100000000 + i, outcome: 'sin_cambios' as const }));
    const summary = summarizeOutcome(results);
    expect(summary.length).toBe(500);
    expect(summary.startsWith('FOR-100000000: sin_cambios')).toBe(true);
  });

  it('sin resultados devuelve cadena vacía', () => {
    expect(summarizeOutcome([])).toBe('');
  });
});

describe('summarizePanelOutcome', () => {
  it('resume cada PR', () => {
    expect(summarizePanelOutcome([
      { prUrl: 'https://github.com/forja/app/pull/7', outcome: 'aplicado' },
      { prUrl: 'https://github.com/forja/app/pull/8', outcome: 'sin_cambios' },
    ])).toBe('https://github.com/forja/app/pull/7: aplicado, https://github.com/forja/app/pull/8: sin_cambios');
  });

  it('trunca a 500 caracteres', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ prUrl: `https://github.com/forja/app/pull/${i}`, outcome: 'aplicado' as const }));
    expect(summarizePanelOutcome(results).length).toBe(500);
  });
});

function realPullRequestEvent() {
  return {
    action: 'review_requested',
    number: 7,
    requested_reviewer: { login: 'luis', id: 3 },
    pull_request: {
      html_url: 'https://github.com/forja/app/pull/7',
      number: 7,
      state: 'open',
      title: 'FOR-12 Filtros guardados',
      body: null,
      draft: false,
      merged: false,
      created_at: '2026-11-15T12:00:00Z',
      updated_at: '2026-11-15T13:00:00Z',
      closed_at: null,
      merged_at: null,
      user: { login: 'ana', id: 1, type: 'User' },
      requested_reviewers: [{ login: 'luis', id: 3 }],
      requested_teams: [],
      head: { ref: 'feat/FOR-12-filtros', sha: 'a'.repeat(40), label: 'forja:feat' },
      base: { ref: 'main', sha: 'b'.repeat(40) },
    },
    repository: { full_name: 'forja/app', html_url: 'https://github.com/forja/app', default_branch: 'main' },
    sender: { login: 'ana' },
  };
}

describe('pullRequestEventSchema (campos del panel)', () => {
  it('acepta un payload real', () => {
    const parsed = pullRequestEventSchema.parse(realPullRequestEvent());
    expect(parsed.pull_request.state).toBe('open');
    expect(parsed.pull_request.head.sha).toBe('a'.repeat(40));
    expect(parsed.pull_request.user.login).toBe('ana');
    expect(parsed.pull_request.requested_reviewers).toEqual([{ login: 'luis' }]);
    expect(parsed.requested_reviewer).toEqual({ login: 'luis' });
    expect(parsed.pull_request.created_at).toBe('2026-11-15T12:00:00Z');
  });

  it('requested_reviewers es [] por defecto', () => {
    const payload = realPullRequestEvent() as { pull_request: Record<string, unknown> };
    delete payload.pull_request.requested_reviewers;
    expect(pullRequestEventSchema.parse(payload).pull_request.requested_reviewers).toEqual([]);
  });

  it('rechaza un login de más de 100 caracteres', () => {
    const payload = realPullRequestEvent();
    payload.pull_request.user.login = 'x'.repeat(101);
    const result = pullRequestEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/100 caracteres/);
  });

  it('rechaza más de 100 requested_reviewers', () => {
    const payload = realPullRequestEvent();
    payload.pull_request.requested_reviewers = Array.from({ length: 101 }, (_, i) => ({ login: `u${i}`, id: i }));
    expect(pullRequestEventSchema.safeParse(payload).success).toBe(false);
  });

  it('rechaza un head.sha vacío', () => {
    const payload = realPullRequestEvent();
    payload.pull_request.head.sha = '';
    expect(pullRequestEventSchema.safeParse(payload).success).toBe(false);
  });

  it('rechaza un state desconocido y una fecha que no es ISO', () => {
    const bad = realPullRequestEvent();
    bad.pull_request.state = 'merged';
    expect(pullRequestEventSchema.safeParse(bad).success).toBe(false);
    const badDate = realPullRequestEvent();
    badDate.pull_request.created_at = 'ayer';
    expect(pullRequestEventSchema.safeParse(badDate).success).toBe(false);
  });
});

function reviewEvent() {
  return {
    action: 'submitted',
    review: { id: 1, user: { login: 'luis' }, state: 'approved', submitted_at: '2026-11-15T14:15:00Z', body: null },
    pull_request: {
      html_url: 'https://github.com/forja/app/pull/7',
      user: { login: 'ana' },
      requested_reviewers: [],
    },
    repository: { html_url: 'https://github.com/forja/app' },
  };
}

function checkRunEvent() {
  return {
    action: 'completed',
    check_run: {
      id: 101, name: 'lint', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success',
      check_suite: { id: 55 }, pull_requests: [],
    },
    repository: { html_url: 'https://github.com/forja/app' },
  };
}

function checkSuiteEvent() {
  return {
    action: 'completed',
    check_suite: { id: 55, head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'failure' },
    repository: { html_url: 'https://github.com/forja/app' },
  };
}

describe('esquemas de pull_request_review, check_run y check_suite', () => {
  it('aceptan payloads reales', () => {
    expect(pullRequestReviewEventSchema.parse(reviewEvent()).review.state).toBe('approved');
    expect(checkRunEventSchema.parse(checkRunEvent()).check_run.check_suite.id).toBe(55);
    expect(checkSuiteEventSchema.parse(checkSuiteEvent()).check_suite.conclusion).toBe('failure');
  });

  it('aceptan status y conclusion desconocidos o nulos', () => {
    const run = checkRunEvent();
    run.check_run.status = 'algo_nuevo';
    (run.check_run as { conclusion: string | null }).conclusion = null;
    expect(checkRunEventSchema.safeParse(run).success).toBe(true);
    const suite = checkSuiteEvent() as { check_suite: Record<string, unknown> };
    suite.check_suite.status = null;
    suite.check_suite.conclusion = null;
    expect(checkSuiteEventSchema.safeParse(suite).success).toBe(true);
  });

  it('rechazan una html_url sin https', () => {
    const review = reviewEvent();
    review.pull_request.html_url = 'http://github.com/forja/app/pull/7';
    expect(pullRequestReviewEventSchema.safeParse(review).success).toBe(false);
    const run = checkRunEvent();
    run.repository.html_url = 'javascript:alert(1)';
    expect(checkRunEventSchema.safeParse(run).success).toBe(false);
    const suite = checkSuiteEvent();
    suite.repository.html_url = 'ftp://github.com/forja/app';
    expect(checkSuiteEventSchema.safeParse(suite).success).toBe(false);
  });

  it('rechazan ids no enteros', () => {
    const run = checkRunEvent();
    run.check_run.id = 1.5;
    expect(checkRunEventSchema.safeParse(run).success).toBe(false);
    const runSuite = checkRunEvent();
    (runSuite.check_run.check_suite as { id: unknown }).id = '55';
    expect(checkRunEventSchema.safeParse(runSuite).success).toBe(false);
    const suite = checkSuiteEvent();
    suite.check_suite.id = -3;
    expect(checkSuiteEventSchema.safeParse(suite).success).toBe(false);
  });

  it('rechazan un nombre de check de más de 255 caracteres y un state de revisión de más de 50', () => {
    const run = checkRunEvent();
    run.check_run.name = 'x'.repeat(256);
    expect(checkRunEventSchema.safeParse(run).success).toBe(false);
    const review = reviewEvent();
    review.review.state = 'x'.repeat(51);
    expect(pullRequestReviewEventSchema.safeParse(review).success).toBe(false);
  });
});
