import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOverdue,
  formatDateRD,
  daysOverdue,
  todayRD,
  toLocalDateString,
  lastDayOfPreviousMonth,
} from '../src/lib/date-utils';

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

describe('con el reloj a las 21:00 RD (01:00 UTC del día siguiente)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('la fecha UTC ya es mañana, pero todayRD() sigue en hoy', () => {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-11-06');
    expect(todayRD()).toBe('2026-11-05');
  });

  it('una tarea que vence hoy en RD no está vencida', () => {
    expect(isOverdue('2026-11-05', 'en_proceso')).toBe(false);
    expect(isOverdue('2026-11-05', 'no_iniciada')).toBe(false);
    expect(isOverdue('2026-11-05', 'en_revision')).toBe(false);
  });

  it('una tarea que venció ayer en RD sí está vencida (salvo completada)', () => {
    expect(isOverdue('2026-11-04', 'en_proceso')).toBe(true);
    expect(isOverdue('2026-11-04', 'completada')).toBe(false);
  });

  it('daysOverdue cuenta días según la fecha RD', () => {
    expect(daysOverdue('2026-11-04')).toBe(1);
    expect(daysOverdue('2026-11-05')).toBe(0);
  });

  it('el feriado de hoy en RD cuenta como próximo y el de ayer como pasado', () => {
    expect('2026-11-05' >= todayRD()).toBe(true);
    expect('2026-11-04' < todayRD()).toBe(true);
  });
});

// Cambiar process.env.TZ en caliente afecta a todo el worker: restaurarlo siempre.
const ORIGINAL_TZ = process.env.TZ;

function restoreTZ() {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
}

describe('toLocalDateString', () => {
  afterEach(restoreTZ);

  it('rellena mes y día a 2 dígitos', () => {
    expect(toLocalDateString(new Date(2026, 0, 3))).toBe('2026-01-03');
  });

  it('usa la fecha local, no la UTC (UTC+14)', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    expect(toLocalDateString(new Date(2026, 10, 5, 0, 30))).toBe('2026-11-05');
  });
});

describe('lastDayOfPreviousMonth en varias zonas horarias', () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreTZ();
  });

  it('control: con TZ Asia/Tokyo, toISOString da el día anterior', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(new Date(2026, 9, 31).toISOString().slice(0, 10)).toBe('2026-10-30');
  });

  it.each(['UTC', 'America/Santo_Domingo', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
    'con TZ %s devuelve el 31 de octubre para el 5 de noviembre',
    (tz) => {
      process.env.TZ = tz;
      expect(lastDayOfPreviousMonth(new Date(2026, 10, 5))).toBe('2026-10-31');
    },
  );

  it.each(['UTC', 'Asia/Tokyo'])('con TZ %s gestiona cambio de año y bisiestos', (tz) => {
    process.env.TZ = tz;
    expect(lastDayOfPreviousMonth(new Date(2027, 0, 15))).toBe('2026-12-31');
    expect(lastDayOfPreviousMonth(new Date(2028, 2, 1))).toBe('2028-02-29');
    expect(lastDayOfPreviousMonth(new Date(2026, 2, 31))).toBe('2026-02-28');
  });

  it('sin argumento usa la fecha actual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    expect(lastDayOfPreviousMonth()).toBe('2026-10-31');
  });
});
