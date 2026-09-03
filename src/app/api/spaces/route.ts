import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaces, spaceMembers } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canCreateSpace } from '@/lib/permissions';
import { createSpaceSchema } from '@/lib/schemas/space';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { todayRD } from '@/lib/date-utils';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    await requireSession();
    const allSpaces = await db
      .select()
      .from(spaces)
      .orderBy(desc(spaces.createdAt));
    return success(allSpaces);
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

    const [space] = await db.insert(spaces).values({
      name: input.name,
      type: input.type,
      objective: input.objective,
      targetDate: input.targetDate,
      ownerId: session.id,
      openDate: todayRD(),
      status: input.type === 'recurrente' ? 'borrador' : 'activo',
    }).returning();

    await db.insert(spaceMembers).values({
      spaceId: space.id,
      personId: session.id,
      spaceRole: 'dueño',
    });

    if (input.memberIds?.length) {
      const memberValues = input.memberIds
        .filter(id => id !== session.id)
        .map(id => ({
          spaceId: space.id,
          personId: id,
          spaceRole: 'colaborador' as const,
        }));
      if (memberValues.length) {
        await db.insert(spaceMembers).values(memberValues);
      }
    }

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
