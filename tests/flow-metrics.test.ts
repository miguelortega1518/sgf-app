import { describe, expect, it } from 'vitest';
import {
  cumulativeFlow, cycleTimeHistogram, histogramMarkerPosition, reconcileHistory, statusAt, rdDayEnd,
  CYCLE_BUCKETS, type FlowTask,
} from '../src/lib/flow-metrics';
import { cycleTime, type MetricTask } from '../src/lib/metrics';
import { buildStatusHistory, type StatusEvent, type StatusSegment } from '../src/lib/status-history';
import { shiftDateRD, toDateRD } from '../src/lib/date-utils';
import { STATUS_ORDER } from '../src/lib/labels';

// 01:00Z del 18 = 21:00 RD del 17: el día UTC y el día RD no coinciden.
const NOW = new Date('2026-11-18T01:00:00Z');
const DAY = 86_400_000;
// Mediodía RD (16:00Z) de una fecha de calendario.
const noonRD = (date: string) => new Date(`${date}T16:00:00Z`);

let seq = 0;
const task = (over: Partial<FlowTask>): FlowTask => ({
  id: `t-${++seq}`, status: 'no_iniciada', createdAt: noonRD('2026-10-01'), completedAt: null, ...over,
});

const ev = (t: FlowTask, newValue: string, at: Date, previousValue: string | null = null): StatusEvent =>
  ({ taskId: t.id, previousValue, newValue, at });

const historiesOf = (pairs: [FlowTask, StatusEvent[]][]) =>
  new Map<string, StatusSegment[]>(pairs.map(([t, events]) => [t.id, buildStatusHistory(t, events)]));

const byDate = (cfd: ReturnType<typeof cumulativeFlow>, date: string) => {
  const entry = cfd.find(e => e.date === date);
  if (!entry) throw new Error(`sin entrada para ${date}`);
  return entry;
};

describe('shiftDateRD', () => {
  it('suma o resta días de calendario a una fecha YYYY-MM-DD', () => {
    expect(shiftDateRD('2026-11-17', -1)).toBe('2026-11-16');
    expect(shiftDateRD('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateRD('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateRD('2026-11-17', 0)).toBe('2026-11-17');
  });
});

describe('rdDayEnd', () => {
  it('es las 23:59:59.999 −04:00 del día RD', () => {
    expect(rdDayEnd('2026-11-17').toISOString()).toBe('2026-11-18T03:59:59.999Z');
    expect(rdDayEnd('2026-12-31').toISOString()).toBe('2027-01-01T03:59:59.999Z');
  });
});

describe('statusAt', () => {
  it('devuelve el tramo que contiene el instante, o null antes de la creación', () => {
    const t = task({ createdAt: noonRD('2026-11-01') });
    const h = buildStatusHistory(t, [ev(t, 'en_proceso', noonRD('2026-11-05'))]);
    expect(statusAt(h, noonRD('2026-10-31'))).toBeNull();
    expect(statusAt(h, noonRD('2026-11-01'))).toBe('no_iniciada');
    expect(statusAt(h, noonRD('2026-11-05'))).toBe('en_proceso');
    expect(statusAt(h, noonRD('2026-11-20'))).toBe('en_proceso');
  });
});

describe('reconcileHistory', () => {
  it('sin desajuste devuelve el historial tal cual', () => {
    const t = task({ status: 'en_proceso' });
    const h = buildStatusHistory(t, [ev(t, 'en_proceso', noonRD('2026-10-03'))]);
    expect(reconcileHistory(t, h)).toEqual(h);
  });

  it('completada sin eventos pasa a completada desde completedAt', () => {
    const t = task({ status: 'completada', createdAt: noonRD('2026-11-01'), completedAt: noonRD('2026-11-10') });
    const h = reconcileHistory(t, buildStatusHistory(t, []));
    expect(h.map(s => s.status)).toEqual(['no_iniciada', 'completada']);
    expect(h[1].from).toEqual(noonRD('2026-11-10'));
    expect(h[1].to).toBeNull();
  });

  it('sin completedAt sustituye el estado del último tramo', () => {
    const t = task({ status: 'bloqueada', createdAt: noonRD('2026-11-01') });
    const h = reconcileHistory(t, buildStatusHistory(t, [ev(t, 'en_proceso', noonRD('2026-11-04'))]));
    expect(h.map(s => s.status)).toEqual(['no_iniciada', 'bloqueada']);
    expect(h[1].from).toEqual(noonRD('2026-11-04'));
  });
});

describe('cumulativeFlow', () => {
  it('(a) devuelve exactamente `days` fechas consecutivas y la última es la de hoy en RD', () => {
    const cfd = cumulativeFlow([], new Map(), 30, NOW);
    expect(cfd).toHaveLength(30);
    expect(cfd.at(-1)!.date).toBe(toDateRD(NOW));
    expect(cfd.at(-1)!.date).toBe('2026-11-17');
    expect(cfd[0].date).toBe('2026-10-19');
    for (let i = 1; i < cfd.length; i++) {
      const prev = Date.parse(`${cfd[i - 1].date}T00:00:00Z`);
      const cur = Date.parse(`${cfd[i].date}T00:00:00Z`);
      expect(cur - prev).toBe(DAY);
    }
    for (const e of cfd) {
      expect(Object.keys(e.counts).sort()).toEqual([...STATUS_ORDER].sort());
      expect(e.total).toBe(0);
    }
  });

  it('cruza fin de mes y de año con aritmética de calendario', () => {
    const cfd = cumulativeFlow([], new Map(), 7, new Date('2027-01-02T02:00:00Z')); // 1 de enero, 22:00 RD
    expect(cfd.map(e => e.date)).toEqual([
      '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
    ]);
  });

  it('(b) los días sin cambios arrastran los recuentos', () => {
    const a = task({ status: 'en_proceso', createdAt: noonRD('2026-11-01') });
    const h = historiesOf([[a, [ev(a, 'en_proceso', noonRD('2026-11-10'))]]]);
    const cfd = cumulativeFlow([a], h, 10, NOW);
    expect(byDate(cfd, '2026-11-08').counts.no_iniciada).toBe(1);
    expect(byDate(cfd, '2026-11-09').counts.no_iniciada).toBe(1);
    for (const date of ['2026-11-10', '2026-11-11', '2026-11-14', '2026-11-17']) {
      expect(byDate(cfd, date).counts).toMatchObject({ en_proceso: 1, no_iniciada: 0 });
    }
  });

  it('(c) una reapertura resta de Hecho y suma a En progreso desde el día de la reapertura', () => {
    const a = task({ status: 'en_proceso', createdAt: noonRD('2026-11-01'), completedAt: null });
    const h = historiesOf([[a, [
      ev(a, 'en_proceso', noonRD('2026-11-02')),
      ev(a, 'completada', noonRD('2026-11-05')),
      ev(a, 'en_proceso', noonRD('2026-11-12')),
    ]]]);
    const cfd = cumulativeFlow([a], h, 14, NOW);
    expect(byDate(cfd, '2026-11-11').counts).toMatchObject({ completada: 1, en_proceso: 0 });
    expect(byDate(cfd, '2026-11-12').counts).toMatchObject({ completada: 0, en_proceso: 1 });
    expect(byDate(cfd, '2026-11-17').counts).toMatchObject({ completada: 0, en_proceso: 1 });
  });

  it('(d) una tarea creada a mitad del rango no cuenta antes de su día de creación', () => {
    const a = task({ status: 'no_iniciada', createdAt: noonRD('2026-11-12') });
    const cfd = cumulativeFlow([a], new Map(), 10, NOW);
    expect(byDate(cfd, '2026-11-11').total).toBe(0);
    expect(byDate(cfd, '2026-11-12').counts.no_iniciada).toBe(1);
    expect(byDate(cfd, '2026-11-17').total).toBe(1);
  });

  it('(e) una tarea completada antes de la ventana cuenta como Hecho todos los días', () => {
    const a = task({ status: 'completada', createdAt: noonRD('2026-08-01'), completedAt: noonRD('2026-09-01') });
    const cfd = cumulativeFlow([a], new Map(), 30, NOW);
    for (const e of cfd) expect(e.counts.completada).toBe(1);
  });

  it('(f) una completada sin eventos (legado) pasa a Hecho desde completedAt', () => {
    const a = task({ status: 'completada', createdAt: noonRD('2026-11-01'), completedAt: noonRD('2026-11-10') });
    const cfd = cumulativeFlow([a], new Map(), 20, NOW);
    expect(byDate(cfd, '2026-11-09').counts).toMatchObject({ no_iniciada: 1, completada: 0 });
    expect(byDate(cfd, '2026-11-10').counts).toMatchObject({ no_iniciada: 0, completada: 1 });
    expect(byDate(cfd, '2026-11-17').counts.completada).toBe(1);
  });

  it('(g) un cambio a las 23:30 RD cuenta en ese día y no en el siguiente', () => {
    const a = task({ status: 'en_revision', createdAt: noonRD('2026-11-01') });
    // 23:30 RD del 10 = 03:30Z del 11.
    const late = new Date('2026-11-11T03:30:00Z');
    const h = historiesOf([[a, [ev(a, 'en_revision', late)]]]);
    const cfd = cumulativeFlow([a], h, 10, NOW);
    expect(byDate(cfd, '2026-11-09').counts.no_iniciada).toBe(1);
    expect(byDate(cfd, '2026-11-10').counts.en_revision).toBe(1);
    expect(byDate(cfd, '2026-11-10').counts.no_iniciada).toBe(0);
  });

  it('para hoy el corte es `now`, no el final del día', () => {
    const a = task({ status: 'en_proceso', createdAt: noonRD('2026-11-01') });
    // 22:00 RD del 17: posterior a `now` (21:00 RD).
    const h = historiesOf([[a, [ev(a, 'en_proceso', new Date('2026-11-18T02:00:00Z'))]]]);
    const cfd = cumulativeFlow([a], h, 3, NOW);
    expect(cfd.at(-1)!.counts).toMatchObject({ no_iniciada: 1, en_proceso: 0 });
  });

  it('(h) total es la suma de counts', () => {
    const tasks = [
      task({ status: 'no_iniciada', createdAt: noonRD('2026-11-05') }),
      task({ status: 'bloqueada', createdAt: noonRD('2026-10-01') }),
      task({ status: 'completada', createdAt: noonRD('2026-10-01'), completedAt: noonRD('2026-11-15') }),
      task({ status: 'completada', createdAt: noonRD('2026-01-01'), completedAt: noonRD('2026-02-01') }),
    ];
    const cfd = cumulativeFlow(tasks, new Map(), 30, NOW);
    for (const e of cfd) {
      expect(e.total).toBe(Object.values(e.counts).reduce((s, n) => s + n, 0));
    }
    expect(cfd.at(-1)!.total).toBe(4);
  });
});

describe('cycleTimeHistogram', () => {
  // Tarea completada «hace `ago` días» con inicio `days` días antes del cierre.
  const done = (days: number, ago = 1): { t: MetricTask; events: StatusEvent[] } => {
    const completedAt = new Date(NOW.getTime() - ago * DAY);
    const start = new Date(completedAt.getTime() - days * DAY);
    const t: MetricTask = {
      id: `h-${++seq}`, number: seq, title: 'x', status: 'completada', kind: 'feature', estimate: null,
      // Con 0 días el tramo en_proceso dura 0 y se descarta: el ciclo sale de createdAt (= inicio).
      createdAt: days === 0 ? start : new Date(start.getTime() - DAY), completedAt, responsibleId: 'p', responsibleName: 'Ana', blockedByArea: null,
    };
    return { t, events: [ev(t as unknown as FlowTask, 'en_proceso', start), ev(t as unknown as FlowTask, 'completada', completedAt)] };
  };
  const build = (items: { t: MetricTask; events: StatusEvent[] }[]) => ({
    tasks: items.map(i => i.t),
    histories: new Map(items.map(i => [i.t.id, buildStatusHistory(i.t, i.events)])),
  });
  const countOf = (h: ReturnType<typeof cycleTimeHistogram>, label: string) => h.buckets.find(b => b.label === label)!.count;

  it('tiene 7 cubos en orden con límites [from, to)', () => {
    expect(CYCLE_BUCKETS.map(b => b.label)).toEqual(['0–1', '1–2', '2–3', '3–5', '5–8', '8–13', '13+']);
    expect(CYCLE_BUCKETS.at(-1)!.to).toBeNull();
  });

  it('reparte en los cubos con límite inferior inclusivo y superior exclusivo', () => {
    const { tasks, histories } = build([done(0), done(0.99), done(1), done(3), done(12.9), done(13), done(40)]);
    const h = cycleTimeHistogram(tasks, histories, 60, NOW);
    expect(countOf(h, '0–1')).toBe(2);
    expect(countOf(h, '1–2')).toBe(1);
    expect(countOf(h, '2–3')).toBe(0);
    expect(countOf(h, '3–5')).toBe(1);
    expect(countOf(h, '5–8')).toBe(0);
    expect(countOf(h, '8–13')).toBe(1);
    expect(countOf(h, '13+')).toBe(2);
    expect(h.count).toBe(7);
  });

  it('excluye las no completadas y las cerradas hace más de 60 días', () => {
    const recent = done(2);
    const old = done(2, 61);
    const open: { t: MetricTask; events: StatusEvent[] } = { t: { ...done(2).t, status: 'en_proceso', completedAt: null }, events: [] };
    const { tasks, histories } = build([recent, old, open]);
    const h = cycleTimeHistogram(tasks, histories, 60, NOW);
    expect(h.count).toBe(1);
    expect(countOf(h, '2–3')).toBe(1);
  });

  it('count, median, p85 y withoutStart coinciden con cycleTime()', () => {
    const items = [done(0.5), done(1.2), done(2), done(4), done(6), done(9), done(20)];
    const { tasks, histories } = build(items);
    // Una sin inicio registrado: usa createdAt y cuenta en withoutStart.
    const noStart = { ...done(3).t };
    tasks.push(noStart);
    const h = cycleTimeHistogram(tasks, histories, 60, NOW);
    const c = cycleTime(tasks, histories, 60, NOW);
    expect({ count: h.count, median: h.median, p85: h.p85, withoutStart: h.withoutStart }).toEqual(c);
    expect(h.withoutStart).toBe(1);
  });

  it('con lista vacía devuelve cubos a 0 y median/p85 null', () => {
    const h = cycleTimeHistogram([], new Map(), 60, NOW);
    expect(h.buckets).toHaveLength(7);
    expect(h.buckets.every(b => b.count === 0)).toBe(true);
    expect(h).toMatchObject({ count: 0, median: null, p85: null, withoutStart: 0 });
  });

  it('windowDays vale 60 por defecto', () => {
    const { tasks, histories } = build([done(2, 59), done(2, 61)]);
    expect(cycleTimeHistogram(tasks, histories, undefined, NOW).count).toBe(1);
  });
});

describe('histogramMarkerPosition', () => {
  it('devuelve el índice del cubo más la fracción dentro de él', () => {
    expect(histogramMarkerPosition(0)).toBe(0);
    expect(histogramMarkerPosition(1.5)).toBe(1.5);
    expect(histogramMarkerPosition(4)).toBe(3.5);
    expect(histogramMarkerPosition(13)).toBe(6);
    expect(histogramMarkerPosition(30)).toBe(7);
    expect(histogramMarkerPosition(19.5)).toBe(6.5);
  });
});
