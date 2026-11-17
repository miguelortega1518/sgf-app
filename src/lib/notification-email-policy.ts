/**
 * Qué avisos salen por correo al momento. La campana in-app recibe siempre todos; el correo inmediato
 * sólo lo importante (asignación, revisión y bloqueo). El resto queda con email_sent=false para el
 * resumen diario. Lógica pura: sin BD ni variables de entorno.
 */
export const IMMEDIATE_EMAIL_TYPES = ['task_assigned', 'review_assigned', 'task_review', 'task_blocked'] as const;

export type ImmediateEmailType = (typeof IMMEDIATE_EMAIL_TYPES)[number];

const IMMEDIATE_SET: ReadonlySet<string> = new Set(IMMEDIATE_EMAIL_TYPES);

export function shouldSendImmediateEmail(params: { type: string; emailImmediate: boolean }): boolean {
  return params.emailImmediate === true && IMMEDIATE_SET.has(params.type);
}

export type EmailPreferences = { emailImmediate: boolean; emailDigest: boolean };

/** Texto legible para audit_log, p. ej. 'Avisos inmediatos: sí · Resumen diario: no'. */
export function formatEmailPreferences(prefs: EmailPreferences): string {
  const yesNo = (v: boolean) => (v ? 'sí' : 'no');
  return `Avisos inmediatos: ${yesNo(prefs.emailImmediate)} · Resumen diario: ${yesNo(prefs.emailDigest)}`;
}
