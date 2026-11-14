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
import { tasks, spaces, evidence, githubDeliveries } from '../src/lib/db/schema';

const applyMock = vi.mocked(applyStatusTransition);

const SECRET = 'secreto-del-webhook';
const GITHUB_ID = crypto.randomUUID();
const taskId = crypto.randomUUID();
const spaceId = crypto.randomUUID();
const ana = crypto.randomUUID();
const carla = crypto.randomUUID();
const PR_URL = 'https://github.com/forja/app/pull/7';

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
let inserts: { table: unknown; values: Record<string, unknown> }[];
let updates: { table: unknown; input: Record<string, unknown> }[];

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
  pr: { draft?: boolean; merged?: boolean | null; ref?: string; title?: string; body?: string | null } = {},
) {
  return {
    action,
    number: 7,
    pull_request: {
      html_url: PR_URL,
      number: 7,
      title: pr.title ?? 'Filtros guardados',
      body: pr.body ?? null,
      draft: pr.draft ?? false,
      merged: pr.merged ?? false,
      head: { ref: pr.ref ?? 'feat/FOR-12-filtros', sha: 'abc' },
      user: { login: 'ana' },
    },
    repository: { full_name: 'forja/app', default_branch: 'main' },
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
  builder.for = (mode: string) => { forCalls.push(mode); return builder; };
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    let rows: unknown[] = [];
    if (table === tasks) {
      const next = taskQueue.length ? taskQueue.shift()! : baseTask;
      rows = next ? [{ ...next }] : [];
    } else if (table === spaces) {
      rows = [{ id: spaceId, status: spaceStatus }];
    } else if (table === evidence) {
      rows = [];
    }
    return Promise.resolve(rows).then(resolve, reject);
  };
  return builder;
}

function dbChain(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
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
  inserts = [];
  updates = [];

  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});

  mocks.logAudit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(null);
  mocks.select.mockImplementation(() => dbChain(actorRows));
  mocks.txSelect.mockImplementation(() => txChain());
  mocks.txInsert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return {
        onConflictDoNothing: () => ({
          returning: async () => {
            const id = values.deliveryId as string;
            if (seenDeliveries.has(id)) return [];
            seenDeliveries.add(id);
            return [{ ...values }];
          },
        }),
      };
    },
  }));
  mocks.txUpdate.mockImplementation((table: unknown) => ({
    set: (input: Record<string, unknown>) => {
      updates.push({ table, input });
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
  it.each(['ping', 'issues', 'pull_request_review'])('X-GitHub-Event %s → 200 { ignored: true } sin tocar la base', async (event) => {
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

  it.each(['synchronize', 'edited', 'labeled'])('pull_request %s → 200 { ignored: true }', async (action) => {
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
      expect.objectContaining({ status: 'activo' }), { status: 'en_revision' },
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

  it('si el enlace ya coincide y la tarea está en en_revision no escribe ni audita', async () => {
    baseTask = makeTask({ status: 'en_revision', branch: 'feat/FOR-12-filtros', prUrl: PR_URL });
    const res = await POST(webhook('pull_request', prPayload('reopened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_cambios' }] });
    expect(taskUpdates()).toEqual([]);
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

  it('un proyecto cerrado → rechazado, sin tocar la tarea ni auditar', async () => {
    spaceStatus = 'cerrado';
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'rechazado' }] });
    expect(taskUpdates()).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('una tarea inexistente → sin_tarea con 200', async () => {
    taskQueue = [null];
    const res = await POST(webhook('pull_request', prPayload('opened')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivery: 'delivery-1', results: [{ taskNumber: 12, outcome: 'sin_tarea' }] });
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
