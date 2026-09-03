import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { evidence, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const addEvidenceSchema = z.object({
  urlOrFile: z.string().min(1, 'URL o nombre de archivo requerido'),
  type: z.enum(['enlace', 'archivo', 'captura']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const body = await req.json();
    const input = addEvidenceSchema.parse(body);

    if (session.role === 'observador') {
      return error('Sin permisos', 403);
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return error('Tarea no encontrada', 404);

    const [created] = await db
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
    const { searchParams } = new URL(req.url);
    const evidenceId = searchParams.get('evidenceId');

    if (!evidenceId) return error('evidenceId requerido', 400);

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

    await db.delete(evidence).where(eq(evidence.id, evidenceId));

    await logAudit({
      actorId: session.id,
      action: 'evidence_removed',
      taskId,
      previousValue: `${ev.type}: ${ev.urlOrFile}`,
    });

    return success({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
