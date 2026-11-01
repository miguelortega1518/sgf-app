import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
  visiblePersonIds: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
  requireRole: mocks.requireRole,
  hashPassword: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
}));
vi.mock('@/lib/db/schema', () => ({
  persons: {
    id: 'id',
    name: 'name',
    email: 'email',
    role: 'role',
    active: 'active',
    createdAt: 'createdAt',
  },
}));
vi.mock('@/lib/project-access', () => ({ visiblePersonIds: mocks.visiblePersonIds }));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  inArray: (left: unknown, values: unknown[]) => ({ operator: 'inArray', left, values }),
}));
vi.mock('@/lib/api-utils', () => ({
  success: (data: unknown, status = 200) => Response.json(data, { status }),
  error: (message: string, status: number) => Response.json({ error: message }, { status }),
  handleError: (err: { message?: string; httpStatus?: number }) =>
    Response.json({ error: err.message }, { status: err.httpStatus ?? 500 }),
}));

import { GET } from '../src/app/api/users/route';

describe('GET /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValue([]);
  });

  it('excludes inactive accounts for administrators by default', async () => {
    mocks.requireSession.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.visiblePersonIds.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/users'));

    expect(response.status).toBe(200);
    expect(mocks.where).toHaveBeenCalledWith({ operator: 'eq', left: 'active', right: true });
  });

  it('includes inactive accounts only when an administrator explicitly requests them', async () => {
    mocks.requireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.visiblePersonIds.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/users?includeInactive=true'));

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(mocks.where).toHaveBeenCalledWith(undefined);
  });

  it('denies a non-admin request to include inactive accounts', async () => {
    const denied = Object.assign(new Error('Sin permisos'), { httpStatus: 403 });
    mocks.requireRole.mockRejectedValue(denied);

    const response = await GET(new NextRequest('http://localhost/api/users?includeInactive=true'));

    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('keeps non-admin results scoped to visible people and active accounts', async () => {
    mocks.requireSession.mockResolvedValue({ id: 'member-1', role: 'miembro' });
    mocks.visiblePersonIds.mockResolvedValue(['member-1', 'member-2']);

    const response = await GET(new NextRequest('http://localhost/api/users'));

    expect(response.status).toBe(200);
    expect(mocks.where).toHaveBeenCalledWith({
      operator: 'and',
      conditions: [
        { operator: 'inArray', left: 'id', values: ['member-1', 'member-2'] },
        { operator: 'eq', left: 'active', right: true },
      ],
    });
  });
});
