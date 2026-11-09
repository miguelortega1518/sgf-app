import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { update: mocks.update } }));
vi.mock('@/lib/db/schema', () => ({ notifications: { id: 'id' } }));
vi.mock('drizzle-orm', () => ({
  eq: (l: unknown, r: unknown) => ({ op: 'eq', l, r }),
}));

import { buildNotificationEmail, escapeHtml, sendNotificationEmail } from '../src/lib/email';

describe('escapeHtml', () => {
  it('escapa los cinco caracteres especiales', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('no escapa dos veces el ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('deja igual un texto sin caracteres especiales', () => {
    expect(escapeHtml('Tarea lista para revisión')).toBe('Tarea lista para revisión');
  });
});

describe('buildNotificationEmail', () => {
  it('escapa el HTML del título y del cuerpo', () => {
    const { html } = buildNotificationEmail(
      '<img src=x onerror=alert(1)>',
      '<a href="http://evil">x</a>',
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a href');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;a href');
  });

  it('omite el párrafo del cuerpo si body es null', () => {
    const { html } = buildNotificationEmail('Título', null);
    expect(html).not.toContain('color: #374151');
    expect(html.match(/<p\b/g)).toHaveLength(1);
  });

  it('omite el párrafo del cuerpo si body es cadena vacía', () => {
    const { html } = buildNotificationEmail('Título', '');
    expect(html).not.toContain('color: #374151');
    expect(html.match(/<p\b/g)).toHaveLength(1);
  });

  it('incluye el párrafo del cuerpo si hay body', () => {
    const { html } = buildNotificationEmail('Título', 'Hola');
    expect(html).toContain('<p style="color: #374151');
    expect(html).toContain('Hola');
    expect(html.match(/<p\b/g)).toHaveLength(2);
  });

  it('el asunto lleva la marca y el título sin escapar', () => {
    expect(buildNotificationEmail('A & B', null).subject).toBe('Forja: A & B');
    expect(buildNotificationEmail('A & B <x>', null).subject).toBe('Forja: A & B <x>');
  });

  it('usa la marca Forja y no SGF', () => {
    const { subject, html } = buildNotificationEmail('Título', 'Cuerpo');
    for (const text of [subject, html]) {
      expect(text).not.toContain('SGF');
      expect(text).not.toContain('Sistema de Gestión Financiera');
    }
    expect(html).toContain('Forja');
  });
});

describe('sendNotificationEmail', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValue(undefined);
    originalKey = process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it('devuelve false sin RESEND_API_KEY y no llama a fetch ni a la base', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendNotificationEmail('n-1', 'a@b.do', 'Título', null)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('envía el correo escapado y marca la notificación como enviada', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const title = 'Revisar <img src=x>';
    await expect(sendNotificationEmail('n-1', 'a@b.do', title, 'Cuerpo')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');

    const payload = JSON.parse(init.body as string);
    expect(payload.to).toBe('a@b.do');
    expect(payload.subject).toBe(`Forja: ${title}`);
    expect(payload.html).not.toContain('<img');
    expect(payload.html).toContain('&lt;img');

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({ emailSent: true });
    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(mocks.where).toHaveBeenCalledWith({ op: 'eq', l: 'id', r: 'n-1' });
  });

  it('devuelve false y no toca la base si Resend responde con error', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(sendNotificationEmail('n-1', 'a@b.do', 'Título', null)).resolves.toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('devuelve false sin lanzar si fetch falla', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendNotificationEmail('n-1', 'a@b.do', 'Título', null)).resolves.toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
