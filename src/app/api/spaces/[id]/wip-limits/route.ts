import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaces } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';
import { requireProjectAccess } from '@/lib/project-access';
import { wipLimitsSchema } from '@/lib/schemas/wip-limits';
import { WIP_LIMITED_STATUSES, parseWipLimits, wipLimitAuditValue } from '@/lib/wip-limits';
import { logAudit } from '@/lib/audit';

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

/**
 * Guarda los límites de trabajo en curso del proyecto. Lo puede hacer quien tiene
 * escritura en el proyecto (no sólo el dueño, a diferencia de PATCH /api/spaces/[id]).
 * Los límites sólo avisan en el tablero: nunca bloquean mover tareas.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (session.role === 'observador') return error('Sin permisos', 403);
    const { id } = await params;
    // Valida el uuid (400 sin BD), el acceso de escritura (403/404) y que no esté cerrado (409).
    await requireProjectAccess(session, id, 'write');
    const input = wipLimitsSchema.parse(await req.json());

    const saved = await db.transaction(async tx => {
      const [current] = await tx.select().from(spaces).where(eq(spaces.id, id)).for('update');
      if (!current) throw httpError('Proyecto no encontrado', 404);
      if (current.status === 'cerrado') throw httpError('El proyecto está cerrado', 409);

      const previous = parseWipLimits(current.wipLimits);
      const changed = WIP_LIMITED_STATUSES.filter(status => previous[status] !== input[status]);
      if (changed.length === 0) return previous;

      const [row] = await tx.update(spaces)
        .set({ wipLimits: input, updatedAt: new Date() })
        .where(eq(spaces.id, id))
        .returning();

      // Auditoría de proyecto (sin taskId): un registro por límite que cambia.
      for (const status of changed) {
        await logAudit({
          actorId: session.id,
          action: 'wip_limit_changed',
          spaceId: id,
          previousValue: wipLimitAuditValue(current.name, status, previous[status]),
          newValue: wipLimitAuditValue(current.name, status, input[status]),
        }, tx);
      }

      return parseWipLimits(row.wipLimits);
    });

    return success(saved);
  } catch (err) {
    return handleError(err);
  }
}
