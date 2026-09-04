import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const COOKIE_NAME = 'sgf-session';
const REFRESH_AFTER_S = 6 * 60 * 60; // 6 hours
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  // CSRF check for mutations
  if (MUTATION_METHODS.has(req.method)) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');

    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // JWT sliding session: refresh token if older than 6 hours
  const secret = getJwtSecret();
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (secret && token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      const iat = payload.iat ?? 0;
      const age = Math.floor(Date.now() / 1000) - iat;

      if (age > REFRESH_AFTER_S) {
        const newToken = await new SignJWT({
          id: payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime(`${SESSION_DURATION}s`)
          .setIssuedAt()
          .sign(secret);

        const response = NextResponse.next();
        response.cookies.set(COOKIE_NAME, newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: SESSION_DURATION,
          path: '/',
        });
        return response;
      }
    } catch {
      // Token invalid or expired — let requireSession() handle it
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
