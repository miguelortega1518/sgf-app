import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  accessibleSpaceIds: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: mocks.requireSession,
}));
vi.mock('@/lib/project-access', () => ({
  accessibleSpaceIds: mocks.accessibleSpaceIds,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
}));
vi.mock('@/lib/db/schema', () => ({
  tasks: {
    title: 'title',
    status: 'status',
    priority: 'priority',
    dueDate: 'dueDate',
    dueDateOriginal: 'dueDateOriginal',
    createdAt: 'createdAt',
    blockedByArea: 'blockedByArea',
    spaceId: 'spaceId',
    responsibleId: 'responsibleId',
    companyId: 'companyId',
    archived: 'archived',
  },
  spaces: { id: 'spaces.id', name: 'spaces.name' },
  persons: { id: 'persons.id', name: 'persons.name' },
  companies: { id: 'companies.id', name: 'companies.name' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ operator: 'and', conditions }),
  eq: (left: unknown, right: unknown) => ({ operator: 'eq', left, right }),
  ne: (left: unknown, right: unknown) => ({ operator: 'ne', left, right }),
  lte: (left: unknown, right: unknown) => ({ operator: 'lte', left, right }),
  asc: (column: unknown) => ({ operator: 'asc', column }),
  inArray: (left: unknown, values: unknown[]) => ({ operator: 'inArray', left, values }),
}));

import { GET } from '../src/app/api/reports/vencimientos/route';
import { logger } from '../src/lib/logger';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/reports/vencimientos${query}`);
}

type Condition = { operator: string; left?: unknown; right?: unknown; conditions?: Condition[] };

// Devuelve [columna, fecha] del lte pasado a where(and(...)).
function lteArgs() {
  const whereArg = mocks.where.mock.calls[0][0] as Condition;
  const lte = whereArg.conditions?.find((c) => c?.operator === 'lte');
  return [lte?.left, lte?.right];
}

describe('GET /api/reports/vencimientos', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T15:00:00Z'));
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'admin' });
    mocks.accessibleSpaceIds.mockResolvedValue(null);
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin });
    mocks.innerJoin.mockReturnValue({ innerJoin: mocks.innerJoin, leftJoin: mocks.leftJoin });
    mocks.leftJoin.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
    mocks.orderBy.mockResolvedValue([
      {
        title: 'Tarea vencida',
        status: 'pendiente',
        priority: 'alta',
        dueDate: '2026-03-05',
        dueDateOriginal: '2026-03-05',
        createdAt: new Date('2026-03-01T12:00:00Z'),
        spaceName: 'Proyecto A',
        responsibleName: 'Persona A',
        companyName: null,
        blockedByArea: null,
      },
      {
        title: 'Tarea próxima',
        status: 'en_progreso',
        priority: 'media',
        dueDate: '2026-03-12',
        dueDateOriginal: '2026-03-12',
        createdAt: new Date('2026-03-01T12:00:00Z'),
        spaceName: 'Proyecto B',
        responsibleName: 'Persona B',
        companyName: 'Repo',
        blockedByArea: null,
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('responde 400 con days=abc sin consultar la base', async () => {
    const response = await GET(getRequest('?days=abc'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/days/);
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each(['-1', '366', '100000', '1.5', 'Infinity'])(
    'responde 400 con days=%s sin consultar la base',
    async (days) => {
      const response = await GET(getRequest(`?days=${days}`));

      expect(response.status).toBe(400);
      expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    },
  );

  it('responde 400 con format=csv sin consultar la base', async () => {
    const response = await GET(getRequest('?format=csv'));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/formato/i);
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sin days usa una ventana de 7 días y devuelve XLSX por defecto', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(XLSX_TYPE);
    expect(lteArgs()).toEqual(['dueDateOriginal', '2026-03-17']);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('con days=30 usa todayRD()+30', async () => {
    const response = await GET(getRequest('?days=30'));

    expect(response.status).toBe(200);
    expect(lteArgs()).toEqual(['dueDateOriginal', '2026-04-09']);
  });

  it.each([
    ['0', '2026-03-10'],
    ['365', '2027-03-10'],
  ])('acepta days=%s', async (days, expected) => {
    const response = await GET(getRequest(`?days=${days}`));

    expect(response.status).toBe(200);
    expect(lteArgs()).toEqual(['dueDateOriginal', expected]);
  });

  it('con format=pdf devuelve application/pdf', async () => {
    const response = await GET(getRequest('?format=pdf&days=14'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    const buf = Buffer.from(await response.arrayBuffer());
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('responde 401 sin sesión, antes de validar y sin consultar la base', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));

    const response = await GET(getRequest('?days=abc'));

    expect(response.status).toBe(401);
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
