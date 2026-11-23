import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  accessibleSpaceIds: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/project-access', () => ({ accessibleSpaceIds: mocks.accessibleSpaceIds }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));

import { GET } from '../src/app/api/dashboard/route';
import { logger } from '../src/lib/logger';

const totals = { total: 4, completed: 1, overdue: 1, blocked: 1, inProgress: 1, inReview: 0, notStarted: 1 };
const byCompany = [{ companyId: 'c1', companyName: 'Acme', total: 4, completed: 1, overdue: 1 }];

// Builder encadenable: resuelve los totales si la consulta no agrupa, o las filas por empresa si agrupa.
function chain() {
  let grouped = false;
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where', 'orderBy']) builder[method] = () => builder;
  builder.groupBy = () => { grouped = true; return builder; };
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(grouped ? byCompany : [totals]).then(resolve);
  return builder;
}

describe('GET /api/dashboard', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireSession.mockResolvedValue({ id: 'user-1', role: 'admin' });
    mocks.accessibleSpaceIds.mockResolvedValue(null);
    mocks.select.mockImplementation(() => chain());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devuelve los totales del equipo y no los datos por persona', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals).toEqual({ ...totals, completionRate: 25 });
    expect(body.byStatus).toHaveLength(5);
    expect(body.byCompany).toEqual(byCompany);
    expect(body.byPerson).toBeUndefined();
    // Sólo totales y por repositorio: ya no se consulta la carga por persona.
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it('responde 401 sin sesión y no registra errores', async () => {
    mocks.requireSession.mockRejectedValue(new Error('UNAUTHORIZED'));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });
});
