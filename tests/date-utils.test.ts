import { describe, it, expect } from 'vitest';
import { isOverdue, formatDateRD, daysOverdue } from '../src/lib/date-utils';

describe('isOverdue', () => {
  it('returns false when no due date', () => {
    expect(isOverdue(null, 'no_iniciada')).toBe(false);
  });

  it('returns false when task is completed', () => {
    expect(isOverdue('2020-01-01', 'completada')).toBe(false);
  });

  it('returns true when due date is in the past and not completed', () => {
    expect(isOverdue('2020-01-01', 'en_proceso')).toBe(true);
  });

  it('returns false for future date', () => {
    expect(isOverdue('2099-12-31', 'en_proceso')).toBe(false);
  });
});

describe('formatDateRD', () => {
  it('formats YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatDateRD('2026-09-03')).toBe('03/09/2026');
    expect(formatDateRD('2026-12-25')).toBe('25/12/2026');
  });
});

describe('daysOverdue', () => {
  it('returns 0 for null due date', () => {
    expect(daysOverdue(null)).toBe(0);
  });

  it('returns 0 for future due date', () => {
    expect(daysOverdue('2099-12-31')).toBe(0);
  });

  it('returns positive number for past due date', () => {
    expect(daysOverdue('2020-01-01')).toBeGreaterThan(0);
  });
});
