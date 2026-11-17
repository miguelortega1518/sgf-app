import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

type SelectCall = { table: unknown; where: unknown };
type InsertCall = { table: unknown; values: { personId: string; day: string }[] };
type DeleteCall = { table: unknown; where: unknown };

const state = vi.hoisted(() => ({
  rows: new Map<unknown, unknown[]>(),
  selects: [] as SelectCall[],
  inserts: [] as InsertCall[],
  deletes: [] as DeleteCall[],
  claim: null as null | ((values: { personId: string; day: string }[]) => { personId: string }[]),
  sendDigestEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  type Chain = {
    from: (t: unknown) => Chain;
    innerJoin: () => Chain;
    leftJoin: () => Chain;
    where: (w: unknown) => Chain;
    groupBy: () => Chain;
    orderBy: () => Chain;
    limit: () => Chain;
    then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
  };
  const select = vi.fn(() => {
    const call: SelectCall = { table: undefined, where: undefined };
    state.selects.push(call);
    const chain: Chain = {
      from(t) { call.table = t; return chain; },
      innerJoin() { return chain; },
      leftJoin() { return chain; },
      where(w) { call.where = w; return chain; },
      groupBy() { return chain; },
      orderBy() { return chain; },
      limit() { return chain; },
      then(res, rej) { return Promise.resolve(state.rows.get(call.table) ?? []).then(res, rej); },
    };
    return chain;
  });
  const insert = vi.fn((table: unknown) => ({
    values(values: { personId: string; day: string }[]) {
      state.inserts.push({ table, values });
      return {
        onConflictDoNothing() {
          return {
            returning() {
              const claimed = state.claim ? state.claim(values) : values.map(v => ({ personId: v.personId }));
              return Promise.resolve(claimed);
            },
          };
        },
      };
    },
  }));
  const del = vi.fn((table: unknown) => ({
    where(where: unknown) {
      state.deletes.push({ table, where });
      return Promise.resolve();
    },
  }));
  return { db: { select, insert, delete: del } };
});

vi.mock('@/lib/email', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return { ...actual, sendDigestEmail: state.sendDigestEmail };
});

import { POST } from '../src/app/api/cron/daily-digest/route';
import { logger } from '../src/lib/logger';
import { db } from '../src/lib/db';
import { digestRuns, holidays, notifications, persons, tasks } from '../src/lib/db/schema';

const SECRET = 'secreto-del-cron';
// 21:00 RD del martes 17-nov-2026 (en UTC ya es miércoles 18).
const WEEKDAY_NOW = '2026-11-18T01:00:00Z';
const DAY = '2026-11-17';
// Sábado 21-nov-2026, 7:30 RD.
const SATURDAY_NOW = '2026-11-21T11:30:00Z';

type PersonRow = { id: string; name: string; email: string };

function person(name: string): PersonRow {
  return { id: crypto.randomUUID(), name, email: `${name.toLowerCase()}@forja.do` };
}

let counter = 0;
function dueTodayTask(responsibleId: string) {
  counter++;
  return {
    id: crypto.randomUUID(), number: counter, title: `Tarea ${counter}`, status: 'en_proceso',
    dueDate: DAY, responsibleId, reviewerId: null,
  };
}

function req(opts: { auth?: string | null; query?: string } = {}) {
  const headers: Record<string, string> = {};
  const auth = opts.auth === undefined ? `Bearer ${SECRET}` : opts.auth;
  if (auth !== null) headers.authorization = auth;
  return new NextRequest(`http://localhost/api/cron/daily-digest${opts.query ?? ''}`, { method: 'POST', headers });
}

function setPeople(people: PersonRow[], withTasks = true) {
  state.rows.set(persons, people);
  state.rows.set(tasks, withTasks ? people.map(p => dueTodayTask(p.id)) : []);
}

const fetchMock = vi.fn();
let errorSpy: ReturnType<typeof vi.spyOn>;
let originalSecret: string | undefined;
let originalKey: string | undefined;
let originalAppUrl: string | undefined;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(WEEKDAY_NOW));
  vi.clearAllMocks();
  state.rows.clear();
  state.selects.length = 0;
  state.inserts.length = 0;
  state.deletes.length = 0;
  state.claim = null;
  state.sendDigestEmail.mockResolvedValue(true);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  originalSecret = process.env.CRON_SECRET;
  originalKey = process.env.RESEND_API_KEY;
  originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.CRON_SECRET = SECRET;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_APP_URL = 'https://forja.example.com/';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEnv('CRON_SECRET', originalSecret);
  restoreEnv('RESEND_API_KEY', originalKey);
  restoreEnv('NEXT_PUBLIC_APP_URL', originalAppUrl);
});

describe('POST /api/cron/daily-digest: autorización', () => {
  it('sin CRON_SECRET responde 401 sin tocar la BD', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'No autorizado' });
    expect(db.select).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('con CRON_SECRET vacío responde 401', async () => {
    process.env.CRON_SECRET = '';
    const res = await POST(req({ auth: 'Bearer ' }));
    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('con una cabecera incorrecta responde 401 sin tocar la BD', async () => {
    for (const auth of [null, 'Bearer otro', `Basic ${SECRET}`]) {
      const res = await POST(req({ auth }));
      expect(res.status).toBe(401);
    }
    expect(db.select).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('valida la firma antes de la query: 401 aunque dryRun sea inválido', async () => {
    const res = await POST(req({ auth: 'Bearer otro', query: '?dryRun=abc' }));
    expect(res.status).toBe(401);
  });

  it('con la cabecera correcta responde 200', async () => {
    setPeople([]);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, skipped: 0, failed: 0, day: DAY });
  });
});

describe('POST /api/cron/daily-digest: query', () => {
  it('dryRun=abc responde 400 sin registrar errores ni tocar la BD', async () => {
    const res = await POST(req({ query: '?dryRun=abc' }));
    expect(res.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('dryRun=0 se acepta como envío normal', async () => {
    setPeople([person('Ana')]);
    const res = await POST(req({ query: '?dryRun=0' }));
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(1);
  });
});

describe('POST /api/cron/daily-digest: días no laborables', () => {
  it('un sábado responde no_laborable sin más consultas ni envíos', async () => {
    vi.setSystemTime(new Date(SATURDAY_NOW));
    setPeople([person('Ana')]);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: 'no_laborable', day: '2026-11-21' });
    expect(state.selects.map(s => s.table)).toEqual([holidays]);
    expect(db.insert).not.toHaveBeenCalled();
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
  });

  it('un feriado responde no_laborable', async () => {
    state.rows.set(holidays, [{ date: DAY }]);
    setPeople([person('Ana')]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ skipped: 'no_laborable', day: DAY });
    expect(state.selects).toHaveLength(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/daily-digest: envío', () => {
  it('envía a dos personas con contenido y reclama sus filas con day = todayRD', async () => {
    const ana = person('Ana');
    const beto = person('Beto');
    setPeople([ana, beto]);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, skipped: 0, failed: 0, day: DAY });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe(digestRuns);
    expect(state.inserts[0].values).toEqual([
      { personId: ana.id, day: DAY },
      { personId: beto.id, day: DAY },
    ]);
    expect(state.sendDigestEmail).toHaveBeenCalledTimes(2);
    const [to, content] = state.sendDigestEmail.mock.calls[0] as [string, { subject: string; html: string; text: string }];
    expect(to).toBe(ana.email);
    expect(content.subject).toBe('Forja: tu resumen del 17/11/2026');
    expect(content.text).toContain('https://forja.example.com/tareas/');
    expect(content.html).not.toContain('//tareas');
    expect(state.deletes).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('las consultas no dependen de la cantidad de personas', async () => {
    setPeople([person('Ana')]);
    await POST(req());
    const one = { selects: state.selects.length, inserts: state.inserts.length, deletes: state.deletes.length };

    state.selects.length = 0;
    state.inserts.length = 0;
    state.deletes.length = 0;
    setPeople(['Ana', 'Beto', 'Carla', 'Dani', 'Eva'].map(person));
    await POST(req());
    const five = { selects: state.selects.length, inserts: state.inserts.length, deletes: state.deletes.length };

    expect(five).toEqual(one);
    expect(one).toEqual({ selects: 5, inserts: 1, deletes: 0 });
    expect(state.selects.map(s => s.table)).toEqual([holidays, persons, digestRuns, tasks, notifications]);
  });

  it('con fallos hace un único delete, también con varias personas', async () => {
    setPeople(['Ana', 'Beto', 'Carla'].map(person));
    state.sendDigestEmail.mockResolvedValue(false);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 0, skipped: 0, failed: 3, day: DAY });
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0].table).toBe(digestRuns);
  });

  it('un envío fallido produce un único delete con day y la persona, y failed 1', async () => {
    const ana = person('Ana');
    const beto = person('Beto');
    setPeople([ana, beto]);
    state.sendDigestEmail.mockImplementation(async (to: string) => to !== beto.email);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 1, skipped: 0, failed: 1, day: DAY });
    expect(state.deletes).toHaveLength(1);
    const { sql, params } = new PgDialect().sqlToQuery(state.deletes[0].where as SQL);
    expect(sql).toContain('"day"');
    expect(sql).toContain('"person_id" in');
    expect(params).toEqual([DAY, beto.id]);
  });

  it('una persona con el resumen vacío cuenta en skipped y no recibe nada', async () => {
    const ana = person('Ana');
    const beto = person('Beto');
    state.rows.set(persons, [ana, beto]);
    state.rows.set(tasks, [dueTodayTask(ana.id)]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 1, skipped: 1, failed: 0, day: DAY });
    expect(state.sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(state.sendDigestEmail.mock.calls[0][0]).toBe(ana.email);
    expect(state.inserts[0].values).toEqual([{ personId: ana.id, day: DAY }]);
  });

  it('si nadie tiene contenido no inserta ni envía', async () => {
    setPeople([person('Ana'), person('Beto')], false);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 0, skipped: 2, failed: 0, day: DAY });
    expect(db.insert).not.toHaveBeenCalled();
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
  });

  it('incluye las novedades sin enviar del destinatario', async () => {
    const ana = person('Ana');
    state.rows.set(persons, [ana]);
    state.rows.set(notifications, [{
      id: crypto.randomUUID(), recipientId: ana.id, type: 'task_completed', title: 'FOR-3 completada',
      body: null, taskId: null, taskNumber: null, createdAt: new Date('2026-11-17T15:00:00Z'),
    }]);
    const res = await POST(req());
    expect((await res.json()).sent).toBe(1);
    const content = state.sendDigestEmail.mock.calls[0][1] as { text: string };
    expect(content.text).toContain('FOR-3 completada');
  });

  it('descarta las novedades anteriores al último resumen de la persona', async () => {
    const ana = person('Ana');
    state.rows.set(persons, [ana]);
    state.rows.set(digestRuns, [{
      personId: ana.id, lastDay: '2026-11-16', lastAt: new Date('2026-11-16T11:31:00Z'),
    }]);
    state.rows.set(notifications, [{
      id: crypto.randomUUID(), recipientId: ana.id, type: 'task_completed', title: 'Vieja',
      body: null, taskId: null, taskNumber: null, createdAt: new Date('2026-11-16T10:00:00Z'),
    }]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 0, skipped: 1, failed: 0, day: DAY });
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/daily-digest: elegibles', () => {
  it('la consulta de personas filtra por active y email_digest', async () => {
    setPeople([person('Ana')]);
    await POST(req());
    const call = state.selects.find(s => s.table === persons)!;
    const { sql, params } = new PgDialect().sqlToQuery(call.where as SQL);
    expect(sql).toContain('"persons"."active" = $1');
    expect(sql).toContain('"persons"."email_digest" = $2');
    expect(params).toEqual([true, true]);
  });

  it('no envía a personas que la consulta no devuelve aunque haya tareas suyas', async () => {
    const ana = person('Ana');
    const inactive = person('Sistema');
    state.rows.set(persons, [ana]);
    state.rows.set(tasks, [dueTodayTask(ana.id), dueTodayTask(inactive.id)]);
    state.rows.set(notifications, [{
      id: crypto.randomUUID(), recipientId: inactive.id, type: 'task_completed', title: 'X',
      body: null, taskId: null, taskNumber: null, createdAt: new Date('2026-11-17T15:00:00Z'),
    }]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 1, skipped: 0, failed: 0, day: DAY });
    expect(state.sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(state.sendDigestEmail.mock.calls[0][0]).toBe(ana.email);
    expect(state.inserts[0].values).toEqual([{ personId: ana.id, day: DAY }]);
  });
});

describe('POST /api/cron/daily-digest: idempotencia', () => {
  it('si el insert no devuelve filas (ya reclamado) no envía', async () => {
    setPeople([person('Ana'), person('Beto')]);
    state.claim = () => [];
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 0, skipped: 2, failed: 0, day: DAY });
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
    expect(state.deletes).toHaveLength(0);
  });

  it('sólo envía a las personas que devuelve el insert', async () => {
    const ana = person('Ana');
    const beto = person('Beto');
    setPeople([ana, beto]);
    state.claim = () => [{ personId: beto.id }];
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 1, skipped: 1, failed: 0, day: DAY });
    expect(state.sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(state.sendDigestEmail.mock.calls[0][0]).toBe(beto.email);
  });

  it('si el run de hoy ya existe no reprocesa a esa persona', async () => {
    const ana = person('Ana');
    const beto = person('Beto');
    setPeople([ana, beto]);
    state.rows.set(digestRuns, [{ personId: ana.id, lastDay: DAY, lastAt: new Date('2026-11-17T11:31:00Z') }]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 1, skipped: 1, failed: 0, day: DAY });
    expect(state.sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(state.sendDigestEmail.mock.calls[0][0]).toBe(beto.email);
    expect(state.inserts[0].values).toEqual([{ personId: beto.id, day: DAY }]);
  });

  it('si todos ya lo recibieron hoy, sent 0 y sin insert', async () => {
    const ana = person('Ana');
    setPeople([ana]);
    state.rows.set(digestRuns, [{ personId: ana.id, lastDay: DAY, lastAt: new Date('2026-11-17T11:31:00Z') }]);
    const res = await POST(req());
    expect(await res.json()).toEqual({ sent: 0, skipped: 1, failed: 0, day: DAY });
    expect(db.insert).not.toHaveBeenCalled();
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/daily-digest: dryRun y sin correo', () => {
  it('dryRun=1 calcula sin insertar ni enviar', async () => {
    setPeople([person('Ana'), person('Beto')]);
    const res = await POST(req({ query: '?dryRun=1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, skipped: 0, day: DAY, dryRun: true, wouldSend: 2 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin RESEND_API_KEY no inserta ni envía y avisa con emailDisabled', async () => {
    delete process.env.RESEND_API_KEY;
    setPeople([person('Ana'), person('Beto')]);
    state.rows.set(tasks, [...(state.rows.get(tasks) ?? []).slice(0, 1)]);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 0, skipped: 1, day: DAY, wouldSend: 1, emailDisabled: true });
    expect(db.insert).not.toHaveBeenCalled();
    expect(state.sendDigestEmail).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/daily-digest: errores', () => {
  it('un fallo de la BD responde 500 por handleError', async () => {
    vi.mocked(db.select).mockImplementationOnce(() => { throw new Error('boom'); });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });
});
