import { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, gte, inArray, lte, max, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { digestRuns, holidays, notifications, persons, spaces, tasks } from '@/lib/db/schema';
import { success, error, handleError } from '@/lib/api-utils';
import { verifyCronAuthorization } from '@/lib/cron-auth';
import { todayRD } from '@/lib/date-utils';
import { isBusinessDay } from '@/lib/business-days';
import { buildDailyDigest, groupDigestInputs, type DailyDigest } from '@/lib/daily-digest';
import { sendDigestEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

/**
 * Resumen diario por correo. Ruta pública: la única defensa es la cabecera
 * `Authorization: Bearer <CRON_SECRET>`. La llama un workflow programado de
 * GitHub Actions (ver docs/OPERACIONES.md §12).
 *
 * Idempotencia: digest_runs(person_id, day). Se reclama la fila antes de enviar
 * y se borra si el envío falla, para que una nueva llamada lo reintente.
 * Sin logAudit: no hay actor ni mutación de dominio; el rastro queda en digest_runs.
 */

const querySchema = z.object({
  dryRun: z.enum(['0', '1'], { message: 'dryRun debe ser 0 o 1' }).optional(),
});

/** Ventana de novedades para quien nunca recibió un resumen. */
const FIRST_DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Recipient = { id: string; name: string; email: string; digest: DailyDigest };

export async function POST(req: NextRequest) {
  try {
    if (!verifyCronAuthorization(process.env.CRON_SECRET, req.headers.get('authorization'))) {
      return error('No autorizado', 401);
    }

    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const dryRun = query.dryRun === '1';

    const day = todayRD();
    const holidayRows = await db.select({ date: holidays.date }).from(holidays).where(eq(holidays.date, day));
    if (!isBusinessDay(day, new Set(holidayRows.map(h => h.date)))) {
      return success({ skipped: 'no_laborable', day });
    }

    const eligible = await db
      .select({ id: persons.id, name: persons.name, email: persons.email })
      .from(persons)
      .where(and(eq(persons.active, true), eq(persons.emailDigest, true)));
    if (eligible.length === 0) return success({ sent: 0, skipped: 0, failed: 0, day });

    const runs = await db
      .select({ personId: digestRuns.personId, lastDay: max(digestRuns.day), lastAt: max(digestRuns.createdAt) })
      .from(digestRuns)
      .where(inArray(digestRuns.personId, eligible.map(p => p.id)))
      .groupBy(digestRuns.personId);
    const runByPerson = new Map(runs.map(r => [r.personId, r]));

    // Quien ya tiene el resumen de hoy no se vuelve a procesar.
    const pending = eligible.filter(p => runByPerson.get(p.id)?.lastDay !== day);
    let skipped = eligible.length - pending.length;
    if (pending.length === 0) return success({ sent: 0, skipped, failed: 0, day });

    const ids = pending.map(p => p.id);
    const now = Date.now();
    const since = new Map<string, number>();
    for (const id of ids) {
      const lastAt = runByPerson.get(id)?.lastAt;
      since.set(id, lastAt ? new Date(lastAt).getTime() : now - FIRST_DIGEST_WINDOW_MS);
    }
    const minSince = new Date(Math.min(...since.values()));

    const taskRows = await db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        responsibleId: tasks.responsibleId,
        reviewerId: tasks.reviewerId,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .where(and(
        eq(tasks.archived, false),
        ne(spaces.status, 'cerrado'),
        ne(tasks.status, 'completada'),
        or(
          and(
            inArray(tasks.responsibleId, ids),
            or(lte(tasks.dueDate, day), eq(tasks.status, 'bloqueada')),
          ),
          and(inArray(tasks.reviewerId, ids), eq(tasks.status, 'en_revision')),
        ),
      ));

    const notificationRows = await db
      .select({
        id: notifications.id,
        recipientId: notifications.recipientId,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        taskId: notifications.taskId,
        taskNumber: tasks.number,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(tasks, eq(notifications.taskId, tasks.id))
      .where(and(
        inArray(notifications.recipientId, ids),
        eq(notifications.emailSent, false),
        gte(notifications.createdAt, minSince),
      ));

    const grouped = groupDigestInputs(ids, taskRows, notificationRows);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const toSend: Recipient[] = [];
    for (const p of pending) {
      const input = grouped.get(p.id)!;
      const personSince = since.get(p.id)!;
      const digest = buildDailyDigest({
        person: { id: p.id, name: p.name },
        today: day,
        baseUrl,
        tasks: input.tasks,
        // Sólo lo posterior al último resumen de esta persona (o a su ventana inicial).
        notifications: input.notifications.filter(n => new Date(n.createdAt).getTime() > personSince),
      });
      if (digest) toSend.push({ ...p, digest });
      else skipped++;
    }

    const emailDisabled = !process.env.RESEND_API_KEY;
    if (dryRun || emailDisabled) {
      logger.info('daily_digest', { day, dryRun, emailDisabled, wouldSend: toSend.length, skipped });
      return success({
        sent: 0,
        skipped,
        day,
        ...(dryRun ? { dryRun: true } : {}),
        wouldSend: toSend.length,
        ...(emailDisabled ? { emailDisabled: true } : {}),
      });
    }

    if (toSend.length === 0) {
      logger.info('daily_digest', { day, sent: 0, skipped, failed: 0 });
      return success({ sent: 0, skipped, failed: 0, day });
    }

    // Reclamar en una sola sentencia: sólo se envía a quien devuelve el insert.
    const claimed = await db
      .insert(digestRuns)
      .values(toSend.map(r => ({ personId: r.id, day })))
      .onConflictDoNothing()
      .returning({ personId: digestRuns.personId });
    const claimedIds = new Set(claimed.map(c => c.personId));

    let sent = 0;
    const failedIds: string[] = [];
    for (const r of toSend) {
      if (!claimedIds.has(r.id)) {
        skipped++;
        continue;
      }
      const ok = await sendDigestEmail(r.email, r.digest);
      if (ok) sent++;
      else failedIds.push(r.id);
    }

    if (failedIds.length > 0) {
      await db
        .delete(digestRuns)
        .where(and(eq(digestRuns.day, day), inArray(digestRuns.personId, failedIds)));
    }

    const failed = failedIds.length;
    logger.info('daily_digest', { day, sent, skipped, failed });
    return success({ sent, skipped, failed, day });
  } catch (err) {
    return handleError(err);
  }
}
