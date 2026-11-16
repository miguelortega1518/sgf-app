/**
 * Lógica pura del panel «Pull request» de la tarea (sin acceso a la base).
 *
 * Todo sale de los payloads del webhook de GitHub (pull_request, pull_request_review,
 * check_run y check_suite): Forja no llama a la API de GitHub.
 */

import type { GithubPullRequest, PrCheckState, PrChecks, PrReviewer } from './db/schema';

export type PrState = GithubPullRequest['state'];
export type ReviewerState = PrReviewer['state'];

/** Máximo de personas en la lista de revisores. */
export const MAX_REVIEWERS = 100;

/** Máximo de check runs distintos (por nombre) que se guardan por sha. */
export const MAX_CHECK_RUNS = 200;

/** Máximo de suites que se guardan por sha. */
export const MAX_CHECK_SUITES = 200;

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function byLogin(a: PrReviewer, b: PrReviewer): number {
  return a.login < b.login ? -1 : a.login > b.login ? 1 : 0;
}

function finishReviewers(list: PrReviewer[]): PrReviewer[] {
  return [...list].sort(byLogin).slice(0, MAX_REVIEWERS);
}

/** Estado del PR: fusionado gana a cerrado; cerrado gana a borrador. */
export function prStateFrom(pr: {
  state: 'open' | 'closed';
  draft: boolean;
  merged?: boolean | null;
  merged_at?: string | null;
}): PrState {
  if (pr.merged_at != null || pr.merged === true) return 'fusionado';
  if (pr.state === 'closed') return 'cerrado';
  if (pr.draft) return 'borrador';
  return 'abierto';
}

/**
 * Sincroniza los revisores con `requested_reviewers` de un evento pull_request.
 * - Los pedidos sin entrada se añaden como pendientes.
 * - Los pendientes que ya no se piden se quitan; las revisiones enviadas se conservan.
 * - `requestedNow` (review_requested) queda pendiente aunque ya hubiera revisado.
 * - El autor nunca aparece.
 */
export function reconcileRequestedReviewers(
  current: PrReviewer[],
  requestedLogins: string[],
  opts: { author: string; requestedNow?: string | null },
): PrReviewer[] {
  const { author } = opts;
  const requested = new Set(requestedLogins.filter(l => l !== author));
  const requestedNow = opts.requestedNow && opts.requestedNow !== author ? opts.requestedNow : null;
  if (requestedNow) requested.add(requestedNow);

  const result: PrReviewer[] = [];
  const seen = new Set<string>();
  for (const entry of current) {
    if (entry.login === author || seen.has(entry.login)) continue;
    seen.add(entry.login);
    if (entry.login === requestedNow) {
      result.push({ ...entry, state: 'pendiente' });
    } else if (entry.state !== 'pendiente' || requested.has(entry.login)) {
      result.push({ ...entry });
    }
  }
  for (const login of requested) {
    if (!seen.has(login)) result.push({ login, state: 'pendiente' });
  }
  return finishReviewers(result);
}

const REVIEW_STATE: Record<string, Exclude<ReviewerState, 'pendiente'>> = {
  approved: 'aprobado',
  changes_requested: 'cambios',
  commented: 'comentado',
};

/** Veredicto del panel para un `review.state` de GitHub, o null si no se reconoce. */
export function reviewerStateFrom(state: string): Exclude<ReviewerState, 'pendiente'> | null {
  const key = state.toLowerCase();
  return Object.hasOwn(REVIEW_STATE, key) ? REVIEW_STATE[key] : null;
}

/**
 * Aplica una revisión (submitted) o su descarte (state 'dismissed').
 * Gana la revisión con el submitted_at más reciente de cada persona; el autor se ignora.
 */
export function applyReview(
  current: PrReviewer[],
  review: { login: string; state: string; submittedAt: string | null; author: string; requested: boolean },
): PrReviewer[] {
  const { login, author } = review;
  if (login === author) return current;

  const existing = current.find(r => r.login === login);
  const existingMs = toMs(existing?.submittedAt);
  const newMs = toMs(review.submittedAt);
  // Una entrega tardía y más antigua no pisa una revisión más nueva.
  if (existingMs !== null && newMs !== null && existingMs > newMs) return current;

  const others = current.filter(r => r.login !== login);

  if (review.state.toLowerCase() === 'dismissed') {
    if (!existing) return current;
    if (!review.requested) return finishReviewers(others);
    // Se conserva submittedAt para que una entrega tardía y más antigua no reponga el veredicto.
    return finishReviewers([...others, { ...existing, state: 'pendiente' }]);
  }

  const state = reviewerStateFrom(review.state);
  if (!state) return current;

  const entry: PrReviewer = { login, state };
  if (review.submittedAt) entry.submittedAt = review.submittedAt;
  return finishReviewers([...others, entry]);
}

/** first_review_at: el primer submitted_at de alguien que no es el autor. Nunca se sobreescribe. */
export function nextFirstReviewAt(
  currentFirst: Date | null,
  review: { login: string; submittedAt: string | null },
  author: string,
): Date | null {
  if (currentFirst) return currentFirst;
  if (review.login === author) return null;
  const ms = toMs(review.submittedAt);
  return ms === null ? null : new Date(ms);
}

const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

/** Estado agregado de un check: lo que no está completado (o se desconoce) cuenta como pendiente. */
export function checkStateFrom(status: string | null | undefined, conclusion: string | null | undefined): PrCheckState {
  if (status?.toLowerCase() !== 'completed') return 'pending';
  return conclusion && SUCCESS_CONCLUSIONS.has(conclusion.toLowerCase()) ? 'success' : 'failure';
}

/** Checks vacíos para un sha (p. ej. tras un synchronize con otro head_sha). */
export function resetChecks(sha: string, now: Date = new Date()): PrChecks {
  return { sha, total: 0, success: 0, failure: 0, pending: 0, updatedAt: now.toISOString(), runs: {}, suites: {} };
}

function recount(checks: Pick<PrChecks, 'sha' | 'runs' | 'suites'>, now: Date): PrChecks {
  const counts: Record<PrCheckState, number> = { success: 0, failure: 0, pending: 0 };
  const suitesWithRuns = new Set<string>();
  for (const run of Object.values(checks.runs)) {
    counts[run.state]++;
    if (run.suiteId !== null) suitesWithRuns.add(String(run.suiteId));
  }
  // Una suite sólo cuenta si ninguno de sus runs ha llegado.
  for (const [suiteId, state] of Object.entries(checks.suites)) {
    if (!suitesWithRuns.has(suiteId)) counts[state]++;
  }
  return {
    sha: checks.sha,
    total: counts.success + counts.failure + counts.pending,
    success: counts.success,
    failure: counts.failure,
    pending: counts.pending,
    updatedAt: now.toISOString(),
    runs: checks.runs,
    suites: checks.suites,
  };
}

/**
 * Aplica un evento check_run. Devuelve null si el sha no coincide y el mismo objeto
 * si el evento no cambia nada (id menor, completado que volvería a pendiente o tope de runs).
 */
export function applyCheckRun(
  checks: PrChecks,
  run: { id: number; name: string; headSha: string; status: string | null; conclusion: string | null; suiteId: number | null },
  now: Date = new Date(),
): PrChecks | null {
  if (run.headSha !== checks.sha) return null;

  const state = checkStateFrom(run.status, run.conclusion);
  const existing = Object.hasOwn(checks.runs, run.name) ? checks.runs[run.name] : undefined;
  if (!existing && Object.keys(checks.runs).length >= MAX_CHECK_RUNS) return checks;
  if (existing) {
    if (run.id < existing.id) return checks;
    if (run.id === existing.id && existing.state !== 'pending' && state === 'pending') return checks;
    if (run.id === existing.id && existing.state === state && existing.suiteId === run.suiteId) return checks;
  }

  return recount({
    sha: checks.sha,
    runs: { ...checks.runs, [run.name]: { id: run.id, suiteId: run.suiteId, state } },
    suites: checks.suites,
  }, now);
}

/** Aplica un evento check_suite. Devuelve null si el sha no coincide. */
export function applyCheckSuite(
  checks: PrChecks,
  suite: { id: number; headSha: string; status: string | null; conclusion: string | null },
  now: Date = new Date(),
): PrChecks | null {
  if (suite.headSha !== checks.sha) return null;

  const key = String(suite.id);
  const state = checkStateFrom(suite.status, suite.conclusion);
  const exists = Object.hasOwn(checks.suites, key);
  if (exists && checks.suites[key] === state) return checks;
  if (!exists && Object.keys(checks.suites).length >= MAX_CHECK_SUITES) return checks;

  return recount({ sha: checks.sha, runs: checks.runs, suites: { ...checks.suites, [key]: state } }, now);
}

/** «3/4 en verde · 1 fallando · 2 pendientes», «N pendientes» o «Sin checks». */
export function summarizeChecks(checks: Pick<PrChecks, 'total' | 'success' | 'failure' | 'pending'> | null): string {
  if (!checks || checks.total === 0) return 'Sin checks';
  if (checks.success === 0 && checks.failure === 0) return `${checks.pending} pendientes`;
  let text = `${checks.success}/${checks.total} en verde`;
  if (checks.failure > 0) text += ` · ${checks.failure} fallando`;
  if (checks.pending > 0) text += ` · ${checks.pending} pendientes`;
  return text;
}

export type ReviewWait = { kind: 'reviewed' | 'waiting' | 'none'; ms: number };

/**
 * Tiempo hasta la primera revisión (reviewed) o sin revisión hasta ahora (waiting),
 * contado desde readyAt o, si no hay, desde openedAt. Tiempo de reloj, sin días hábiles.
 */
export function reviewWait(
  pr: {
    state: PrState;
    openedAt: string | Date;
    readyAt: string | Date | null;
    firstReviewAt: string | Date | null;
  },
  now: Date,
): ReviewWait {
  const start = toMs(pr.readyAt) ?? toMs(pr.openedAt);
  if (start === null) return { kind: 'none', ms: 0 };

  const firstReview = toMs(pr.firstReviewAt);
  if (firstReview !== null) return { kind: 'reviewed', ms: Math.max(0, firstReview - start) };

  if (pr.state === 'borrador' && pr.readyAt == null) return { kind: 'none', ms: 0 };
  if (pr.state === 'fusionado' || pr.state === 'cerrado') return { kind: 'none', ms: 0 };
  return { kind: 'waiting', ms: Math.max(0, now.getTime() - start) };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** «menos de 1 min», «N min», «H h», «H h M min», «D d» o «D d H h». */
export function formatDuration(ms: number): string {
  if (!(ms >= MINUTE)) return 'menos de 1 min';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MINUTE);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

/** Lo que devuelve GET /api/tasks/[id] en `pullRequest`: sin los mapas internos de checks. */
export type PullRequestView = {
  url: string;
  number: number;
  title: string;
  state: PrState;
  authorLogin: string;
  openedAt: string;
  readyAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
  firstReviewAt: string | null;
  reviewers: { login: string; state: ReviewerState }[];
  checks: { sha: string; total: number; success: number; failure: number; pending: number; updatedAt: string } | null;
};

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function pullRequestView(row: GithubPullRequest): PullRequestView {
  const checks = row.checks;
  return {
    url: row.url,
    number: row.number,
    title: row.title,
    state: row.state,
    authorLogin: row.authorLogin,
    openedAt: iso(row.openedAt)!,
    readyAt: iso(row.readyAt),
    mergedAt: iso(row.mergedAt),
    closedAt: iso(row.closedAt),
    firstReviewAt: iso(row.firstReviewAt),
    reviewers: (row.reviewers ?? []).map(r => ({ login: r.login, state: r.state })),
    checks: checks
      ? {
        sha: checks.sha,
        total: checks.total,
        success: checks.success,
        failure: checks.failure,
        pending: checks.pending,
        updatedAt: checks.updatedAt,
      }
      : null,
  };
}
