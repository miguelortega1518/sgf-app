import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
  getUserFlags: vi.fn(),
}));
vi.mock('@/lib/api-utils', () => ({
  success: (data: unknown) => Response.json(data),
  error: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/lib/errors', () => ({ classifyError: vi.fn(() => ({})) }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/db/schema', () => ({
  persons: {
    id: 'persons.id',
    emailImmediate: 'persons.emailImmediate',
    emailDigest: 'persons.emailDigest',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
}));

import { getSession, getUserFlags } from '@/lib/auth';
import { GET } from '../src/app/api/auth/me/route';

const mockedGetSession = vi.mocked(getSession);
const mockedGetUserFlags = vi.mocked(getUserFlags);

const where = vi.fn();

function preferenceRows(rows: unknown[] | Error) {
  const builder: Record<string, unknown> = {};
  builder.from = () => builder;
  builder.where = (...args: unknown[]) => {
    where(...args);
    return builder;
  };
  builder.limit = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)).then(resolve, reject);
  mocks.select.mockReturnValue(builder);
}

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSession.mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.invalid',
      role: 'admin',
    });
    preferenceRows([{ emailImmediate: false, emailDigest: true }]);
  });

  it('returns the current database role instead of a stale JWT role', async () => {
    mockedGetUserFlags.mockResolvedValue({
      active: true,
      mustChangePassword: false,
      role: 'miembro',
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.role).toBe('miembro');
  });

  it('incluye las preferencias de correo leídas de la BD para la persona de la sesión', async () => {
    mockedGetUserFlags.mockResolvedValue({ active: true, mustChangePassword: false, role: 'miembro' });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      role: 'miembro',
      mustChangePassword: false,
      emailImmediate: false,
      emailDigest: true,
    });
    expect(body.degraded).toBeUndefined();
    expect(mocks.select).toHaveBeenCalledWith({
      emailImmediate: 'persons.emailImmediate',
      emailDigest: 'persons.emailDigest',
    });
    expect(where).toHaveBeenCalledWith({ operator: 'eq', left: 'persons.id', right: 'user-1' });
  });

  it('modo degradado: si la BD falla responde 200 con degraded y sin preferencias', async () => {
    mockedGetUserFlags.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.user).not.toHaveProperty('emailImmediate');
    expect(body.user).not.toHaveProperty('emailDigest');
  });

  it('modo degradado también si falla la lectura de preferencias', async () => {
    mockedGetUserFlags.mockResolvedValue({ active: true, mustChangePassword: false, role: 'miembro' });
    preferenceRows(new Error('connect ECONNREFUSED'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.user).not.toHaveProperty('emailImmediate');
    expect(body.user).not.toHaveProperty('emailDigest');
  });
});
