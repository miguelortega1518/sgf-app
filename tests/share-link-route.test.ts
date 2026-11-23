import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireProjectAccess: vi.fn(),
  logAudit: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txValues: vi.fn(),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
  tx: {} as Record<string, unknown>,
}));
mocks.tx.select = mocks.txSelect;
mocks.tx.insert = mocks.txInsert;
mocks.tx.update = mocks.txUpdate;

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock('@/lib/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/project-access', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/project-access')>()),
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock('@/lib/db/schema', () => ({
  spaceShareLinks: {
    __name: 'space_share_links',
    spaceId: 'ssl.spaceId', tokenHash: 'ssl.tokenHash', createdBy: 'ssl.createdBy',
    createdAt: 'ssl.createdAt', revokedAt: 'ssl.revokedAt',
  },
  spaceMembers: { __name: 'space_members', spaceId: 'sm.spaceId', personId: 'sm.personId', spaceRole: 'sm.spaceRole' },
  spaces: { __name: 'spaces', id: 'spaces.id' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  isNull: (col: unknown) => ({ op: 'isNull', col }),
}));

import { DELETE, GET, POST } from '../src/app/api/spaces/[id]/share-link/route';
import { logger } from '../src/lib/logger';

const spaceId = crypto.randomUUID();
const userId = crypto.randomUUID();
const ownerId = crypto.randomUUID();
const createdAt = new Date('2026-11-20T15:00:00Z');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type SpaceRow = { id: string; name: string; status: string; ownerId: string };

let space: SpaceRow;
let activeLinks: { createdAt: Date }[];
let membership: { spaceRole: string }[];
let revokedRows: unknown[];
let insertError: unknown;
let loggerError: ReturnType<typeof vi.spyOn>;
let loggerWarn: ReturnType<typeof vi.spyOn>;
let loggerInfo: ReturnType<typeof vi.spyOn>;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

function ctx(id = spaceId) {
  return { params: Promise.resolve({ id }) };
}

function request(method: string, id = spaceId, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/spaces/${id}/share-link`, { method, headers });
}

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

function chain(result: () => unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'for']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve().then(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
  loggerWarn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  loggerInfo = vi.spyOn(logger, 'info').mockImplementation(() => {});
  process.env.NEXT_PUBLIC_APP_URL = 'https://forja.example.do/';
  space = { id: spaceId, name: 'Portal', status: 'activo', ownerId };
  activeLinks = [];
  membership = [{ spaceRole: 'colaborador' }];
  revokedRows = [{ spaceId, revokedAt: new Date() }];
  insertError = null;

  mocks.requireSession.mockResolvedValue({ id: userId, role: 'miembro' });
  mocks.requireProjectAccess.mockImplementation(async () => ({ ...space }));
  mocks.logAudit.mockResolvedValue(undefined);
  // Fuera de la transacción sólo se leen la membresía (DELETE) y el enlace activo (GET).
  mocks.select.mockImplementation((projection?: Record<string, unknown>) =>
    chain(() => (projection && 'spaceRole' in projection ? membership : activeLinks)));
  mocks.txSelect.mockImplementation(() => chain(() => activeLinks));
  mocks.txInsert.mockImplementation(() => ({ values: mocks.txValues }));
  mocks.txValues.mockImplementation(() => ({
    returning: async () => {
      if (insertError) throw insertError;
      return [{ createdAt }];
    },
  }));
  mocks.txUpdate.mockImplementation(() => ({ set: mocks.txSet }));
  mocks.txSet.mockImplementation(() => {
    const builder = { where: () => builder, returning: async () => revokedRows };
    return builder;
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

function expectNoWrites() {
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.txInsert).not.toHaveBeenCalled();
  expect(mocks.txUpdate).not.toHaveBeenCalled();
  expect(mocks.logAudit).not.toHaveBeenCalled();
}

function loggedText(): string {
  return JSON.stringify([loggerError.mock.calls, loggerWarn.mock.calls, loggerInfo.mock.calls]);
}

describe('GET /api/spaces/[id]/share-link', () => {
  it('sin sesión → 401 sin registrar errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET(request('GET'), ctx());
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('uuid inválido → 400 sin tocar la BD', async () => {
    mocks.requireProjectAccess.mockImplementation(async () => { throw httpError('ID de proyecto con formato inválido', 400); });
    const res = await GET(request('GET', 'no-es-uuid'), ctx('no-es-uuid'));
    expect(res.status).toBe(400);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'no-es-uuid', 'read');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sin enlace activo → { active: false, createdAt: null }', async () => {
    const res = await GET(request('GET'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false, createdAt: null });
  });

  it('con enlace activo → { active: true, createdAt } sin hash ni token', async () => {
    activeLinks = [{ createdAt, tokenHash: 'h'.repeat(64) } as unknown as { createdAt: Date }];
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });
    const res = await GET(request('GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ active: true, createdAt: createdAt.toISOString() });
    expect(JSON.stringify(body)).not.toContain('hhhh');
  });
});

describe('POST /api/spaces/[id]/share-link', () => {
  it('sin sesión → 401', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await POST(request('POST'), ctx());
    expect(res.status).toBe(401);
    expectNoWrites();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('observador global → 403 sin tocar la BD', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });
    const res = await POST(request('POST'), ctx());
    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it('observador del proyecto o no miembro (requireProjectAccess 403) → 403 sin insertar', async () => {
    mocks.requireProjectAccess.mockImplementation(async () => {
      throw httpError('Sin permisos de escritura en este proyecto', 403);
    });
    const res = await POST(request('POST'), ctx());
    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.anything(), spaceId, 'write');
    expectNoWrites();
  });

  it('proyecto cerrado → 409', async () => {
    mocks.requireProjectAccess.mockImplementation(async () => { throw httpError('El proyecto está cerrado', 409); });
    const res = await POST(request('POST'), ctx());
    expect(res.status).toBe(409);
    expectNoWrites();
  });

  it('ya hay un enlace activo → 409 sin insertar ni auditar', async () => {
    activeLinks = [{ createdAt }];
    const res = await POST(request('POST'), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      'El proyecto ya tiene un enlace público activo; revóquelo antes de crear otro',
    );
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('carrera con el índice parcial (23505) → el mismo 409', async () => {
    insertError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const res = await POST(request('POST'), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      'El proyecto ya tiene un enlace público activo; revóquelo antes de crear otro',
    );
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('caso feliz → 201 con token, sólo el hash en la BD y auditoría sin token ni hash', async () => {
    const res = await POST(
      request('POST', spaceId, { host: 'evil.example.com', 'x-forwarded-host': 'evil.example.com' }),
      ctx(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.path).toBe(`/compartido/${body.token}`);
    expect(body.url).toBe(`https://forja.example.do/compartido/${body.token}`);
    expect(body.url).not.toContain('evil');
    expect(body.createdAt).toBe(createdAt.toISOString());

    expect(mocks.txValues).toHaveBeenCalledTimes(1);
    const inserted = mocks.txValues.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).toEqual({ spaceId, tokenHash: sha256(body.token), createdBy: userId });
    expect(Object.values(inserted)).not.toContain(body.token);

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const [audit, executor] = mocks.logAudit.mock.calls[0];
    expect(executor).toBe(mocks.tx);
    expect(audit).toEqual({
      actorId: userId,
      action: 'share_link_created',
      spaceId,
      newValue: 'Portal: enlace público activo',
    });
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain(body.token);
    expect(auditText).not.toContain(sha256(body.token));
    expect(loggedText()).not.toContain(body.token);
  });

  it('sin NEXT_PUBLIC_APP_URL → url null (nunca desde las cabeceras)', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = await POST(request('POST', spaceId, { host: 'evil.example.com' }), ctx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toBeNull();
    expect(body.path).toBe(`/compartido/${body.token}`);
  });
});

describe('DELETE /api/spaces/[id]/share-link', () => {
  it('sin sesión → 401', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(401);
    expectNoWrites();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('observador global → 403', async () => {
    mocks.requireSession.mockResolvedValue({ id: userId, role: 'observador' });
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(403);
    expectNoWrites();
  });

  it('uuid inválido → 400 sin tocar la BD', async () => {
    mocks.requireProjectAccess.mockImplementation(async () => { throw httpError('ID de proyecto con formato inválido', 400); });
    const res = await DELETE(request('DELETE', 'x'), ctx('x'));
    expect(res.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expectNoWrites();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('observador del proyecto → 403 sin revocar', async () => {
    membership = [{ spaceRole: 'observador' }];
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(403);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(expect.anything(), spaceId, 'read');
    expectNoWrites();
  });

  it('caso feliz → { revoked: true } y auditoría en la transacción', async () => {
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });

    const setArg = mocks.txSet.mock.calls[0][0] as { revokedAt: unknown };
    expect(setArg.revokedAt).toBeInstanceOf(Date);
    expect(mocks.logAudit).toHaveBeenCalledWith({
      actorId: userId,
      action: 'share_link_revoked',
      spaceId,
      previousValue: 'Portal: enlace público activo',
      newValue: 'Portal: enlace público revocado',
    }, mocks.tx);
  });

  it('el dueño sin fila en space_members también puede revocar', async () => {
    membership = [];
    space.ownerId = userId;
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(200);
  });

  it('sin enlace activo → 404 sin auditar', async () => {
    revokedRows = [];
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('El proyecto no tiene un enlace público activo');
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('proyecto cerrado → se permite revocar (200)', async () => {
    space.status = 'cerrado';
    const res = await DELETE(request('DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });
});
