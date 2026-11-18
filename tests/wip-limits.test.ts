import { describe, expect, it } from 'vitest';
import { WIP_LIMIT_MESSAGE, wipLimitsSchema } from '../src/lib/schemas/wip-limits';
import { parseWipLimits, wipLimitState, wipLimitAuditValue, WIP_LIMITED_STATUSES } from '../src/lib/wip-limits';

const MESSAGE = 'El límite debe ser un número entero entre 1 y 99';

describe('wipLimitsSchema', () => {
  it('acepta enteros de 1 a 99 o null en las dos claves', () => {
    expect(wipLimitsSchema.parse({ en_proceso: 4, en_revision: null })).toEqual({ en_proceso: 4, en_revision: null });
    expect(wipLimitsSchema.parse({ en_proceso: 1, en_revision: 99 })).toEqual({ en_proceso: 1, en_revision: 99 });
  });

  it('el mensaje está en español', () => {
    expect(WIP_LIMIT_MESSAGE).toBe(MESSAGE);
  });

  it.each([
    ['0', { en_proceso: 0, en_revision: null }],
    ['100', { en_proceso: 100, en_revision: null }],
    ['2.5', { en_proceso: 2.5, en_revision: null }],
    ["'4'", { en_proceso: '4', en_revision: null }],
  ])('rechaza %s con el mensaje en español', (_label, body) => {
    const result = wipLimitsSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error!.issues.map(i => i.message)).toContain(MESSAGE);
  });

  it('rechaza claves ausentes', () => {
    expect(wipLimitsSchema.safeParse({ en_proceso: 4 }).success).toBe(false);
    expect(wipLimitsSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza claves extra', () => {
    expect(wipLimitsSchema.safeParse({ en_proceso: 4, en_revision: null, bloqueada: 2 }).success).toBe(false);
  });
});

describe('parseWipLimits', () => {
  it.each([
    [{}, { en_proceso: null, en_revision: null }],
    [null, { en_proceso: null, en_revision: null }],
    ['x', { en_proceso: null, en_revision: null }],
    [{ en_proceso: -1 }, { en_proceso: null, en_revision: null }],
    [{ en_proceso: 3 }, { en_proceso: 3, en_revision: null }],
    [{ en_proceso: 3, en_revision: 2.5, otra: 1 }, { en_proceso: 3, en_revision: null }],
    [[4, 5], { en_proceso: null, en_revision: null }],
  ])('normaliza %j sin lanzar', (raw, expected) => {
    expect(parseWipLimits(raw)).toEqual(expected);
  });

  it('sólo limita en_proceso y en_revision', () => {
    expect(WIP_LIMITED_STATUSES).toEqual(['en_proceso', 'en_revision']);
  });
});

describe('wipLimitState', () => {
  it('none sin límite, under, at y over', () => {
    expect(wipLimitState(5, null)).toBe('none');
    expect(wipLimitState(3, 4)).toBe('under');
    expect(wipLimitState(4, 4)).toBe('at');
    expect(wipLimitState(5, 4)).toBe('over');
  });
});

describe('wipLimitAuditValue', () => {
  it('produce texto legible sin JSON', () => {
    expect(wipLimitAuditValue('Portal', 'en_proceso', 4)).toBe('Portal · En progreso: 4');
    expect(wipLimitAuditValue('Portal', 'en_revision', null)).toBe('Portal · En code review: sin límite');
    expect(wipLimitAuditValue('Portal', 'en_proceso', null)).not.toMatch(/[{}"]/);
  });
});
