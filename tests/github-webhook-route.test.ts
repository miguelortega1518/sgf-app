import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  logAudit: vi.fn(),
  notify: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }));
// applyStatusTransition real, envuelto para poder forzar un rechazo en un caso concreto.
vi.mock('@/lib/task-transitions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/task-transitions')>();
  return { ...actual, applyStatusTransition: vi.fn(actual.applyStatusTransition) };
});

import { POST } from '../src/app/api/integrations/github/webhook/route';
import { logger } from '../src/lib/logger';
import { applyStatusTransition } from '../src/lib/task-transitions';
import { tasks, spaces, evidence, githubDeliveries, githubPullRequests } from '../src/lib/db/schema';
import type { GithubPullRequest } from '../src/lib/db/schema';

const applyMock = vi.mocked(applyStatusTransition);

const SECRET = 'secreto-del-webhook';
const GITHUB_ID = crypto.randomUUID();
const taskId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const ana = crypto.randomUUID();
const carla = crypto.randomUUID();
const REPO_URL = 'https://github.com/forja/app';
const PR_URL = `${REPO_URL}/pull/7`;
const CREATED_AT = '2026-11-15T12:00:00.000Z';
const UPDATED_AT = '2026-11-15T13:00:00.000Z';
const CLOSED_AT = '2026-11-16T10:00:00.000Z';
const SHA = 'abc';

type TaskRow = {
  id: string; number: number; title: string; spaceId: string; status: string;
  responsibleId: string; reviewerId: string | null; branch: string | null; prUrl: string | null;
  requiresApproval: boolean; requiresEvidence: boolean; archived: boolean;
};

let baseTask: TaskRow;
let taskQueue: (TaskRow | null)[];
let spaceStatus: string;
let actorRows: { id: string }[];
let seenDeliveries: Set<string>;
let fromTables: unknown[];
let forCalls: string[];
let prForCalls: string[];
let prRows: GithubPullRequest[];
let inserts: { table: unknown; values: Record<string, unknown> }[];
let updates: { table: unknown; input: Record<string, unknown> }[];

function makePrRow(overrides: Partial<GithubPullRequest> = {}): GithubPullRequest {
  return {
    url: PR_URL, taskId, number: 7, title: 'Filtros guardados', state: 'abierto', headSha: SHA,
    authorLogin: 'ana', openedAt: new Date(CREATED_AT), readyAt: null, mergedAt: null, closedAt: null,
    firstReviewAt: null, reviewers: [], checks: null, updatedAt: new Date(UPDATED_AT),
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: taskId, number: 12, title: 'Filtros guardados', spaceId, status: 'en_proceso',
    responsibleId: ana, reviewerId: carla, branch: null, prUrl: null,
    requiresApproval: false, requiresEvidence: false, archived: false,
    ...overrides,
  };
}

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function webhook(
  event: string,
  payload: unknown,
  opts: { delivery?: string | null; signature?: string | null; raw?: string } = {},
) {
  const body = opts.raw ?? JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-github-event': event };
  const signature = opts.signature === undefined ? sign(body) : opts.signature;
  if (signature !== null) headers['x-hub-signature-256'] = signature;
  const delivery = opts.delivery === undefined ? 'delivery-1' : opts.delivery;
  if (delivery !== null) headers['x-github-delivery'] = delivery;
  return new NextRequest('http://localhost/api/integrations/github/webhook', { method: 'POST', body, headers });
}

function prPayload(
  action: string,
  pr: {
    draft?: boolean; merged?: boolean | null; ref?: string; title?: string; body?: string | null;
    sha?: string; requested?: string[]; requestedReviewer?: string;
  } = {},
) {
  // Un PR cerrado lleva state=closed y closed_at; si está fusionado, también merged_at.
  const closed = action === 'closed';
  const merged = pr.merged ?? false;
  return {
    action,
    number: 7,
    ...(pr.requestedReviewer ? { requested_reviewer: { login: pr.requestedReviewer } } : {}),
    pull_request: {
      html_url: PR_URL,
      number: 7,
      state: closed ? 'closed' : 'open',
      title: pr.title ?? 'Filtros guardados',
      body: pr.body ?? null,
      draft: pr.draft ?? false,
      merged,
      created_at: CREATED_AT,
      updated_at: UPDATED_AT,
      closed_at: closed ? CLOSED_AT : null,
      merged_at: closed && merged ? CLOSED_AT : null,
      head: { ref: pr.ref ?? 'feat/FOR-12-filtros', sha: pr.sha ?? SHA },
      user: { login: 'ana' },
      requested_reviewers: (pr.requested ?? []).map(login => ({ login })),
    },
    repository: { full_name: 'forja/app', html_url: REPO_URL, default_branch: 'main' },
  };
}

function reviewPayload(
  action: string,
  review: { login?: string; state?: string; submittedAt?: string | null; requested?: string[] } = {},
) {
  return {
    action,
    review: {
      id: 1,
      user: { login: review.login ?? 'luis' },
      state: review.state ?? 'approved',
      submitted_at: review.submittedAt === undefined ? '2026-11-15T14:15:00Z' : review.submittedAt,
    },
    pull_request: {
      html_url: PR_URL,
      user: { login: 'ana' },
      requested_reviewers: (review.requested ?? []).map(login => ({ login })),
    },
    repository: { html_url: REPO_URL },
  };
}

function checkRunPayload(
  action: string,
  run: { id?: number; name?: string; sha?: string; status?: string; conclusion?: string | null; repo?: string } = {},
) {
  return {
    action,
    check_run: {
      id: run.id ?? 101,
      name: run.name ?? 'lint',
      head_sha: run.sha ?? SHA,
      status: run.status ?? 'completed',
      conclusion: run.conclusion === undefined ? 'success' : run.conclusion,
      check_suite: { id: 55 },
      pull_requests: [],
    },
    repository: { html_url: run.repo ?? REPO_URL },
  };
}

function checkSuitePayload(action: string, suite: { sha?: string; status?: string | null; conclusion?: string | null } = {}) {
  return {
    action,
    check_suite: {
      id: 55,
      head_sha: suite.sha ?? SHA,
      status: suite.status === undefined ? 'completed' : suite.status,
      conclusion: suite.conclusion === undefined ? 'failure' : suite.conclusion,
    },
    repository: { html_url: REPO_URL },
  };
}

function pushPayload(ref: string, messages: string[], defaultBranch = 'main') {
  return {
    ref,
    repository: { full_name: 'forja/app', default_branch: defaultBranch },
    commits: messages.map((message, i) => ({ id: `c${i}`, message })),
  };
}

function txChain() {
  let table: unknown;
  const builder: Record<string, unknown> = {};
  builder.from = (t: unknown) => { table = t; fromTables.push(t); return builder; };
  builder.where = () => builder;
  builder.limit = () => builder;
  builder.orderBy = () => builder;
  builder.for = (mode: string) => {
    forCalls.push(mode);
    if (table === githubPullRequests) prForCalls.push(mode);
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    let rows: unknown[] = [];
    if (table === tasks) {
      const next = taskQueue.length ? taskQueue.shift()! : baseTask;
      rows = next ? [{ ...next }] : [];
    } else if (table === spaces) {
      rows = [{ id: spaceId, status: spaceStatus }];
    } else if (table === evidence) {
      rows = [];
    } else if (table === githubPullRequests) {
      rows = prRows.map(r => structuredClone(r));
    }
    return Promise.resolve(rows).then(resolve, reject);
  };
  return builder;
}

// db.select() fuera de la transacción: la persona GitHub o las filas candidatas del panel.
function dbChain() {
  let table: unknown;
  const builder: Record<string, unknown> = {};
  builder.from = (t: unknown) => { table = t; return builder; };
  for (const method of ['where', 'limit', 'orderBy']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(table === githubPullRequests ? prRows.map(r => structuredClone(r)) : actorRows).then(resolve, reject);
  return builder;
}

function prInserts() {
  return inserts.filter(i => i.table === githubPullRequests).map(i => i.values);
}

function prUpdates() {
  return updates.filter(u => u.table === githubPullRequests).map(u => u.input);
}

function deliveryInserts() {
  return inserts.filter(i => i.table === githubDeliveries);
}

const tx = { select: mocks.txSelect, insert: mocks.txInsert, update: mocks.txUpdate };

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

function auditActions() {
  return mocks.logAudit.mock.calls.map(c => c[0].action);
}

function taskUpdates() {
  return updates.filter(u => u.table === tasks).map(u => u.input);
}

let previousSecret: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  previousSecret = process.env.GITHUB_WEBHOOK_SECRET;
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;

  baseTask = makeTask();
  taskQueue = [];
  spaceStatus = 'activo';
  actorRows = [{ id: GITHUB_ID }];
  seenDeliveries = new Set();
  fromTables = [];
  forCalls = [];
  prForCalls = [];
  prRows = [];
  inserts = [];
  updates = [];

  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});

  mocks.logAudit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(null);
  mocks.select.mockImplementation(() => dbChain());
  mocks.txSelect.mockImplementation(() => txChain());
  mocks.txInsert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      inserts.push({ table, values });
      if (table === githubPullRequests) prRows.push({ ...(values as GithubPullRequest) });
      return {
        onConflictDoNothing: () => ({
          returning: async () => {
            const id = values.deliveryId as string;
            if (seenDeliveries.has(id)) return [];
            seenDeliveries.add(id);
            return [{ ...values }];
          },
        }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve([]).then(resolve, reject),
      };
    },
  }));
  mocks.txUpdate.mockImplementation((table: unknown) => ({
    set: (input: Record<string, unknown>) => {
      updates.push({ table, input });
      // El mock no evalúa el where: con una sola fila del PR, la actualiza.
      if (table === githubPullRequests && prRows.length === 1) prRows[0] = { ...prRows[0], ...input };
      const result = table === tasks ? [{ ...baseTask, ...input }] : [];
      const builder: Record<string, unknown> = {
        where: () => builder,
        returning: async () => result,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  }));
  mocks.transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
  else process.env.GITHUB_WEBHOOK_SECRET = previousSecret;
  vi.restoreAllMocks();
});

function expectNoDbAccess() {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
}

describe('POST /api/integrations/github/webhook: autenticación', () => {
  it('sin GITHUB_WEBHOOK_SECRET responde 401 sin tocar la base', async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const res = await POST(webhook('pull_request', prPayload('opened'), { signature: sign('x', '') }));
    expect(res.status).toBe(401);
    expectNoDbAccess();
  });

  it('con GITHUB_WEBHOOK_SECRET vacío responde 401', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = '';
    const body = JSON.stringify(prPayload('opened'));
    const res = await POST(webhook('pull_request', null, { raw: body, signature: sign(body, '') }));
    expect(res.status).toBe(401);
    expectNoDbAccess();
  });

  it('sin cabecera X-Hub-Signature-256 responde 401', async () => {
    const res = await POST(webhook('pull_request', prPayload('opened'), { signature: null }));
    expect(res.status).toBe(401);
    expectNoDbAccess();
  });

  it('con una firma de otro secreto responde 401', async () => {
    const body = JSON.stringify(prPayload('opened'));
    const res = await POST(webhook('pull_request', null, { raw: body, signature: sign(body, 'otro') }));
    expect(res.status).toBe(401);
    expectNoDbAccess();
  });

  it.each([
    ['sin prefijo', 'a'.repeat(64)],
    ['hex corto', 'sha256=abc'],
    ['no hex', `sha256=${'g'.repeat(64)}`],
  ])('con una firma con formato inválido (%s) responde 401', async (_name, signature) => {
    const res = await POST(webhook('pull_request', prPayload('opened'), { signature }));
    expect(res.status).toBe(401);
    expectNoDbAccess();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('lee el secreto en cada petición', async () => {
    process.env.GITHUB_WEBHOOK_SECRET = 'rotado';
    const body = JSON.stringify({ zen: 'hola' });
    const viejo = await POST(webhook('ping', null, { raw: body, signature: sign(body) }));
    expect(viejo.status).toBe(401);
    const nuevo = await POST(webhook('ping', null, { raw: body, signature: sign(body, 'rotado') }));
    expect(nuevo.status).toBe(200);
  });
});

describe('POST /api/integrations/github/webhook: eventos ignorados y entrada inválida', () => {
  it.each(['ping', 'issues', 'pull_request_review_comment', 'status'])('X-GitHub-Event %s → 200 { ignored: true } sin tocar la base', async (event) => {
    const res = await POST(webhook(event, { zen: 'hola' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it.each([
    ['ausente', null],
    ['vacía', ''],
    ['de más de 200 caracteres', 'x'.repeat(201)],
  ])('pull_request con X-GitHub-Delivery %s → 400', async (_name, delivery) => {
    const res = await POST(webhook('pull_request', prPayload('opened'), { delivery }));
    expect(res.status).toBe(400);
    expectNoDbAccess();
  });

  it('push sin X-GitHub-Delivery → 400', async () => {
    const res = await POST(webhook('push', pushPayload('refs/heads/main', ['Closes FOR-12']), { delivery: null }));
    expect(res.status).toBe(400);
    expectNoDbAccess();
  });

  it('un cuerpo firmado que no es JSON → 400 sin logger.error', async () => {
    const res = await POST(webhook('pull_request', null, { raw: '{no es json' }));
    expect(res.status).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
    expectNoDbAccess();
  });

  it('un payload que no cumple el esquema → 400', async () => {
    const payload = prPayload('opened') as { pull_request: Record<string, unknown> };
    delete payload.pull_request.head;
    const res = await POST(webhook('pull_request', payload));
    expect(res.status).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
    expectNoDbAccess();
  });

  it('un html_url que no es https → 400', async () => {
    const payload = prPayload('opened');
    payload.pull_request.html_url = 'javascript:alert(1)';
    const res = await POST(webhook('pull_request', payload));
    expect(res.status).toBe(400);
    expectNoDbAccess();
  });

  it.each(['labeled', 'assigned', 'auto_merge_enabled'])('pull_request %s → 200 { ignored: true }', async (action) => {
    const res = await POST(webhook('pull_request', prPayload(action)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it('pull_request sin clave FOR-<n> → 200 { ignored: true }', async () => {
    const res = await POST(webhook('pull_request', prPayload('opened', { ref: 'feat/filtros', title: 'Filtros' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it('push a una rama que no es la por defecto → 200 { ignored: true }', async () => {
    const res = await POST(webhook('push', pushPayload('refs/heads/feat/FOR-12', ['Closes FOR-12'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it('push a la rama por defecto sin Closes/Fixes/Resolves → 200 { ignored: true }', async () => {
    const res = await POST(webhook('push', pushPayload('refs/heads/main', ['Refs FOR-12', 'chore: limpieza'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });
});

describe('POST /api/integrations/github/webhook: enlace y PR abierto', () => {
  it('opened enlaza la rama y el PR, pasa a en_revision y audita con el actor GitHub en el mismo tx', async () => {
    const res = await POST(webhook('pull_request', prPayload('opened')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });

    expect(inserts[0]).toEqual({ table: githubDeliveries, values: { deliveryId: 'delivery-1', event: 'pull_request' } });
    expect(forCalls).toContain('update');
    expect(taskUpdates()[0]).toEqual({ branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    expect(taskUpdates()[1]).toEqual(expect.objectContaining({ status: 'en_revision' }));

    expect(mocks.logAudit).toHaveBeenCalledWith(
      { actorId: GITHUB_ID, action: 'pr_linked', taskId, previousValue: undefined, newValue: PR_URL },
      tx,
    );
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: GITHUB_ID, action: 'status_changed', taskId, previousValue: 'en_proceso', newValue: 'en_revision' }),
      tx,
    );
    expect(applyMock).toHaveBeenCalledWith(
      tx, { id: GITHUB_ID, role: 'miembro' }, expect.objectContaining({ id: taskId }),
      expect.objectContaining({ status: 'activo' }), { status: 'en_revision' }, { mergedOnGitHub: false },
    );

    const outcomeUpdate = updates.find(u => u.table === githubDeliveries);
    expect(outcomeUpdate?.input).toEqual({ outcome: 'FOR-12: aplicado' });
  });

  it('envía el aviso al revisor después de resolverse la transacción', async () => {
    let notifyCallsInsideTx = -1;
    mocks.transaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
      const result = await fn(tx);
      notifyCallsInsideTx = mocks.notify.mock.calls.length;
      return result;
    });

    const res = await POST(webhook('pull_request', prPayload('opened')));

    expect(res.status).toBe(200);
    expect(notifyCallsInsideTx).toBe(0);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: carla, type: 'task_review', taskId }));
  });

  it('un fallo de notify no rompe la respuesta', async () => {
    mocks.notify.mockRejectedValue(new Error('caído'));
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
  });

  it('busca la clave en el título si la rama no la tiene, sin distinguir mayúsculas', async () => {
    const res = await POST(webhook('pull_request', prPayload('opened', { ref: 'feat/filtros', title: 'for-12 Filtros' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
    expect(taskUpdates()[0]).toEqual({ branch: 'feat/filtros', prUrl: PR_URL });
  });

  it('si el enlace y el panel ya coinciden y la tarea está en en_revision no escribe ni audita', async () => {
    baseTask = makeTask({ status: 'en_revision', branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    prRows = [makePrRow()];
    const res = await POST(webhook('pull_request', prPayload('reopened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_cambios' }] });
    expect(taskUpdates()).toEqual([]);
    expect(prInserts()).toEqual([]);
    expect(prUpdates()).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(updates.find(u => u.table === githubDeliveries)?.input).toEqual({ outcome: 'FOR-12: sin_cambios' });
  });

  it('pr_linked guarda el pr_url anterior como previousValue', async () => {
    baseTask = makeTask({ status: 'en_revision', branch: 'feat/FOR-12-viejo', prUrl: 'https://github.com/forja/app/pull/3' });
    await POST(webhook('pull_request', prPayload('opened')));
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pr_linked', previousValue: 'https://github.com/forja/app/pull/3', newValue: PR_URL }),
      tx,
    );
    expect(auditActions()).toEqual(['pr_linked']);
  });

  it('un PR opened en borrador sólo enlaza', async () => {
    const res = await POST(webhook('pull_request', prPayload('opened', { draft: true })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
    expect(auditActions()).toEqual(['pr_linked']);
    expect(applyMock).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('ready_for_review pasa a en_revision', async () => {
    baseTask = makeTask({ branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('ready_for_review')));
    expect(res.status).toBe(200);
    expect(auditActions()).toEqual(['status_changed']);
    expect(mocks.logAudit.mock.calls[0][0].newValue).toBe('en_revision');
  });
});

describe('POST /api/integrations/github/webhook: idempotencia', () => {
  it('un delivery ya procesado → 200 { duplicate: true } sin más cambios', async () => {
    seenDeliveries.add('delivery-1');
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicate: true });
    expect(fromTables).not.toContain(tasks);
    expect(updates).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('la segunda entrega con el mismo delivery no produce cambios', async () => {
    const first = await POST(webhook('pull_request', prPayload('opened')));
    expect(first.status).toBe(200);
    const auditCalls = mocks.logAudit.mock.calls.length;
    const notifyCalls = mocks.notify.mock.calls.length;
    const updateCount = updates.length;
    expect(auditCalls).toBe(2);

    const second = await POST(webhook('pull_request', prPayload('opened')));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
    expect(mocks.logAudit.mock.calls.length).toBe(auditCalls);
    expect(mocks.notify.mock.calls.length).toBe(notifyCalls);
    expect(updates.length).toBe(updateCount);
  });
});

describe('POST /api/integrations/github/webhook: reglas de estado', () => {
  it('closed con merged → completada', async () => {
    baseTask = makeTask({ status: 'en_revision', branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('closed', { merged: true })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: GITHUB_ID, action: 'status_changed', previousValue: 'en_revision', newValue: 'completada' }),
      tx,
    );
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: carla, type: 'task_completed' }));
  });

  it('closed con merged de una tarea de AI Factory → completada, sin volver a integrar desde Forja', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    baseTask = makeTask({ status: 'en_revision', labels: ['ai-factory'], branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('closed', { merged: true })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
    expect(applyMock.mock.calls[0][5]).toEqual({ mergedOnGitHub: true });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: GITHUB_ID, action: 'status_changed', newValue: 'completada' }), tx);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('closed sin merge desde en_revision → en_proceso', async () => {
    baseTask = makeTask({ status: 'en_revision', branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('closed', { merged: false })));
    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'status_changed', previousValue: 'en_revision', newValue: 'en_proceso' }),
      tx,
    );
  });

  it('closed sin merge desde no_iniciada no cambia el estado', async () => {
    baseTask = makeTask({ status: 'no_iniciada', branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    prRows = [makePrRow({ state: 'cerrado', closedAt: new Date(CLOSED_AT) })];
    const res = await POST(webhook('pull_request', prPayload('closed', { merged: false })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_cambios' }] });
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('una tarea completada no se mueve', async () => {
    baseTask = makeTask({ status: 'completada', branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('reopened')));
    expect(res.status).toBe(200);
    expect(applyMock).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('push a refs/heads/main con "Closes FOR-12" → completada', async () => {
    const res = await POST(webhook('push', pushPayload('refs/heads/main', ['feat: filtros\n\nCloses FOR-12'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
    expect(inserts[0].values).toEqual({ deliveryId: 'delivery-1', event: 'push' });
    expect(auditActions()).toEqual(['status_changed']);
    expect(mocks.logAudit.mock.calls[0][0]).toEqual(expect.objectContaining({ actorId: GITHUB_ID, newValue: 'completada' }));
    expect(taskUpdates().some(u => 'branch' in u || 'prUrl' in u)).toBe(false);
  });

  it('push con la rama por defecto distinta de main', async () => {
    const res = await POST(webhook('push', pushPayload('refs/heads/develop', ['Fixes FOR-12'], 'develop')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
  });

  it('push con varias claves procesa cada una y resume el resultado', async () => {
    taskQueue = [makeTask(), null];
    const res = await POST(webhook('push', pushPayload('refs/heads/main', ['Closes FOR-12', 'Fixes FOR-13', 'resolves for-12'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      delivery: 'delivery-1',
      results: [{ taskNumber: 12, outcome: 'aplicado' }, { taskNumber: 13, outcome: 'sin_tarea' }],
    });
    expect(updates.find(u => u.table === githubDeliveries)?.input).toEqual({ outcome: 'FOR-12: aplicado, FOR-13: sin_tarea' });
  });
});

describe('POST /api/integrations/github/webhook: excepciones', () => {
  it('merge de una tarea con requiresApproval en en_revision no la completa', async () => {
    baseTask = makeTask({ status: 'en_revision', requiresApproval: true, branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    prRows = [makePrRow({ state: 'fusionado', mergedAt: new Date(CLOSED_AT), closedAt: new Date(CLOSED_AT) })];
    const res = await POST(webhook('pull_request', prPayload('closed', { merged: true })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_cambios' }] });
    expect(mocks.logAudit.mock.calls.some(c => c[0].newValue === 'completada')).toBe(false);
    expect(taskUpdates()).toEqual([]);
  });

  it('merge de una tarea con requiresApproval en en_proceso la pasa a en_revision', async () => {
    baseTask = makeTask({ status: 'en_proceso', requiresApproval: true, branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('closed', { merged: true })));
    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'status_changed', newValue: 'en_revision' }),
      tx,
    );
  });

  it('push con requiresEvidence y la tarea ya en en_revision no cambia nada', async () => {
    baseTask = makeTask({ status: 'en_revision', requiresEvidence: true });
    const res = await POST(webhook('push', pushPayload('refs/heads/main', ['Closes FOR-12'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_cambios' }] });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('un proyecto cerrado → rechazado: actualiza el panel, pero no toca la tarea ni audita', async () => {
    spaceStatus = 'cerrado';
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'rechazado' }] });
    expect(taskUpdates()).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
    expect(prInserts()).toHaveLength(1);
    expect(prInserts()[0]).toEqual(expect.objectContaining({ url: PR_URL, taskId, state: 'abierto' }));
  });

  it('una tarea inexistente → sin_tarea con 200 y sin fila del PR', async () => {
    taskQueue = [null];
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_tarea' }] });
    expect(prInserts()).toEqual([]);
    expect(prUpdates()).toEqual([]);
    expect(updates.filter(u => u.table === tasks)).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(updates.find(u => u.table === githubDeliveries)?.input).toEqual({ outcome: 'FOR-12: sin_tarea' });
  });

  it('un rechazo con httpStatus de la transición → rechazado y logger.warn, sin lanzar', async () => {
    baseTask = makeTask({ branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    applyMock.mockRejectedValueOnce(httpError('Se requiere evidencia para completar esta tarea', 400));
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'rechazado' }] });
    expect(logger.warn).toHaveBeenCalledWith('github_transition_rejected', {
      delivery: 'delivery-1', taskNumber: 12, message: 'Se requiere evidencia para completar esta tarea',
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('otro error dentro de la transacción → 500 con referencia y sin avisos', async () => {
    applyMock.mockRejectedValueOnce(new Error('conexión perdida'));
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('(ref.');
    expect(logger.error).toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('si la persona GitHub no existe → 500 con referencia y sin transacción', async () => {
    actorRows = [];
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('(ref.');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe('POST /api/integrations/github/webhook: panel del PR en eventos pull_request', () => {
  it.each([
    ['opened', {}, 'abierto'],
    ['reopened', {}, 'abierto'],
    ['ready_for_review', {}, 'abierto'],
    ['converted_to_draft', { draft: true }, 'borrador'],
    ['synchronize', {}, 'abierto'],
    ['closed', { merged: true }, 'fusionado'],
    ['review_requested', { requestedReviewer: 'luis', requested: ['luis'] }, 'abierto'],
    ['review_request_removed', {}, 'abierto'],
    ['edited', {}, 'abierto'],
  ] as const)('%s crea la fila del PR con estado %s', async (action, opts, state) => {
    const res = await POST(webhook('pull_request', prPayload(action, opts)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'aplicado' }] });
    expect(prForCalls).toContain('update');
    expect(prInserts()).toHaveLength(1);
    expect(prInserts()[0]).toEqual(expect.objectContaining({
      url: PR_URL, taskId, number: 7, title: 'Filtros guardados', state, headSha: SHA, authorLogin: 'ana',
      openedAt: new Date(CREATED_AT),
    }));
  });

  it('closed sin merge deja el PR cerrado con closed_at del payload', async () => {
    await POST(webhook('pull_request', prPayload('closed', { merged: false })));
    expect(prInserts()[0]).toEqual(expect.objectContaining({ state: 'cerrado', closedAt: new Date(CLOSED_AT), mergedAt: null }));
  });

  it.each([
    ['synchronize', {}],
    ['edited', {}],
    ['review_requested', { requestedReviewer: 'luis', requested: ['luis'] }],
    ['review_request_removed', {}],
    ['converted_to_draft', { draft: true }],
  ] as const)('%s no toca la tarea, ni transiciona, ni audita', async (action, opts) => {
    const res = await POST(webhook('pull_request', prPayload(action, opts)));
    expect(res.status).toBe(200);
    expect(taskUpdates()).toEqual([]);
    expect(applyMock).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(prInserts()).toHaveLength(1);
  });

  it('synchronize con otro sha actualiza head_sha y reinicia los checks', async () => {
    prRows = [makePrRow({
      checks: {
        sha: SHA, total: 2, success: 1, failure: 1, pending: 0, updatedAt: UPDATED_AT,
        runs: { lint: { id: 1, suiteId: 55, state: 'success' }, test: { id: 2, suiteId: 55, state: 'failure' } },
        suites: {},
      },
    })];
    const res = await POST(webhook('pull_request', prPayload('synchronize', { sha: 'nuevo' })));
    expect(res.status).toBe(200);
    expect(prUpdates()).toHaveLength(1);
    const update = prUpdates()[0];
    expect(update.headSha).toBe('nuevo');
    expect(update.checks).toEqual(expect.objectContaining({ sha: 'nuevo', total: 0, success: 0, failure: 0, pending: 0, runs: {}, suites: {} }));
    expect(update.updatedAt).toBeInstanceOf(Date);
  });

  it('ready_for_review fija ready_at con el updated_at del payload y no lo sobreescribe', async () => {
    prRows = [makePrRow({ state: 'borrador' })];
    await POST(webhook('pull_request', prPayload('ready_for_review')));
    expect(prUpdates()[0]).toEqual(expect.objectContaining({ state: 'abierto', readyAt: new Date(UPDATED_AT) }));

    const earlier = new Date('2026-11-15T12:30:00.000Z');
    prRows = [makePrRow({ readyAt: earlier, state: 'borrador' })];
    updates = [];
    await POST(webhook('pull_request', prPayload('ready_for_review'), { delivery: 'delivery-2' }));
    expect(prUpdates()[0].readyAt).toEqual(earlier);
  });

  it('reopened deja merged_at y closed_at en null', async () => {
    prRows = [makePrRow({ state: 'cerrado', closedAt: new Date(CLOSED_AT) })];
    await POST(webhook('pull_request', prPayload('reopened')));
    expect(prUpdates()[0]).toEqual(expect.objectContaining({ state: 'abierto', closedAt: null, mergedAt: null }));
  });

  it('review_requested deja pendiente a quien ya aprobó y añade a los pedidos', async () => {
    prRows = [makePrRow({ reviewers: [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-15T14:00:00.000Z' }] })];
    await POST(webhook('pull_request', prPayload('review_requested', { requestedReviewer: 'luis', requested: ['luis', 'carla'] })));
    const reviewers = prUpdates()[0].reviewers as { login: string; state: string }[];
    expect(reviewers.map(r => [r.login, r.state])).toEqual([['carla', 'pendiente'], ['luis', 'pendiente']]);
  });

  it('un edited que cambia la clave mueve la fila a la otra tarea', async () => {
    const otherTaskId = crypto.randomUUID();
    baseTask = makeTask({ id: otherTaskId, number: 13 });
    prRows = [makePrRow()];
    const res = await POST(webhook('pull_request', prPayload('edited', { ref: 'feat/filtros', title: 'FOR-13 Filtros' })));
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 13, outcome: 'aplicado' }] });
    expect(prUpdates()[0]).toEqual(expect.objectContaining({ taskId: otherTaskId, title: 'FOR-13 Filtros' }));
  });

  it('bloquea la tarea antes que la fila del PR', async () => {
    await POST(webhook('pull_request', prPayload('synchronize')));
    const taskIdx = fromTables.indexOf(tasks);
    const prIdx = fromTables.indexOf(githubPullRequests);
    expect(taskIdx).toBeGreaterThanOrEqual(0);
    expect(prIdx).toBeGreaterThan(taskIdx);
  });
});

describe('POST /api/integrations/github/webhook: pull_request_review', () => {
  it('sin fila del PR → 200 { ignored: true } sin insertar la entrega', async () => {
    const res = await POST(webhook('pull_request_review', reviewPayload('submitted')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(deliveryInserts()).toEqual([]);
  });

  it('submitted actualiza los revisores y first_review_at, sin auditar', async () => {
    prRows = [makePrRow({ reviewers: [{ login: 'luis', state: 'pendiente' }] })];
    const res = await POST(webhook('pull_request_review', reviewPayload('submitted')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ prUrl: PR_URL, outcome: 'aplicado' }] });
    expect(deliveryInserts()[0].values).toEqual({ deliveryId: 'delivery-1', event: 'pull_request_review' });
    expect(prForCalls).toEqual(['update']);
    expect(prUpdates()).toHaveLength(1);
    expect(prUpdates()[0]).toEqual(expect.objectContaining({
      reviewers: [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-15T14:15:00Z' }],
      firstReviewAt: new Date('2026-11-15T14:15:00Z'),
    }));
    expect(fromTables).not.toContain(tasks);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(updates.find(u => u.table === githubDeliveries)?.input).toEqual({ outcome: `${PR_URL}: aplicado` });
  });

  it('no sobreescribe first_review_at', async () => {
    const first = new Date('2026-11-15T13:30:00.000Z');
    prRows = [makePrRow({ firstReviewAt: first })];
    await POST(webhook('pull_request_review', reviewPayload('submitted', { login: 'carla', state: 'commented' })));
    expect(prUpdates()[0].firstReviewAt).toEqual(first);
  });

  it('dismissed vuelve a pendiente a quien sigue pedido', async () => {
    prRows = [makePrRow({ reviewers: [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-15T14:15:00Z' }] })];
    await POST(webhook('pull_request_review', reviewPayload('dismissed', { state: 'dismissed', requested: ['luis'] })));
    const reviewers = prUpdates()[0].reviewers as { login: string; state: string }[];
    expect(reviewers.map(r => [r.login, r.state])).toEqual([['luis', 'pendiente']]);
  });

  it('una revisión que no cambia nada → sin_cambios sin update del PR', async () => {
    prRows = [makePrRow({
      reviewers: [{ login: 'luis', state: 'aprobado', submittedAt: '2026-11-15T15:00:00Z' }],
      firstReviewAt: new Date('2026-11-15T14:00:00Z'),
    })];
    const res = await POST(webhook('pull_request_review', reviewPayload('submitted', { state: 'commented' })));
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ prUrl: PR_URL, outcome: 'sin_cambios' }] });
    expect(prUpdates()).toEqual([]);
  });

  it('la revisión del autor se ignora sin tocar la base', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('pull_request_review', reviewPayload('submitted', { login: 'ana' })));
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it('otras acciones de review → { ignored: true } sin tocar la base', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('pull_request_review', reviewPayload('edited')));
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it('una entrega duplicada → { duplicate: true } sin update del PR', async () => {
    prRows = [makePrRow()];
    seenDeliveries.add('delivery-1');
    const res = await POST(webhook('pull_request_review', reviewPayload('submitted')));
    expect(await res.json()).toEqual({ duplicate: true });
    expect(prUpdates()).toEqual([]);
    expect(prForCalls).toEqual([]);
  });

  it('un payload inválido → 400 sin logger.error', async () => {
    const payload = reviewPayload('submitted');
    payload.pull_request.html_url = 'http://github.com/forja/app/pull/7';
    const res = await POST(webhook('pull_request_review', payload));
    expect(res.status).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
    expectNoDbAccess();
  });
});

describe('POST /api/integrations/github/webhook: check_run y check_suite', () => {
  it('check_run sin fila → { ignored: true } sin insertar la entrega', async () => {
    const res = await POST(webhook('check_run', checkRunPayload('completed')));
    expect(await res.json()).toEqual({ ignored: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(deliveryInserts()).toEqual([]);
  });

  it('check_run de otro sha no escribe', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('check_run', checkRunPayload('completed', { sha: 'otro' })));
    expect(await res.json()).toEqual({ ignored: true });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(prUpdates()).toEqual([]);
  });

  it('check_run de otro repositorio no escribe', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('check_run', checkRunPayload('completed', { repo: 'https://github.com/forja/otro' })));
    expect(await res.json()).toEqual({ ignored: true });
    expect(prUpdates()).toEqual([]);
  });

  it('check_run del sha actual actualiza los checks con FOR UPDATE', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('check_run', checkRunPayload('completed', { conclusion: 'failure' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ prUrl: PR_URL, outcome: 'aplicado' }] });
    expect(deliveryInserts()[0].values).toEqual({ deliveryId: 'delivery-1', event: 'check_run' });
    expect(prForCalls).toEqual(['update']);
    expect(prUpdates()[0].checks).toEqual(expect.objectContaining({ sha: SHA, total: 1, success: 0, failure: 1, pending: 0 }));
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('agrega varios check_run en entregas distintas', async () => {
    prRows = [makePrRow()];
    await POST(webhook('check_run', checkRunPayload('completed', { id: 1, name: 'lint' }), { delivery: 'd1' }));
    await POST(webhook('check_run', checkRunPayload('created', { id: 2, name: 'test', status: 'queued', conclusion: null }), { delivery: 'd2' }));
    expect(prRows[0].checks).toEqual(expect.objectContaining({ total: 2, success: 1, pending: 1 }));
  });

  it('check_suite completed cuenta la suite si no hay runs', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('check_suite', checkSuitePayload('completed')));
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ prUrl: PR_URL, outcome: 'aplicado' }] });
    expect(prUpdates()[0].checks).toEqual(expect.objectContaining({ total: 1, failure: 1 }));
  });

  it.each(['requested', 'rerequested'])('check_suite %s cuenta como pendiente', async (action) => {
    prRows = [makePrRow()];
    await POST(webhook('check_suite', checkSuitePayload(action, { status: 'queued', conclusion: null })));
    expect(prUpdates()[0].checks).toEqual(expect.objectContaining({ total: 1, pending: 1 }));
  });

  it('otras acciones de check_suite → { ignored: true }', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('check_suite', checkSuitePayload('otra_accion')));
    expect(await res.json()).toEqual({ ignored: true });
    expectNoDbAccess();
  });

  it('check_suite de otro sha no escribe', async () => {
    prRows = [makePrRow()];
    const res = await POST(webhook('check_suite', checkSuitePayload('completed', { sha: 'otro' })));
    expect(await res.json()).toEqual({ ignored: true });
    expect(prUpdates()).toEqual([]);
  });

  it('una entrega duplicada de check_run → { duplicate: true } sin update', async () => {
    prRows = [makePrRow()];
    seenDeliveries.add('delivery-1');
    const res = await POST(webhook('check_run', checkRunPayload('completed')));
    expect(await res.json()).toEqual({ duplicate: true });
    expect(prUpdates()).toEqual([]);
  });

  it.each([
    ['check_run', () => { const p = checkRunPayload('completed'); p.check_run.id = 1.5; return p; }],
    ['check_run', () => { const p = checkRunPayload('completed'); p.repository.html_url = 'http://github.com/forja/app'; return p; }],
    ['check_suite', () => { const p = checkSuitePayload('completed'); p.check_suite.id = -1; return p; }],
  ] as const)('%s inválido → 400 sin logger.error', async (event, build) => {
    prRows = [makePrRow()];
    const res = await POST(webhook(event, build()));
    expect(res.status).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
    expectNoDbAccess();
  });
});
