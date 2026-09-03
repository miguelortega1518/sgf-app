import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { comments, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canComment } from '@/lib/permissions';
import { success, error, handleError } from '@/lib/api-utils';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const addCommentSchema = z.object({
  content: z.string().min(1, 'Contenido requerido').max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id: taskId } = await params;
    const body = await req.json();
    const input = addCommentSchema.parse(body);

    if (!canComment(session.role as 'admin' | 'miembro' | 'observador')) {
      return error('Sin permisos para comentar', 403);
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task) return error('Tarea no encontrada', 404);

    const [created] = await db
      .insert(comments)
      .values({
        taskId,
        authorId: session.id,
        content: input.content,
      })
      .returning();

    return success(created, 201);
  } catch (err) {
    return handleError(err);
  }
}
