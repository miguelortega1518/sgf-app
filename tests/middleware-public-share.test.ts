import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from '../src/middleware';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6';

describe('middleware y la vista pública /compartido', () => {
  it('el matcher sigue limitado a la API', () => {
    expect(config.matcher).toBe('/api/:path*');
  });

  it('/compartido/<token> pasa sin redirección ni 401/403', async () => {
    const res = await middleware(new NextRequest(`http://localhost/compartido/${TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    // NextResponse.next() marca la respuesta con x-middleware-next.
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});
