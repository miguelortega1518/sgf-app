import { NextRequest } from 'next/server';
import { and, asc, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  githubDeliveries, githubPullRequests, persons, spaces, tasks,
  type GithubPullRequest, type NewGithubPullRequest, type PrChecks, type PrReviewer,
} from '@/lib/db/schema';
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
  summarizePanelOutcome,
  targetStatusFor,
  verifyGithubSignature,
  type GithubPanelResult,
  type GithubTaskOutcome,
  type GithubTaskResult,
  type GithubTrigger,
} from '@/lib/github-webhook';
import {
  applyCheckRun,
  applyCheckSuite,
  applyReview,
  nextFirstReviewAt,
  prStateFrom,
  reconcileRequestedReviewers,
  resetChecks,
  reviewerStateFrom,
  type PrState,
} from '@/lib/github-pull-request';
import {
  checkRunEventSchema,
  checkSuiteEventSchema,
  pullRequestEventSchema,
  pullRequestReviewEventSchema,
  pushEventSchema,
} from '@/lib/schemas/github-webhook';

/**
 * Webhook de repositorio de GitHub. Ruta pública: la única defensa es la
 * firma HMAC de X-Hub-Signature-256 con GITHUB_WEBHOOK_SECRET.
 *
 * - pull_request y push enlazan y mueven la tarea (fase 1) y rellenan el panel del PR.
 * - pull_request_review, check_suite y check_run sólo actualizan el panel del PR.
 *   No se auditan: son datos derivados de GitHub, sin actor humano, y el rastro
 *   queda en github_deliveries.outcome.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Datos normalizados de un evento pull_request para la fila del panel. */
type PrPanelInput = {
  action: string;
  url: string;
  number: number;
  title: string;
  state: PrState;
  headSha: string;
  authorLogin: string;
  openedAt: Date | null;
  updatedAt: Date | null;
  mergedAt: Date | null;
  closedAt: Date | null;
  requestedLogins: string[];
  requestedNow: string | null;
};

type PlanItem = {
  taskNumber: number;
  trigger: GithubTrigger | null;
  link?: { branch: string; prUrl: string };
  pr?: PrPanelInput;
};

type PanelLookup = { by: 'url'; url: string } | { by: 'sha'; sha: string; repoUrl: string };

type PanelPatch = Pick<NewGithubPullRequest, 'reviewers' | 'firstReviewAt' | 'checks'>;

type Plan =
  | { kind: 'task'; items: PlanItem[] }
  | { kind: 'panel'; lookup: PanelLookup; apply: (row: GithubPullRequest, now: Date) => Partial<PanelPatch> | null };

const HANDLED_EVENTS = new Set(['pull_request', 'push', 'pull_request_review', 'check_suite', 'check_run']);
const MAX_DELIVERY_LENGTH = 200;
/** Máximo de filas del panel que actualiza un mismo evento de review o checks. */
const MAX_PANEL_ROWS = 50;

// Acciones de pull_request que actualizan el panel. Sólo opened, reopened,
// ready_for_review y closed enlazan y mueven la tarea (classifyPullRequest).
const PANEL_PR_ACTIONS = new Set([
  'opened', 'reopened', 'ready_for_review', 'converted_to_draft', 'synchronize',
  'closed', 'review_requested', 'review_request_removed', 'edited',
]);
const CHECK_SUITE_ACTIONS = new Set(['completed', 'requested', 'rerequested']);

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function planPullRequest(payload: unknown): Plan | null {
  const { action, pull_request: pr, requested_reviewer } = pullRequestEventSchema.parse(payload);
  if (!PANEL_PR_ACTIONS.has(action)) return null;
  const taskNumber = extractTaskNumber(pr.head.ref, pr.title, pr.body);
  if (taskNumber === null) return null;

  const trigger = classifyPullRequest(action, pr);
  return {
    kind: 'task',
    items: [{
      taskNumber,
      trigger,
      link: trigger ? { branch: pr.head.ref, prUrl: pr.html_url } : undefined,
      pr: {
        action,
        url: pr.html_url,
        number: pr.number,
        title: pr.title,
        state: prStateFrom(pr),
        headSha: pr.head.sha,
        authorLogin: pr.user.login,
        openedAt: toDate(pr.created_at),
        updatedAt: toDate(pr.updated_at),
        mergedAt: toDate(pr.merged_at),
        closedAt: toDate(pr.closed_at),
        requestedLogins: pr.requested_reviewers.map(r => r.login),
        requestedNow: action === 'review_requested' ? requested_reviewer?.login ?? null : null,
      },
    }],
  };
}

function planPush(payload: unknown): Plan | null {
  const push = pushEventSchema.parse(payload);
  if (push.ref !== `refs/heads/${push.repository.default_branch}`) return null;
  const items = extractClosingTaskNumbers(push.commits.map(c => c.message))
    // Orden estable de bloqueo (FOR UPDATE) para no cruzarse con otra entrega concurrente.
    .sort((a, b) => a - b)
    .map(taskNumber => ({ taskNumber, trigger: 'push_closes' as const }));
  return items.length ? { kind: 'task', items } : null;
}

// Comparación campo a campo: jsonb no conserva el orden de las claves.
function sameReviewers(a: PrReviewer[], b: PrReviewer[]): boolean {
  return a.length === b.length && a.every((r, i) =>
    r.login === b[i].login && r.state === b[i].state && (r.submittedAt ?? null) === (b[i].submittedAt ?? null));
}

function sameTime(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

function planReview(payload: unknown): Plan | null {
  const { action, review, pull_request: pr } = pullRequestReviewEventSchema.parse(payload);
  if (action !== 'submitted' && action !== 'dismissed') return null;

  const author = pr.user.login;
  const login = review.user.login;
  // Las revisiones del autor se ignoran; también los estados que no se reconocen (p. ej. pending).
  if (login === author) return null;
  if (action === 'submitted' && !reviewerStateFrom(review.state)) return null;

  const submittedAt = review.submitted_at ?? null;
  const requested = pr.requested_reviewers.some(r => r.login === login);
  return {
    kind: 'panel',
    lookup: { by: 'url', url: pr.html_url },
    apply: row => {
      const reviewers = applyReview(row.reviewers, {
        login, author, requested, submittedAt, state: action === 'dismissed' ? 'dismissed' : review.state,
      });
      const firstReviewAt = action === 'submitted'
        ? nextFirstReviewAt(row.firstReviewAt, { login, submittedAt }, author)
        : row.firstReviewAt;
      if (sameReviewers(reviewers, row.reviewers) && sameTime(firstReviewAt, row.firstReviewAt)) return null;
      return { reviewers, firstReviewAt };
    },
  };
}

/** Aplica un cambio a los checks del sha actual de la fila; null si no hay que escribir. */
function updateChecks(row: GithubPullRequest, now: Date, fn: (checks: PrChecks) => PrChecks | null) {
  const current = row.checks && row.checks.sha === row.headSha ? row.checks : null;
  const next = fn(current ?? resetChecks(row.headSha, now));
  if (!next || next === current) return null;
  return { checks: next };
}

function planCheckRun(payload: unknown): Plan | null {
  const { check_run: run, repository } = checkRunEventSchema.parse(payload);
  const input = {
    id: run.id,
    name: run.name,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion ?? null,
    suiteId: run.check_suite.id,
  };
  return {
    kind: 'panel',
    lookup: { by: 'sha', sha: run.head_sha, repoUrl: repository.html_url },
    apply: (row, now) => updateChecks(row, now, checks => applyCheckRun(checks, input, now)),
  };
}

function planCheckSuite(payload: unknown): Plan | null {
  const { action, check_suite: suite, repository } = checkSuiteEventSchema.parse(payload);
  if (!CHECK_SUITE_ACTIONS.has(action)) return null;
  const input = { id: suite.id, headSha: suite.head_sha, status: suite.status ?? null, conclusion: suite.conclusion ?? null };
  return {
    kind: 'panel',
    lookup: { by: 'sha', sha: suite.head_sha, repoUrl: repository.html_url },
    apply: (row, now) => updateChecks(row, now, checks => applyCheckSuite(checks, input, now)),
  };
}

/** Plan del evento, o null si no hay nada que hacer. Valida el payload (ZodError → 400). */
function planEvent(event: string, payload: unknown): Plan | null {
  switch (event) {
    case 'pull_request': return planPullRequest(payload);
    case 'pull_request_review': return planReview(payload);
    case 'check_run': return planCheckRun(payload);
    case 'check_suite': return planCheckSuite(payload);
    default: return planPush(payload);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function pullPrefix(repoUrl: string): string {
  return `${repoUrl}/pull/`;
}

function panelWhere(lookup: PanelLookup) {
  if (lookup.by === 'url') return eq(githubPullRequests.url, lookup.url);
  return and(
    eq(githubPullRequests.headSha, lookup.sha),
    like(githubPullRequests.url, `${escapeLike(pullPrefix(lookup.repoUrl))}%`),
  );
}

function matchesLookup(row: { url: string; headSha: string }, lookup: PanelLookup): boolean {
  if (lookup.by === 'url') return row.url === lookup.url;
  return row.headSha === lookup.sha && row.url.startsWith(pullPrefix(lookup.repoUrl));
}

function hasHttpStatus(err: unknown): err is Error & { httpStatus: number } {
  return err instanceof Error && typeof (err as { httpStatus?: unknown }).httpStatus === 'number';
}

/**
 * Crea o actualiza la fila del PR (bloqueada con FOR UPDATE). Devuelve true si escribió algo.
 * Se llama con la tarea ya bloqueada: el orden de bloqueo es siempre tarea → PR.
 */
async function upsertPullRequest(tx: Tx, taskId: string, pr: PrPanelInput, now: Date): Promise<boolean> {
  const [row] = await tx
    .select()
    .from(githubPullRequests)
    .where(eq(githubPullRequests.url, pr.url))
    .for('update');

  const values = {
    taskId,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    headSha: pr.headSha,
    authorLogin: pr.authorLogin,
    openedAt: pr.openedAt ?? row?.openedAt ?? now,
    // ready_at se fija sólo en ready_for_review y nunca se sobreescribe.
    readyAt: row?.readyAt ?? (pr.action === 'ready_for_review' ? pr.updatedAt ?? now : null),
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    reviewers: reconcileRequestedReviewers(row?.reviewers ?? [], pr.requestedLogins, {
      author: pr.authorLogin,
      requestedNow: pr.requestedNow,
    }),
  };

  if (!row) {
    await tx.insert(githubPullRequests).values({ url: pr.url, ...values, checks: null, updatedAt: now });
    return true;
  }

  // Otro head_sha (p. ej. synchronize): los checks empiezan de cero para el sha nuevo.
  const checks = row.headSha !== pr.headSha ? resetChecks(pr.headSha, now) : row.checks;
  const unchanged =
    row.taskId === values.taskId &&
    row.number === values.number &&
    row.title === values.title &&
    row.state === values.state &&
    row.headSha === values.headSha &&
    row.authorLogin === values.authorLogin &&
    sameTime(row.openedAt, values.openedAt) &&
    sameTime(row.readyAt, values.readyAt) &&
    sameTime(row.mergedAt, values.mergedAt) &&
    sameTime(row.closedAt, values.closedAt) &&
    sameReviewers(row.reviewers, values.reviewers) &&
    // Con el mismo sha, checks es la misma referencia que row.checks.
    row.checks === checks;
  if (unchanged) return false;

  await tx
    .update(githubPullRequests)
    .set({ ...values, checks, updatedAt: now })
    .where(eq(githubPullRequests.url, pr.url));
  return true;
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
  const now = new Date();

  // En un proyecto cerrado sólo se actualiza el panel: ni el enlace ni el estado.
  if (!space || space.status === 'cerrado') {
    if (item.pr) await upsertPullRequest(tx, task.id, item.pr, now);
    return 'rechazado';
  }

  let current = task;
  let changed = false;
  let rejected = false;

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

  const status = item.trigger ? targetStatusFor(item.trigger, current) : null;
  if (status) {
    try {
      const result = await applyStatusTransition(tx, { id: actorId, role: 'miembro' }, current, space, { status });
      if (!result.isNoop) changed = true;
      intents.push(...result.notifications);
    } catch (err) {
      // Las reglas de la máquina de estados no se fuerzan; cualquier otro error revierte todo.
      if (!hasHttpStatus(err)) throw err;
      logger.warn('github_transition_rejected', { delivery, taskNumber: item.taskNumber, message: err.message });
      rejected = true;
    }
  }

  if (item.pr && await upsertPullRequest(tx, task.id, item.pr, now)) changed = true;

  if (rejected) return 'rechazado';
  return changed ? 'aplicado' : 'sin_cambios';
}

/** pull_request_review, check_run y check_suite: sólo el panel del PR, sin tocar la tarea. */
async function handlePanelEvent(delivery: string, event: string, plan: Extract<Plan, { kind: 'panel' }>) {
  // Fuera de la transacción: sin fila del PR no se guarda la entrega, para no llenar
  // github_deliveries con los checks de PRs que no están enlazados a ninguna tarea.
  const candidates = await db
    .select({ url: githubPullRequests.url, headSha: githubPullRequests.headSha })
    .from(githubPullRequests)
    .where(panelWhere(plan.lookup))
    .limit(MAX_PANEL_ROWS);
  if (!candidates.some(row => matchesLookup(row, plan.lookup))) return success({ ignored: true });

  const results = await db.transaction(async tx => {
    const inserted = await tx
      .insert(githubDeliveries)
      .values({ deliveryId: delivery, event })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) return null;

    // Orden estable de bloqueo por url; sólo se bloquean filas del PR, nunca tareas.
    const rows = await tx
      .select()
      .from(githubPullRequests)
      .where(panelWhere(plan.lookup))
      .orderBy(asc(githubPullRequests.url))
      .limit(MAX_PANEL_ROWS)
      .for('update');

    const now = new Date();
    const out: GithubPanelResult[] = [];
    for (const row of rows) {
      if (!matchesLookup(row, plan.lookup)) continue;
      const patch = plan.apply(row, now);
      if (patch) {
        await tx
          .update(githubPullRequests)
          .set({ ...patch, updatedAt: now })
          .where(eq(githubPullRequests.url, row.url));
      }
      out.push({ prUrl: row.url, outcome: patch ? 'aplicado' : 'sin_cambios' });
    }

    await tx
      .update(githubDeliveries)
      .set({ outcome: summarizePanelOutcome(out) })
      .where(eq(githubDeliveries.deliveryId, delivery));

    return out;
  });

  if (!results) return success({ duplicate: true });
  return success({ delivery, results });
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
    if (!plan) return success({ ignored: true });
    if (plan.kind === 'panel') return await handlePanelEvent(delivery, event, plan);

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
      for (const item of plan.items) {
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
