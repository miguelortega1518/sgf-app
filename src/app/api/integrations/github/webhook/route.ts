import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { githubDeliveries, persons, spaces, tasks } from '@/lib/db/schema';
import { success, error, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { applyStatusTransition, type NotificationIntent } from '@/lib/task-transitions';
import {
  GITHUB_ACTOR_EMAIL,
  classifyPullRequest,
  extractClosingTaskNumbers,
  extractTaskNumber,
  summarizeOutcome,
  targetStatusFor,
  verifyGithubSignature,
  type GithubTaskOutcome,
  type GithubTaskResult,
  type GithubTrigger,
} from '@/lib/github-webhook';
import { pullRequestEventSchema, pushEventSchema } from '@/lib/schemas/github-webhook';

/**
 * Webhook de repositorio de GitHub (fase 1). Ruta pública: la única defensa es la
 * firma HMAC de X-Hub-Signature-256 con GITHUB_WEBHOOK_SECRET.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlanItem = {
  taskNumber: number;
  trigger: GithubTrigger;
  link?: { branch: string; prUrl: string };
};

const HANDLED_EVENTS = new Set(['pull_request', 'push']);
const MAX_DELIVERY_LENGTH = 200;

function planEvent(event: string, payload: unknown): PlanItem[] {
  if (event === 'pull_request') {
    const { action, pull_request: pr } = pullRequestEventSchema.parse(payload);
    const trigger = classifyPullRequest(action, pr);
    if (!trigger) return [];
    const taskNumber = extractTaskNumber(pr.head.ref, pr.title, pr.body);
    if (taskNumber === null) return [];
    return [{ taskNumber, trigger, link: { branch: pr.head.ref, prUrl: pr.html_url } }];
  }

  const push = pushEventSchema.parse(payload);
  if (push.ref !== `refs/heads/${push.repository.default_branch}`) return [];
  return extractClosingTaskNumbers(push.commits.map(c => c.message))
    // Orden estable de bloqueo (FOR UPDATE) para no cruzarse con otra entrega concurrente.
    .sort((a, b) => a - b)
    .map(taskNumber => ({ taskNumber, trigger: 'push_closes' as const }));
}

function hasHttpStatus(err: unknown): err is Error & { httpStatus: number } {
  return err instanceof Error && typeof (err as { httpStatus?: unknown }).httpStatus === 'number';
}

async function processItem(
  tx: Tx,
  actorId: string,
  delivery: string,
  item: PlanItem,
  intents: NotificationIntent[],
): Promise<GithubTaskOutcome> {
  const [task] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.number, item.taskNumber), eq(tasks.archived, false)))
    .for('update');
  if (!task) return 'sin_tarea';

  const [space] = await tx
    .select({ status: spaces.status })
    .from(spaces)
    .where(eq(spaces.id, task.spaceId))
    .limit(1);
  // En un proyecto cerrado no se toca nada: ni el enlace ni el estado.
  if (!space || space.status === 'cerrado') return 'rechazado';

  let current = task;
  let changed = false;

  if (item.link && (task.branch !== item.link.branch || task.prUrl !== item.link.prUrl)) {
    const [row] = await tx
      .update(tasks)
      .set({ branch: item.link.branch, prUrl: item.link.prUrl })
      .where(eq(tasks.id, task.id))
      .returning();
    current = row;
    changed = true;
    await logAudit({
      actorId,
      action: 'pr_linked',
      taskId: task.id,
      previousValue: task.prUrl ?? undefined,
      newValue: item.link.prUrl,
    }, tx);
  }

  const status = targetStatusFor(item.trigger, current);
  if (status) {
    try {
      const result = await applyStatusTransition(tx, { id: actorId, role: 'miembro' }, current, space, { status });
      if (!result.isNoop) changed = true;
      intents.push(...result.notifications);
    } catch (err) {
      // Las reglas de la máquina de estados no se fuerzan; cualquier otro error revierte todo.
      if (!hasHttpStatus(err)) throw err;
      logger.warn('github_transition_rejected', { delivery, taskNumber: item.taskNumber, message: err.message });
      return 'rechazado';
    }
  }

  return changed ? 'aplicado' : 'sin_cambios';
}

export async function POST(req: NextRequest) {
  try {
    // El secreto se lee en cada petición para que rotarlo no requiera recargar el módulo.
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const raw = Buffer.from(await req.arrayBuffer());
    if (!verifyGithubSignature(secret, raw, req.headers.get('x-hub-signature-256'))) {
      return error('Firma inválida', 401);
    }

    const event = req.headers.get('x-github-event') ?? '';
    if (!HANDLED_EVENTS.has(event)) return success({ ignored: true });

    const delivery = req.headers.get('x-github-delivery')?.trim() ?? '';
    if (!delivery || delivery.length > MAX_DELIVERY_LENGTH) {
      return error('Falta la cabecera X-GitHub-Delivery o no es válida', 400);
    }

    const payload: unknown = JSON.parse(raw.toString('utf8'));
    const plan = planEvent(event, payload);
    if (plan.length === 0) return success({ ignored: true });

    const [actor] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.email, GITHUB_ACTOR_EMAIL))
      .limit(1);
    if (!actor) throw new Error(`No existe la persona de sistema ${GITHUB_ACTOR_EMAIL}`);

    const outcome = await db.transaction(async tx => {
      const inserted = await tx
        .insert(githubDeliveries)
        .values({ deliveryId: delivery, event })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) return null;

      const results: GithubTaskResult[] = [];
      const intents: NotificationIntent[] = [];
      for (const item of plan) {
        results.push({ taskNumber: item.taskNumber, outcome: await processItem(tx, actor.id, delivery, item, intents) });
      }

      await tx
        .update(githubDeliveries)
        .set({ outcome: summarizeOutcome(results) })
        .where(eq(githubDeliveries.deliveryId, delivery));

      return { results, intents };
    });

    if (!outcome) return success({ duplicate: true });

    // Fuera de la transacción: las filas ya no están bloqueadas con FOR UPDATE.
    for (const intent of outcome.intents) {
      notify(intent).catch(() => {});
    }

    return success({ delivery, results: outcome.results });
  } catch (err) {
    return handleError(err);
  }
}
