// Resumen diario por correo: lógica pura (sin BD, sin process.env y sin fetch).
// La ruta POST /api/cron/daily-digest carga las filas en bloque, las reparte con
// groupDigestInputs y llama a buildDailyDigest por persona.

import { formatDateRD, isOverdue } from './date-utils';
import { escapeHtml } from './email';
import { APP_NAME, DIGEST_SECTION_LABEL, notificationTypeLabel, taskKey } from './labels';

/** Máximo de novedades que se listan en un resumen; el resto se resume en «y N más». */
export const DIGEST_MAX_NEWS = 20;

export type DigestTask = {
  id: string;
  number: number;
  title: string;
  status: string;
  dueDate: string | null;
  responsibleId: string;
  reviewerId: string | null;
};

export type DigestNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
  taskNumber: number | null;
  createdAt: Date;
};

export type DailyDigestInput = {
  person: { id: string; name: string };
  /** Fecha de hoy en hora RD (YYYY-MM-DD). */
  today: string;
  baseUrl: string;
  tasks: DigestTask[];
  notifications: DigestNotification[];
};

export type DailyDigestCounts = {
  dueToday: number;
  overdue: number;
  review: number;
  blocked: number;
  news: number;
  newsMore: number;
};

export type DailyDigest = {
  subject: string;
  html: string;
  text: string;
  counts: DailyDigestCounts;
};

/** Una línea del resumen: clave opcional, título, enlace y detalle opcional. */
type DigestItem = { key: string; title: string; url: string; detail: string | null };

type TaskSection = { label: string; items: DigestItem[] };
type NewsGroup = { label: string; items: DigestItem[] };

function byDueDateThenNumber(a: DigestTask, b: DigestTask): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.number - b.number;
}

function taskItem(task: DigestTask, baseUrl: string): DigestItem {
  return { key: taskKey(task.number), title: task.title, url: `${baseUrl}/tareas/${task.id}`, detail: null };
}

function newsItem(n: DigestNotification, baseUrl: string): DigestItem {
  return {
    key: taskKey(n.taskNumber),
    title: n.title,
    url: n.taskId ? `${baseUrl}/tareas/${n.taskId}` : `${baseUrl}/notificaciones`,
    detail: n.body ? n.body : null,
  };
}

/** Novedades de la más reciente a la más antigua, recortadas y agrupadas por tipo. */
function groupNews(
  notifications: DigestNotification[],
  baseUrl: string,
): { groups: NewsGroup[]; shown: number; more: number } {
  const sorted = [...notifications].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const shown = sorted.slice(0, DIGEST_MAX_NEWS);
  const groups = new Map<string, NewsGroup>();
  for (const n of shown) {
    const label = notificationTypeLabel(n.type);
    let group = groups.get(label);
    if (!group) {
      group = { label, items: [] };
      groups.set(label, group);
    }
    group.items.push(newsItem(n, baseUrl));
  }
  return { groups: [...groups.values()], shown: shown.length, more: sorted.length - shown.length };
}

function moreLabel(more: number): string {
  // «y 1 más» / «y 5 más»: el número concuerda con la forma invariable «más».
  return `y ${more} más`;
}

// ─── Render ───────────────────────────────────────────

const LINK_STYLE = 'color: #1e40af; text-decoration: none;';

function itemHtml(item: DigestItem): string {
  const key = item.key ? `<strong>${escapeHtml(item.key)}</strong> ` : '';
  const detail = item.detail
    ? `<br /><span style="color: #6b7280; font-size: 13px;">${escapeHtml(item.detail)}</span>`
    : '';
  return `<li style="margin: 4px 0;"><a href="${escapeHtml(item.url)}" style="${LINK_STYLE}">${key}${escapeHtml(item.title)}</a>${detail}</li>`;
}

function listHtml(items: DigestItem[]): string {
  return `<ul style="padding-left: 18px; margin: 4px 0 12px; color: #374151; font-size: 14px;">${items.map(itemHtml).join('')}</ul>`;
}

function sectionTitleHtml(label: string, count: number): string {
  return `<h3 style="color: #111827; font-size: 15px; margin: 16px 0 4px;">${escapeHtml(label)} (${count})</h3>`;
}

function itemText(item: DigestItem): string {
  const key = item.key ? `${item.key} ` : '';
  const line = `- ${key}${item.title} — ${item.url}`;
  return item.detail ? `${line}\n  ${item.detail}` : line;
}

// ─── API ──────────────────────────────────────────────

/**
 * Arma el resumen diario de una persona. Devuelve null si las cinco secciones
 * están vacías. El HTML lleva todo el texto de usuario escapado; el asunto y el
 * texto plano van sin escapar.
 */
export function buildDailyDigest(input: DailyDigestInput): DailyDigest | null {
  const { person, today } = input;
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const open = input.tasks.filter(t => t.status !== 'completada');
  const mine = open.filter(t => t.responsibleId === person.id);

  const dueToday = mine.filter(t => t.dueDate === today).sort(byDueDateThenNumber);
  const overdue = mine.filter(t => isOverdue(t.dueDate, t.status)).sort(byDueDateThenNumber);
  const review = open
    .filter(t => t.status === 'en_revision' && t.reviewerId === person.id)
    .sort(byDueDateThenNumber);
  const blocked = mine.filter(t => t.status === 'bloqueada').sort(byDueDateThenNumber);
  const news = groupNews(input.notifications, baseUrl);

  const counts: DailyDigestCounts = {
    dueToday: dueToday.length,
    overdue: overdue.length,
    review: review.length,
    blocked: blocked.length,
    news: news.shown,
    newsMore: news.more,
  };
  if (counts.dueToday + counts.overdue + counts.review + counts.blocked + counts.news === 0) return null;

  const sections: TaskSection[] = [
    { label: DIGEST_SECTION_LABEL.dueToday, items: dueToday.map(t => taskItem(t, baseUrl)) },
    { label: DIGEST_SECTION_LABEL.overdue, items: overdue.map(t => taskItem(t, baseUrl)) },
    { label: DIGEST_SECTION_LABEL.review, items: review.map(t => taskItem(t, baseUrl)) },
    { label: DIGEST_SECTION_LABEL.blocked, items: blocked.map(t => taskItem(t, baseUrl)) },
  ].filter(s => s.items.length > 0);

  const dateLabel = formatDateRD(today);
  const subject = `${APP_NAME}: tu resumen del ${dateLabel}`;
  const notificationsUrl = `${baseUrl}/notificaciones`;

  // Texto plano
  const textParts: string[] = [`Hola, ${person.name}.`, `Este es tu resumen del ${dateLabel}.`];
  for (const s of sections) {
    textParts.push(`${s.label} (${s.items.length})\n${s.items.map(itemText).join('\n')}`);
  }
  if (news.shown > 0) {
    const groups = news.groups.map(g => `${g.label}\n${g.items.map(itemText).join('\n')}`);
    if (news.more > 0) groups.push(`${moreLabel(news.more)} — ${notificationsUrl}`);
    textParts.push(`${DIGEST_SECTION_LABEL.news} (${news.shown + news.more})\n${groups.join('\n\n')}`);
  }
  textParts.push(`Este correo fue enviado por ${APP_NAME}. Puedes desactivar el resumen diario en Mi perfil.`);
  const text = textParts.join('\n\n') + '\n';

  // HTML
  const htmlSections = sections.map(s => sectionTitleHtml(s.label, s.items.length) + listHtml(s.items));
  if (news.shown > 0) {
    let block = sectionTitleHtml(DIGEST_SECTION_LABEL.news, news.shown + news.more);
    for (const g of news.groups) {
      block += `<h4 style="color: #4b5563; font-size: 13px; margin: 8px 0 0;">${escapeHtml(g.label)}</h4>`;
      block += listHtml(g.items);
    }
    if (news.more > 0) {
      block += `<p style="font-size: 14px; margin: 4px 0;"><a href="${escapeHtml(notificationsUrl)}" style="${LINK_STYLE}">${moreLabel(news.more)}</a></p>`;
    }
    htmlSections.push(block);
  }

  const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af; font-size: 16px;">Hola, ${escapeHtml(person.name)}</h2>
        <p style="color: #374151; font-size: 14px;">Este es tu resumen del ${dateLabel}.</p>
        ${htmlSections.join('\n        ')}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Este correo fue enviado por ${APP_NAME}. Puedes desactivar el resumen diario en Mi perfil.
        </p>
      </div>
    `;

  return { subject, html, text, counts };
}

/**
 * Reparte por persona las filas de las consultas en bloque. Una tarea va a su
 * responsable y a su revisor (una sola vez si son la misma persona); una
 * notificación, a su destinatario. Las filas de personas fuera de la lista se
 * ignoran.
 */
export function groupDigestInputs<N extends DigestNotification & { recipientId: string }>(
  personIds: string[],
  tasks: DigestTask[],
  notifications: N[],
): Map<string, { tasks: DigestTask[]; notifications: N[] }> {
  const map = new Map<string, { tasks: DigestTask[]; notifications: N[] }>();
  for (const id of personIds) map.set(id, { tasks: [], notifications: [] });

  for (const t of tasks) {
    map.get(t.responsibleId)?.tasks.push(t);
    if (t.reviewerId && t.reviewerId !== t.responsibleId) map.get(t.reviewerId)?.tasks.push(t);
  }
  for (const n of notifications) map.get(n.recipientId)?.notifications.push(n);
  return map;
}
