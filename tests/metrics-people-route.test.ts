import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getTeamSettings: vi.fn(),
  accessibleSpaceIds: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/team-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/team-settings')>()),
  getTeamSettings: mocks.getTeamSettings,
}));
vi.mock('@/lib/project-access', () => ({ accessibleSpaceIds: mocks.accessibleSpaceIds }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/date-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/date-utils')>()),
  todayRD: () => '2026-10-28',
}));

import { GET } from '../src/app/api/metrics/people/route';
import { PERSON_METRICS_DISABLED_MESSAGE } from '../src/lib/team-settings';
import { logger } from '../src/lib/logger';

type Row = { id: string; status: string; dueDateOriginal: string | null; responsibleId: string; responsibleName: string };

const row = (over: Partial<Row>): Row => ({
  id: crypto.randomUUID(), status: 'en_proceso', dueDateOriginal: null, responsibleId: 'a', responsibleName: 'Ana', ...over,
});

describe('GET /api/metrics/people', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;
  let rows: Row[];

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    rows = [
      // Beto: muchas completadas y poca carga abierta.
      ...Array.from({ length: 5 }, () => row({ status: 'completada', responsibleId: 'b', responsibleName: 'Beto' })),
      row({ status: 'en_proceso', responsibleId: 'b', responsibleName: 'Beto' }),
      // Ana: más carga abierta, una vencida.
      row({ status: 'en_proceso', dueDateOriginal: '2026-10-01' }),
      row({ status: 'en_revision' }),
      row({ status: 'bloqueada' }),
      row({ status: 'no_iniciada' }),
    ];
    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'miembro' });
    mocks.getTeamSettings.mockResolvedValue({ showPersonMetrics: true });
    mocks.accessibleSpaceIds.mockResolvedValue(null);
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ innerJoin: mocks.innerJoin });
    mocks.innerJoin.mockReturnValue({ where: mocks.where });
    mocks.where.mockImplementation(async () => rows);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('con el ajuste apagado responde 403 con el mensaje y no consulta tareas', async () => {
    mocks.getTeamSettings.mockResolvedValue({ showPersonMetrics: false });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PERSON_METRICS_DISABLED_MESSAGE });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('con el ajuste encendido devuelve wip y byPerson ordenados por carga, no por completadas', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['byPerson', 'wip']);

    expect(body.wip).toEqual([
      { personId: 'a', name: 'Ana', inProgress: 1, inReview: 1, blocked: 1 },
      { personId: 'b', name: 'Beto', inProgress: 1, inReview: 0, blocked: 0 },
    ]);
    expect(body.byPerson).toEqual([
      { personId: 'a', name: 'Ana', open: 4, overdue: 1, completed: 0, total: 4 },
      { personId: 'b', name: 'Beto', open: 1, overdue: 0, completed: 5, total: 6 },
    ]);
  });

  it('pide sólo los campos que necesita, en una sola consulta', async () => {
    await GET();
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(Object.keys(mocks.select.mock.calls[0][0]).sort()).toEqual(
      ['dueDateOriginal', 'id', 'responsibleId', 'responsibleName', 'status'],
    );
  });

  it('sin espacios accesibles devuelve listas vacías sin consultar', async () => {
    mocks.accessibleSpaceIds.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wip: [], byPerson: [] });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('responde 401 sin sesión y no registra errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getTeamSettings).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});
