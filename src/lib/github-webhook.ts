/**
 * Lógica pura del webhook de GitHub (sin acceso a la base).
 *
 * La ruta `src/app/api/integrations/github/webhook/route.ts` verifica la firma,
 * extrae la clave FOR-<n> y decide el estado destino con estas funciones.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Task } from './db/schema';

/** Correo de la persona de sistema con la que se audita lo que hace el webhook. */
export const GITHUB_ACTOR_EMAIL = 'github@forja.system';

/** Máximo de claves que se cierran en un mismo push. */
export const MAX_CLOSING_KEYS = 50;

const SIGNATURE_RE = /^sha256=([0-9a-fA-F]{64})$/;

/**
 * Comprueba la cabecera `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo).
 * Nunca lanza: ante cualquier entrada inválida devuelve false.
 */
export function verifyGithubSignature(
  secret: string | undefined,
  rawBody: Buffer,
  header: string | null,
): boolean {
  if (!secret || !header) return false;
  const match = SIGNATURE_RE.exec(header);
  if (!match) return false;
  const received = Buffer.from(match[1], 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

const TASK_KEY_RE = /\bFOR-(\d{1,9})\b/i;

/** Devuelve el número de la primera clave FOR-<n> en el orden de los textos recibidos. */
export function extractTaskNumber(...texts: (string | null | undefined)[]): number | null {
  for (const text of texts) {
    if (!text) continue;
    const match = TASK_KEY_RE.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Números de las claves precedidas por Closes/Fixes/Resolves, sin duplicados y en orden de aparición. */
export function extractClosingTaskNumbers(messages: string[], max = MAX_CLOSING_KEYS): number[] {
  const found: number[] = [];
  const seen = new Set<number>();
  for (const message of messages) {
    for (const match of message.matchAll(/\b(?:closes|fixes|resolves)\s+FOR-(\d{1,9})\b/gi)) {
      const n = Number(match[1]);
      if (seen.has(n)) continue;
      seen.add(n);
      found.push(n);
      if (found.length >= max) return found;
    }
  }
  return found;
}

export type GithubTrigger = 'pr_ready' | 'pr_draft' | 'pr_merged' | 'pr_closed' | 'push_closes';

/** Clasifica un evento pull_request. Devuelve null si la acción no interesa. */
export function classifyPullRequest(
  action: string,
  pr: { draft: boolean; merged?: boolean | null },
): GithubTrigger | null {
  switch (action) {
    case 'opened':
    case 'reopened':
    case 'ready_for_review':
      return pr.draft ? 'pr_draft' : 'pr_ready';
    case 'closed':
      return pr.merged ? 'pr_merged' : 'pr_closed';
    default:
      return null;
  }
}

type TaskStatus = Task['status'];

/**
 * Estado al que debe pasar la tarea según el disparador, o null si no cambia.
 * - Una tarea completada nunca se mueve.
 * - Un PR listo pasa a revisión; un borrador sólo enlaza.
 * - Un merge (o un push con Closes/Fixes/Resolves) completa la tarea, salvo que
 *   requiera aprobación o evidencia: entonces queda en revisión.
 * - Un PR cerrado sin fusionar devuelve a en_proceso sólo desde en_revision.
 */
export function targetStatusFor(
  trigger: GithubTrigger,
  task: Pick<Task, 'status' | 'requiresApproval' | 'requiresEvidence'>,
): TaskStatus | null {
  if (task.status === 'completada') return null;

  let target: TaskStatus | null;
  switch (trigger) {
    case 'pr_ready':
      target = 'en_revision';
      break;
    case 'pr_draft':
      target = null;
      break;
    case 'pr_merged':
    case 'push_closes':
      target = task.requiresApproval || task.requiresEvidence ? 'en_revision' : 'completada';
      break;
    case 'pr_closed':
      target = task.status === 'en_revision' ? 'en_proceso' : null;
      break;
  }

  return target === task.status ? null : target;
}

export type GithubTaskOutcome = 'aplicado' | 'sin_cambios' | 'sin_tarea' | 'rechazado';

export type GithubTaskResult = { taskNumber: number; outcome: GithubTaskOutcome };

const MAX_OUTCOME_LENGTH = 500;

/** Resumen que se guarda en github_deliveries.outcome (máximo 500 caracteres). */
export function summarizeOutcome(results: GithubTaskResult[]): string {
  return results
    .map(r => `FOR-${r.taskNumber}: ${r.outcome}`)
    .join(', ')
    .slice(0, MAX_OUTCOME_LENGTH);
}

/** Resultado de un evento que sólo actualiza el panel del PR (review y checks). */
export type GithubPanelResult = { prUrl: string; outcome: Extract<GithubTaskOutcome, 'aplicado' | 'sin_cambios'> };

/** Resumen de github_deliveries.outcome para los eventos del panel (máximo 500 caracteres). */
export function summarizePanelOutcome(results: GithubPanelResult[]): string {
  return results
    .map(r => `${r.prUrl}: ${r.outcome}`)
    .join(', ')
    .slice(0, MAX_OUTCOME_LENGTH);
}
