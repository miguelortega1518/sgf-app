import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock('@/lib/db/schema', () => ({
  notifications: { id: 'notifications.id' },
  persons: { id: 'persons.id', email: 'persons.email', active: 'persons.active' },
}));
vi.mock('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ op: 'eq', l, r }),
}));
vi.mock('@/lib/email', () => ({ sendNotificationEmail: mocks.sendNotificationEmail }));

import { notify } from '../src/lib/notify';

const recipientId = crypto.randomUUID();
const taskId = crypto.randomUUID();
const notifId = crypto.randomUUID();
const originalKey = process.env.RESEND_API_KEY;

function personRows(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit']) builder[method] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  mocks.select.mockReturnValue(builder);
}

const params = { recipientId, type: 'task_assigned', title: 'Te asignaron: FOR-1 X', body: 'Cuerpo', taskId };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: notifId, ...params }]);
  mocks.sendNotificationEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

describe('notify', () => {
  it('persona activa: inserta y envía correo si hay RESEND_API_KEY', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    personRows([{ active: true, email: 'ana@example.com' }]);

    const result = await notify(params);

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ recipientId, type: 'task_assigned', taskId }));
    expect(mocks.sendNotificationEmail).toHaveBeenCalledWith(notifId, 'ana@example.com', params.title, 'Cuerpo');
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: notifId });
  });

  it('persona inactiva: ni inserta ni envía correo y devuelve null', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    personRows([{ active: false, email: 'ana@example.com' }]);

    const result = await notify(params);

    expect(result).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('persona inexistente: ni inserta ni envía correo', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    personRows([]);

    const result = await notify(params);

    expect(result).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('persona activa sin RESEND_API_KEY: inserta sin correo', async () => {
    delete process.env.RESEND_API_KEY;
    personRows([{ active: true, email: 'ana@example.com' }]);

    const result = await notify(params);

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: notifId });
  });
});
