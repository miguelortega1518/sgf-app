import { db } from './db';
import { notifications } from './db/schema';
import { eq } from 'drizzle-orm';

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'SGF <noreply@sgf.grupoblb.do>',
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });
    return res.ok;
  } catch {
    console.error('Email send failed');
    return false;
  }
}

export async function sendNotificationEmail(
  notificationId: string,
  recipientEmail: string,
  title: string,
  body: string | null,
) {
  const sent = await sendEmail({
    to: recipientEmail,
    subject: `SGF: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1e40af; font-size: 16px;">${title}</h2>
        ${body ? `<p style="color: #374151; font-size: 14px;">${body}</p>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Este correo fue enviado por el Sistema de Gestión Financiera (SGF).
        </p>
      </div>
    `,
  });

  if (sent) {
    await db
      .update(notifications)
      .set({ emailSent: true })
      .where(eq(notifications.id, notificationId));
  }

  return sent;
}
