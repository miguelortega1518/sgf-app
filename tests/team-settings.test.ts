import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), rows: [] as { showPersonMetrics: boolean }[] }));

vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));

import {
  getTeamSettings, personMetricsAuditValue, assertPersonMetricsEnabled, PERSON_METRICS_DISABLED_MESSAGE,
} from '../src/lib/team-settings';

function chain() {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.rows).then(resolve);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.select.mockImplementation(() => chain());
});

describe('getTeamSettings', () => {
  it('sin fila devuelve las métricas por persona activadas', async () => {
    expect(await getTeamSettings()).toEqual({ showPersonMetrics: true });
  });

  it('con fila devuelve el valor guardado', async () => {
    mocks.rows = [{ showPersonMetrics: false }];
    expect(await getTeamSettings()).toEqual({ showPersonMetrics: false });
  });

  it('usa el executor que recibe', async () => {
    const select = vi.fn(() => chain());
    mocks.rows = [{ showPersonMetrics: false }];
    expect(await getTeamSettings({ select } as never)).toEqual({ showPersonMetrics: false });
    expect(select).toHaveBeenCalledTimes(1);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe('personMetricsAuditValue', () => {
  it('escribe el estado en texto legible', () => {
    expect(personMetricsAuditValue(true)).toBe('Métricas por persona: activadas');
    expect(personMetricsAuditValue(false)).toBe('Métricas por persona: desactivadas');
  });
});

describe('assertPersonMetricsEnabled', () => {
  it('no lanza si el ajuste está encendido', () => {
    expect(() => assertPersonMetricsEnabled({ showPersonMetrics: true })).not.toThrow();
  });

  it('lanza un 403 con el mensaje si está apagado', () => {
    try {
      assertPersonMetricsEnabled({ showPersonMetrics: false });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toBe(PERSON_METRICS_DISABLED_MESSAGE);
      expect((err as { httpStatus?: number }).httpStatus).toBe(403);
    }
  });

  it('el mensaje explica que es decisión del equipo y dónde activarlo', () => {
    expect(PERSON_METRICS_DISABLED_MESSAGE).toBe(
      'Las métricas por persona están desactivadas por decisión del equipo. Un admin puede activarlas en Ajustes del equipo.',
    );
  });
});
