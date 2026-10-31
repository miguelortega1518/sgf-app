import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { persons } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import type { Person } from './db/schema';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = new TextEncoder().encode(jwtSecret);
const COOKIE_NAME = 'sgf-session';
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 días

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Person['role'];
};

// Estado y rol vigentes: nunca autorizar con una caché local o el JWT antiguo.
export type UserFlags = { active: boolean; mustChangePassword: boolean; role: Person['role'] };
export async function getUserFlags(userId: string): Promise<UserFlags> {
  const [user] = await db
    .select({ active: persons.active, mustChangePassword: persons.mustChangePassword, role: persons.role })
    .from(persons)
    .where(eq(persons.id, userId))
    .limit(1);

  const flags: UserFlags = {
    active: user?.active ?? false,
    mustChangePassword: user?.mustChangePassword ?? false,
    role: user?.role ?? 'observador',
  };

  return flags;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = await new SignJWT({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${SESSION_DURATION}s`)
    .setIssuedAt()
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });

  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Exige una sesión válida de una cuenta activa. Si la cuenta tiene una contraseña temporal pendiente de
 * cambio, bloquea todo salvo lo que pase `allowPasswordChange` (cambiar la contraseña y salir).
 */
export async function requireSession(options?: { allowPasswordChange?: boolean }): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED');
  }

  const flags = await getUserFlags(session.id);
  if (!flags.active) {
    throw new Error('UNAUTHORIZED');
  }
  if (flags.mustChangePassword && !options?.allowPasswordChange) {
    throw new Error('PASSWORD_CHANGE_REQUIRED');
  }

  // Rol autoritativo desde DB: anula el valor potencialmente obsoleto del JWT
  return { ...session, role: flags.role };
}

export async function requireRole(
  ...roles: Person['role'][]
): Promise<SessionUser> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new Error('FORBIDDEN');
  }
  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export type AuthenticatedUser = SessionUser & { mustChangePassword: boolean };

export async function authenticate(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const [user] = await db
    .select()
    .from(persons)
    .where(eq(sql`lower(${persons.email})`, normalizedEmail))
    .limit(1);

  if (!user || !user.active) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}
