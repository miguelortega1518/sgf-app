import { db } from './db';
import { notifications, persons } from './db/schema';
import { eq } from 'drizzle-orm';
import { sendNotificationEmail } from './email';

type NotifyParams = {
  recipientId: string;
  type: string;
  title: string;
  body?: string;
  taskId?: string;
  spaceId?: string;
};

/** Crea la notificación (y el correo si hay RESEND_API_KEY). Devuelve null si la persona no existe o está inactiva. */
export async function notify(params: NotifyParams) {
  const [recipient] = await db
    .select({ active: persons.active, email: persons.email })
    .from(persons)
    .where(eq(persons.id, params.recipientId))
    .limit(1);

  if (!recipient || !recipient.active) return null;

  const [notif] = await db
    .insert(notifications)
    .values({
      recipientId: params.recipientId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      taskId: params.taskId ?? null,
      spaceId: params.spaceId ?? null,
    })
    .returning();

  if (process.env.RESEND_API_KEY && recipient.email) {
    sendNotificationEmail(
      notif.id,
      recipient.email,
      params.title,
      params.body ?? null,
    ).catch(() => {});
  }

  return notif;
}
