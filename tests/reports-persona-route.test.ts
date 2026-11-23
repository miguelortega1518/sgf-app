import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getTeamSettings: vi.fn(),
  accessibleSpaceIds: vi.fn(),
  visiblePersonIds: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/team-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/team-settings')>()),
  getTeamSettings: mocks.getTeamSettings,
}));
vi.mock('@/lib/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/project-access')>()),
  accessibleSpaceIds: mocks.accessibleSpaceIds,
  visiblePersonIds: mocks.visiblePersonIds,
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));

import { GET } from '../src/app/api/reports/persona/route';
import { PERSON_METRICS_DISABLED_MESSAGE } from '../src/lib/team-settings';
import { logger } from '../src/lib/logger';

const personId = crypto.randomUUID();

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/reports/persona${query}`);
}

describe('GET /api/reports/persona', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'admin' });
    mocks.getTeamSettings.mockResolvedValue({ showPersonMetrics: true });
    mocks.accessibleSpaceIds.mockResolvedValue(null);
    mocks.visiblePersonIds.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['con personId', `?personId=${personId}`],
    ['sin personId', ''],
  ])('con el ajuste apagado responde 403 %s, sin consultar personas ni tareas', async (_name, query) => {
    mocks.getTeamSettings.mockResolvedValue({ showPersonMetrics: false });
    const res = await GET(getRequest(query));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PERSON_METRICS_DISABLED_MESSAGE });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.accessibleSpaceIds).not.toHaveBeenCalled();
    expect(mocks.visiblePersonIds).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('con el ajuste encendido y sin personId mantiene el 400 actual', async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'personId es requerido' });
    expect(mocks.getTeamSettings).toHaveBeenCalledTimes(1);
  });

  it('sin sesión responde 401 sin leer el ajuste', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET(getRequest(`?personId=${personId}`));
    expect(res.status).toBe(401);
    expect(mocks.getTeamSettings).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});
