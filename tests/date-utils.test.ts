import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOverdue,
  formatDateRD,
  daysOverdue,
  todayRD,
  toLocalDateString,
  lastDayOfPreviousMonth,
  toDateRD,
  addDaysRD,
  relativeDueRD,
} from '../src/lib/date-utils';

describe('relativeDueRD', () => {
  const today = '2026-11-12';

  it('devuelve Hoy, Mañana y en N días hacia el futuro', () => {
    expect(relativeDueRD('2026-11-12', today)).toBe('Hoy');
    expect(relativeDueRD('2026-11-13', today)).toBe('Mañana');
    expect(relativeDueRD('2026-11-14', today)).toBe('en 2 días');
    expect(relativeDueRD('2026-11-22', today)).toBe('en 10 días');
  });

  it('devuelve Ayer y hace N días hacia el pasado', () => {
    expect(relativeDueRD('2026-11-11', today)).toBe('Ayer');
    expect(relativeDueRD('2026-11-09', today)).toBe('hace 3 días');
  });

  it('gestiona el cambio de mes y de año', () => {
    expect(relativeDueRD('2027-01-01', '2026-12-31')).toBe('Mañana');
    expect(relativeDueRD('2026-02-28', '2026-03-01')).toBe('Ayer');
  });
});

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

  it('relativeDueRD usa la fecha RD por defecto, no la UTC', () => {
    expect(relativeDueRD('2026-11-05')).toBe('Hoy');
    expect(relativeDueRD('2026-11-06')).toBe('Mañana');
    expect(relativeDueRD('2026-11-04')).toBe('Ayer');
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

describe('toDateRD', () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreTZ();
  });

  it('a las 21:30 RD devuelve el día RD, no el UTC', () => {
    expect(toDateRD(new Date('2026-03-10T01:30:00Z'))).toBe('2026-03-09');
  });

  it('acepta cadenas ISO', () => {
    expect(toDateRD('2026-03-10T05:00:00Z')).toBe('2026-03-10');
  });

  it('coincide con todayRD() para el instante actual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T01:30:00Z'));
    expect(toDateRD(new Date())).toBe(todayRD());
    expect(todayRD()).toBe('2026-03-09');
  });

  it.each(['Asia/Tokyo', 'UTC', 'Pacific/Kiritimati'])(
    'no depende de la TZ del proceso (%s)',
    (tz) => {
      process.env.TZ = tz;
      expect(toDateRD(new Date('2026-03-10T01:30:00Z'))).toBe('2026-03-09');
      expect(toDateRD('2026-03-10T05:00:00Z')).toBe('2026-03-10');
    },
  );
});

describe('addDaysRD a las 21:00 RD', () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreTZ();
  });

  it('gestiona el cambio de mes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T01:00:00Z'));
    expect(addDaysRD(0)).toBe('2026-01-31');
    expect(addDaysRD(1)).toBe('2026-02-01');
  });

  it('gestiona el cambio de año', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T01:00:00Z'));
    expect(addDaysRD(1)).toBe('2027-01-01');
    expect(addDaysRD(7)).toBe('2027-01-07');
  });

  it('resta días y respeta los bisiestos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-03-01T15:00:00Z'));
    expect(addDaysRD(-1)).toBe('2028-02-29');
  });

  // Contrato del que depende scripts/seed.ts (iso = addDaysRD): una tarea con
  // due: 1 debe mostrarse como 'Mañana' también entre las 20:00 y las 24:00 RD.
  it('addDaysRD(1) es Mañana y addDaysRD(2) es en 2 días a las 21:00 RD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T01:00:00Z'));
    expect(addDaysRD(1)).toBe('2026-11-13');
    expect(relativeDueRD(addDaysRD(1))).toBe('Mañana');
    expect(relativeDueRD(addDaysRD(2))).toBe('en 2 días');
  });

  it.each(['Asia/Tokyo', 'Pacific/Kiritimati'])('no depende de la TZ del proceso (%s)', (tz) => {
    process.env.TZ = tz;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T01:00:00Z'));
    expect(addDaysRD(0)).toBe('2026-12-31');
    expect(addDaysRD(7)).toBe('2027-01-07');
  });
});
