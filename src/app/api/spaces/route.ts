import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaces, spaceMembers } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canCreateSpace } from '@/lib/permissions';
import { createSpaceSchema } from '@/lib/schemas/space';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { todayRD } from '@/lib/date-utils';
import { eq, desc, and, inArray } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await requireSession();

    if (session.role === 'admin') {
      const allSpaces = await db
        .select()
        .from(spaces)
        .orderBy(desc(spaces.createdAt));
      return success(allSpaces);
    }

    const memberOf = await db
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(eq(spaceMembers.personId, session.id));

    const spaceIds = memberOf.map(r => r.spaceId);

    if (spaceIds.length === 0) return success([]);

    const userSpaces = await db
      .select()
      .from(spaces)
      .where(inArray(spaces.id, spaceIds))
      .orderBy(desc(spaces.createdAt));

    return success(userSpaces);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    if (!canCreateSpace(session.role)) {
      return error('Sin permisos para crear espacios', 403);
    }

    const body = await req.json();
    const input = createSpaceSchema.parse(body);

    if (input.type === 'recurrente' && session.role !== 'admin') {
      return error('Solo admin puede crear espacios recurrentes', 403);
    }

    const space = await db.transaction(async (tx) => {
      const [s] = await tx.insert(spaces).values({
        name: input.name,
        type: input.type,
        objective: input.objective,
        targetDate: input.targetDate,
        leaderId: input.leaderId,
        ownerId: session.id,
        openDate: todayRD(),
        status: input.type === 'recurrente' ? 'borrador' : 'activo',
      }).returning();

      await tx.insert(spaceMembers).values({
        spaceId: s.id,
        personId: session.id,
        spaceRole: 'dueño',
      });

      if (input.memberIds?.length) {
        const memberValues = input.memberIds
          .filter(id => id !== session.id)
          .map(id => ({
            spaceId: s.id,
            personId: id,
            spaceRole: 'colaborador' as const,
          }));
        if (memberValues.length) {
          await tx.insert(spaceMembers).values(memberValues);
        }
      }

      return s;
    });

    await logAudit({
      actorId: session.id,
      action: 'space_created',
      spaceId: space.id,
      newValue: JSON.stringify({ name: space.name, type: space.type }),
    });

    return success(space, 201);
  } catch (err) {
    return handleError(err);
  }
}
