import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
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
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.role).toBe('miembro');
  });
});
