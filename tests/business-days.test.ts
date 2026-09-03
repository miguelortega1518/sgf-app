import { describe, it, expect } from 'vitest';
import { addBusinessDays, countBusinessDays, isBusinessDay } from '../src/lib/business-days';

describe('addBusinessDays', () => {
  const noHolidays = new Set<string>();

  it('counts from anchor Mon Aug 31, 2026 matching the spec table', () => {
    const anchor = '2026-08-31';

    expect(addBusinessDays(anchor, 1, noHolidays)).toBe('2026-09-01');
    expect(addBusinessDays(anchor, 2, noHolidays)).toBe('2026-09-02');
    expect(addBusinessDays(anchor, 3, noHolidays)).toBe('2026-09-03');
    expect(addBusinessDays(anchor, 4, noHolidays)).toBe('2026-09-04');
    expect(addBusinessDays(anchor, 5, noHolidays)).toBe('2026-09-07');
    expect(addBusinessDays(anchor, 6, noHolidays)).toBe('2026-09-08');
    expect(addBusinessDays(anchor, 7, noHolidays)).toBe('2026-09-09');
    expect(addBusinessDays(anchor, 8, noHolidays)).toBe('2026-09-10');
    expect(addBusinessDays(anchor, 9, noHolidays)).toBe('2026-09-11');
    expect(addBusinessDays(anchor, 10, noHolidays)).toBe('2026-09-14');
    expect(addBusinessDays(anchor, 11, noHolidays)).toBe('2026-09-15');
  });

  it('skips weekends when anchor is Friday', () => {
    const anchor = '2026-09-04';
    expect(addBusinessDays(anchor, 1, noHolidays)).toBe('2026-09-07');
    expect(addBusinessDays(anchor, 2, noHolidays)).toBe('2026-09-08');
  });

  it('skips holidays', () => {
    const holidays = new Set(['2026-09-02']);
    const anchor = '2026-08-31';

    expect(addBusinessDays(anchor, 1, holidays)).toBe('2026-09-01');
    expect(addBusinessDays(anchor, 2, holidays)).toBe('2026-09-03');
    expect(addBusinessDays(anchor, 3, holidays)).toBe('2026-09-04');
  });

  it('handles multiple consecutive holidays and weekends', () => {
    const holidays = new Set(['2026-09-03', '2026-09-04']);
    const anchor = '2026-09-02';

    expect(addBusinessDays(anchor, 1, holidays)).toBe('2026-09-07');
  });

  it('handles December with year-end holidays (cierre diciembre)', () => {
    const holidays = new Set(['2026-12-25']);
    const anchor = '2026-11-30';

    expect(addBusinessDays(anchor, 1, holidays)).toBe('2026-12-01');
    expect(addBusinessDays(anchor, 18, holidays)).toBe('2026-12-24');
    expect(addBusinessDays(anchor, 19, holidays)).toBe('2026-12-28');
  });
});

describe('countBusinessDays', () => {
  it('counts business days between two dates', () => {
    const noHolidays = new Set<string>();
    expect(countBusinessDays('2026-08-31', '2026-09-04', noHolidays)).toBe(4);
    expect(countBusinessDays('2026-08-31', '2026-09-07', noHolidays)).toBe(5);
  });
});

describe('isBusinessDay', () => {
  it('weekdays are business days', () => {
    const noHolidays = new Set<string>();
    expect(isBusinessDay('2026-09-01', noHolidays)).toBe(true);
    expect(isBusinessDay('2026-09-05', noHolidays)).toBe(false);
    expect(isBusinessDay('2026-09-06', noHolidays)).toBe(false);
  });

  it('holidays are not business days', () => {
    const holidays = new Set(['2026-09-01']);
    expect(isBusinessDay('2026-09-01', holidays)).toBe(false);
  });
});
