import { NextRequest } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { spaceMembers, spaceShareLinks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { computeProjectAccess, requireProjectAccess } from '@/lib/project-access';
import { isUniqueConstraintViolation } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { generateShareToken, shareLinkPath } from '@/lib/share-links';

const ALREADY_ACTIVE = 'El proyecto ya tiene un enlace público activo; revóquelo antes de crear otro';
const NOT_ACTIVE = 'El proyecto no tiene un enlace público activo';

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

/** Valores legibles de la auditoría: el nombre del proyecto, nunca el token ni su hash. */
function activeAuditValue(name: string) {
  return `${name}: enlace público activo`;
}

function revokedAuditValue(name: string) {
  return `${name}: enlace público revocado`;
}

/**
 * URL absoluta del enlace. La base sale sólo de NEXT_PUBLIC_APP_URL (leída en cada petición),
 * nunca de las cabeceras: así un Host falso no puede fabricar enlaces a otro dominio.
 */
function absoluteUrl(path: string): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : null;
}

function activeLinkCondition(spaceId: string) {
  return and(eq(spaceShareLinks.spaceId, spaceId), isNull(spaceShareLinks.revokedAt));
}

/** Estado del enlace público del proyecto. Nunca devuelve el token ni su hash. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    // Valida el uuid (400 sin BD) y el acceso de lectura (403/404).
    await requireProjectAccess(session, id, 'read');

    const [link] = await db
      .select({ createdAt: spaceShareLinks.createdAt })
      .from(spaceShareLinks)
      .where(activeLinkCondition(id))
      .limit(1);

    return success({
      active: !!link,
      createdAt: link ? new Date(link.createdAt).toISOString() : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Crea el enlace público de sólo lectura. Es la única vez que se devuelve el token:
 * en la BD sólo queda su SHA-256.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    // Valida el uuid (400 sin BD), el acceso de escritura (403/404) y que no esté cerrado (409).
    const space = await requireProjectAccess(session, id, 'write');

    const { token, tokenHash } = generateShareToken();

    const created = await db.transaction(async tx => {
      const [existing] = await tx
        .select({ createdAt: spaceShareLinks.createdAt })
        .from(spaceShareLinks)
        .where(activeLinkCondition(id))
        .limit(1);
      if (existing) throw httpError(ALREADY_ACTIVE, 409);

      let row: { createdAt: Date };
      try {
        [row] = await tx
          .insert(spaceShareLinks)
          .values({ spaceId: id, tokenHash, createdBy: session.id })
          .returning({ createdAt: spaceShareLinks.createdAt });
      } catch (err) {
        // Carrera con otra creación: el índice parcial uq_share_link_active_per_space lo impide.
        if (isUniqueConstraintViolation(err)) throw httpError(ALREADY_ACTIVE, 409);
        throw err;
      }

      await logAudit({
        actorId: session.id,
        action: 'share_link_created',
        spaceId: id,
        newValue: activeAuditValue(space.name),
      }, tx);

      return row;
    });

    const path = shareLinkPath(token);
    return success({
      token,
      path,
      url: absoluteUrl(path),
      createdAt: new Date(created.createdAt).toISOString(),
    }, 201);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Revoca el enlace activo. Se permite también en proyectos cerrados: cortar un enlace
 * filtrado es una medida de seguridad. Por eso no usa requireProjectAccess(..., 'write'),
 * que respondería 409, sino la lectura más computeProjectAccess(..., 'write').
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    // Valida el uuid (400 sin BD), la existencia (404) y la pertenencia (403).
    const space = await requireProjectAccess(session, id, 'read');

    const [membership] = await db
      .select({ spaceRole: spaceMembers.spaceRole })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, id), eq(spaceMembers.personId, session.id)))
      .limit(1);
    const denied = computeProjectAccess(session, space.ownerId, membership, 'write');
    if (denied) return error(denied.message, denied.httpStatus);

    await db.transaction(async tx => {
      const revoked = await tx
        .update(spaceShareLinks)
        .set({ revokedAt: new Date() })
        .where(activeLinkCondition(id))
        .returning();
      if (revoked.length === 0) throw httpError(NOT_ACTIVE, 404);

      await logAudit({
        actorId: session.id,
        action: 'share_link_revoked',
        spaceId: id,
        previousValue: activeAuditValue(space.name),
        newValue: revokedAuditValue(space.name),
      }, tx);
    });

    return success({ revoked: true });
  } catch (err) {
    return handleError(err);
  }
}
