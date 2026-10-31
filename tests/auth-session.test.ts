import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock ANTES de importar los módulos bajo prueba
vi.mock('@/lib/db', () => {
  const mockDb = {
    select: vi.fn(),
  };
  return { db: mockDb, schema: {} };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('jose', () => ({
  SignJWT: vi.fn(),
  jwtVerify: vi.fn(),
}));

// Importaciones después de los mocks
import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { requireSession } from '../src/lib/auth';

const mockDb = db as { select: ReturnType<typeof vi.fn> };

function buildChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function setupJwt(payload: Record<string, unknown>) {
  (jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ payload });
}

function setupCookie(token: string) {
  (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: () => ({ value: token }),
  });
}

describe('requireSession — rol autoritativo desde DB', () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it('devuelve rol actual de DB aunque el JWT diga admin', async () => {
    setupCookie('valid-token');
    setupJwt({ id: 'downgraded-admin', name: 'Ana', email: 'ana@test.com', role: 'admin' });

    // DB dice: active, no password change requerido, rol=miembro (bajado de admin)
    buildChain([{ active: true, mustChangePassword: false, role: 'miembro' }]);

    const session = await requireSession();
    expect(session.role).toBe('miembro');
    // El JWT decía admin, pero la DB dice miembro
    expect(session.id).toBe('downgraded-admin');
  });

  it('rechaza usuario inactivo aunque el JWT sea válido', async () => {
    setupCookie('valid-token');
    setupJwt({ id: 'inactive-user', name: 'Bob', email: 'bob@test.com', role: 'miembro' });
    buildChain([{ active: false, mustChangePassword: false, role: 'miembro' }]);

    await expect(requireSession()).rejects.toThrow('UNAUTHORIZED');
  });

  it('lanza PASSWORD_CHANGE_REQUIRED cuando corresponde', async () => {
    setupCookie('valid-token');
    setupJwt({ id: 'user-1', name: 'Carlos', email: 'c@test.com', role: 'miembro' });
    buildChain([{ active: true, mustChangePassword: true, role: 'miembro' }]);

    await expect(requireSession()).rejects.toThrow('PASSWORD_CHANGE_REQUIRED');
  });

  it('permite PASSWORD_CHANGE con opción allowPasswordChange', async () => {
    setupCookie('valid-token');
    setupJwt({ id: 'user-1', name: 'Carlos', email: 'c@test.com', role: 'miembro' });
    buildChain([{ active: true, mustChangePassword: true, role: 'miembro' }]);

    const session = await requireSession({ allowPasswordChange: true });
    expect(session).toBeDefined();
  });

  it('relee el rol en cada petición sin invalidación local', async () => {
    setupCookie('valid-token');
    setupJwt({ id: 'fresh-role', name: 'Ana', email: 'a@test.com', role: 'admin' });
    buildChain([{ active: true, mustChangePassword: false, role: 'admin' }]);
    expect((await requireSession()).role).toBe('admin');
    buildChain([{ active: true, mustChangePassword: false, role: 'observador' }]);
    expect((await requireSession()).role).toBe('observador');
  });

  it('lanza UNAUTHORIZED si no hay cookie', async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => undefined,
    });

    await expect(requireSession()).rejects.toThrow('UNAUTHORIZED');
  });
});
