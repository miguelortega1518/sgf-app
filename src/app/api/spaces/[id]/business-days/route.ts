import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaces } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';
import { requireProjectAccess } from '@/lib/project-access';
import { businessDaysSchema } from '@/lib/schemas/space-settings';
import { logAudit } from '@/lib/audit';

function httpError(message: string, httpStatus: number) {
  return Object.assign(new Error(message), { httpStatus });
}

/** Valor legible de business_days_changed: 'Portal: Sólo días hábiles (RD)' o 'Portal: Días naturales'. */
function businessDaysAuditValue(spaceName: string, businessDaysOnly: boolean): string {
  return `${spaceName}: ${businessDaysOnly ? 'Sólo días hábiles (RD)' : 'Días naturales'}`;
}

/**
 * Ajuste del proyecto «Contar sólo días hábiles (RD)»: afecta a la duración por
 * defecto de los sprints nuevos y al tiempo de ciclo de la retrospectiva.
 * Lo puede cambiar quien tiene escritura en el proyecto.
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
    const input = businessDaysSchema.parse(await req.json());

    const saved = await db.transaction(async tx => {
      const [current] = await tx.select().from(spaces).where(eq(spaces.id, id)).for('update');
      if (!current) throw httpError('Proyecto no encontrado', 404);
      if (current.status === 'cerrado') throw httpError('El proyecto está cerrado', 409);
      if (current.businessDaysOnly === input.businessDaysOnly) return { businessDaysOnly: current.businessDaysOnly };

      const [row] = await tx.update(spaces)
        .set({ businessDaysOnly: input.businessDaysOnly, updatedAt: new Date() })
        .where(eq(spaces.id, id))
        .returning();

      await logAudit({
        actorId: session.id,
        action: 'business_days_changed',
        spaceId: id,
        previousValue: businessDaysAuditValue(current.name, current.businessDaysOnly),
        newValue: businessDaysAuditValue(current.name, input.businessDaysOnly),
      }, tx);

      return { businessDaysOnly: row.businessDaysOnly };
    });

    return success(saved);
  } catch (err) {
    return handleError(err);
  }
}
