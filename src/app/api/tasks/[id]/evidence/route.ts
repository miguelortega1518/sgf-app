import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { evidence } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { requireTaskAccess, assertValidUuid } from '@/lib/project-access';
import { isHttpUrl } from '@/lib/validation';

const addEvidenceSchema = z.object({
  urlOrFile: z.string().trim().min(1, 'Nombre o enlace requerido').max(2000),
  type: z.enum(['enlace', 'archivo', 'captura']),
}).refine(value => value.type !== 'enlace' || isHttpUrl(value.urlOrFile), {
  message: 'Se requiere un enlace http(s) válido',
  path: ['urlOrFile'],
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');
    const body = await req.json();
    const input = addEvidenceSchema.parse(body);

    if (session.role === 'observador') {
      return error('Sin permisos', 403);
    }



    const created = await db.transaction(async tx => {
    const [created] = await tx
      .insert(evidence)
      .values({
        taskId,
        urlOrFile: input.urlOrFile,
        type: input.type,
        uploadedBy: session.id,
      })
      .returning();

    await logAudit({
      actorId: session.id,
      action: 'evidence_added',
      taskId,
      newValue: `${input.type}: ${input.urlOrFile}`,
    }, tx);
    return created;
    });

    return success(created, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    await requireTaskAccess(session, taskId, 'write');
    const { searchParams } = new URL(req.url);
    const evidenceId = searchParams.get('evidenceId');

    if (!evidenceId) return error('evidenceId requerido', 400);
    assertValidUuid(evidenceId);

    if (session.role === 'observador') {
      return error('Sin permisos', 403);
    }

    const [ev] = await db
      .select()
      .from(evidence)
      .where(
        and(eq(evidence.id, evidenceId), eq(evidence.taskId, taskId)),
      )
      .limit(1);

    if (!ev) return error('Evidencia no encontrada', 404);

    if (ev.uploadedBy !== session.id && session.role !== 'admin') {
      return error('Solo el autor o un admin puede eliminar esta evidencia', 403);
    }

    await db.transaction(async tx => {
    await tx.delete(evidence).where(eq(evidence.id, evidenceId));

    await logAudit({
      actorId: session.id,
      action: 'evidence_removed',
      taskId,
      previousValue: `${ev.type}: ${ev.urlOrFile}`,
    }, tx);
    });

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
