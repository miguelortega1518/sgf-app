import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  getSession: vi.fn(),
  getUserFlags: vi.fn(),
}));
vi.mock('@/lib/api-utils', () => ({
  success: (data: unknown) => Response.json(data),
  error: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/lib/errors', () => ({ classifyError: vi.fn() }));

import { getSession, getUserFlags } from '@/lib/auth';
import { GET } from '../src/app/api/auth/me/route';

const mockedGetSession = vi.mocked(getSession);
const mockedGetUserFlags = vi.mocked(getUserFlags);

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the current database role instead of a stale JWT role', async () => {
    mockedGetSession.mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.invalid',
      role: 'admin',
    });
    mockedGetUserFlags.mockResolvedValue({
      active: true,
      mustChangePassword: false,
      role: 'miembro',
      sessionVersion: 0,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.role).toBe('miembro');
  });

  it('responde 401 si la sesión es de una versión anterior, para que la pantalla no muestre la app', async () => {
    mockedGetSession.mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.invalid',
      role: 'miembro',
      sv: 1,
    });
    mockedGetUserFlags.mockResolvedValue({
      active: true,
      mustChangePassword: false,
      role: 'miembro',
      sessionVersion: 2,
    });

    const response = await GET();
    expect(response.status).toBe(401);
  });
});
