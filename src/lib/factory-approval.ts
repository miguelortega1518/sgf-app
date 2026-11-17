type FactoryTask = { labels?: string[] | null; prUrl?: string | null; status: string };

const PULL_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*\/?$/;

function isFactoryTask(task: FactoryTask): boolean {
  return !!task.labels?.includes('ai-factory');
}

/**
 * Tarea de AI Factory con un PR pendiente: completarla exige integrar ese PR en GitHub.
 * Con un enlace a commit el cambio ya está en la rama base (la fábrica lo fusionó sola tras sus
 * revisiones) y la tarea se cierra como cualquier otra. Server-side integration: never trust the
 * webhook's cached checks for a merge.
 */
export function needsFactoryApproval(task: FactoryTask): boolean {
  return isFactoryTask(task) && PULL_URL.test(task.prUrl ?? '');
}

/** Tarea de AI Factory en revisión sin enlace a PR ni a commit: la fábrica aún trabaja en ella. */
export function factoryStillWorking(task: FactoryTask): boolean {
  return isFactoryTask(task) && task.status === 'en_revision' && !task.prUrl;
}

function deny(message: string, httpStatus = 409): never {
  throw Object.assign(new Error(message), { httpStatus });
}

type Policy = { base: string; checks: string[] };
type PullRequest = {
  state: string; draft: boolean; merged: boolean; mergeable: boolean | null;
  mergeable_state: string; head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { sha: string; ref: string; repo: { full_name: string } };
};
type Check = { name: string; head_sha: string; status: string; conclusion: string | null };
type Status = { context: string; state: string };

/** Exact SHA merge, fail closed. A retry after a DB failure can reconcile an already merged PR. */
export async function approveFactoryPullRequest(prUrl: string | null, actorId: string) {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)\/?$/.exec(prUrl ?? '');
  if (!match) deny('La tarea necesita un enlace válido al PR de GitHub antes de aprobarla.');
  const [, repo, number] = match;
  let policies: Record<string, Policy>;
  try { policies = JSON.parse(process.env.FORJA_GITHUB_APPROVAL_REPOS ?? '{}'); }
  catch { deny('La configuración de aprobación de GitHub no es válida.', 503); }
  const policy = policies && Object.hasOwn(policies, repo) ? policies[repo] : undefined;
  if (!policy || typeof policy.base !== 'string' || !policy.base || !Array.isArray(policy.checks) ||
      !policy.checks.length || policy.checks.some(c => typeof c !== 'string' || !c.trim())) {
    deny('Este repositorio no tiene una rama y pruebas obligatorias configuradas para aprobar desde Forja.', 503);
  }
  const token = process.env.FORJA_GITHUB_TOKEN;
  if (!token) deny('Falta configurar la conexión de aprobación con GitHub.', 503);
  const signal = AbortSignal.timeout(20_000);
  async function api<T>(path: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
        method: body ? 'PUT' : 'GET', cache: 'no-store', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { deny('No se pudo confirmar la integración con GitHub. La tarea sigue en revisión; vuelve a intentarlo.', 503); }
    if (!response.ok) deny(`GitHub no permitió verificar o integrar el cambio (HTTP ${response.status}). La tarea sigue en revisión.`);
    try { return await response.json() as T; }
    catch { deny('GitHub devolvió una respuesta inválida. La tarea sigue en revisión.', 503); }
  }
  const path = `/pulls/${number}`;
  const pr = await api<PullRequest>(path);
  if (pr.base.repo.full_name !== repo || pr.base.ref !== policy.base ||
      pr.head.repo?.full_name !== repo || !pr.head.ref.startsWith('factory/')) {
    deny('El PR no pertenece a una rama de AI Factory y a la rama destino autorizada.');
  }
  if (pr.merged) return { prUrl, headSha: pr.head.sha, alreadyMerged: true };
  if (pr.state !== 'open' || pr.draft) deny('El PR debe estar abierto y listo para revisión.');
  if (pr.mergeable !== true || pr.mergeable_state !== 'clean') {
    deny('GitHub aún no permite integrar el PR: revisa conflictos, aprobaciones, pruebas o actualización de la rama.');
  }
  const sha = pr.head.sha;
  if (!/^[a-f0-9]{40}$/.test(sha)) deny('GitHub no devolvió un commit válido.');
  const checks: Check[] = [];
  const statuses: Status[] = [];
  // Bound pagination and reject oversized responses rather than ignoring pending/failing checks.
  for (let page = 1; page <= 10; page++) {
    const result = await api<{ total_count: number; check_runs: Check[] }>(`/commits/${sha}/check-runs?filter=latest&per_page=100&page=${page}`);
    checks.push(...result.check_runs);
    if (checks.length >= result.total_count) break;
    if (page === 10) deny('Demasiadas verificaciones para aprobar este PR desde Forja.');
  }
  for (let page = 1; page <= 10; page++) {
    const result = await api<{ total_count: number; statuses: Status[] }>(`/commits/${sha}/status?per_page=100&page=${page}`);
    statuses.push(...result.statuses);
    if (statuses.length >= result.total_count) break;
    if (page === 10) deny('Demasiados estados de CI para aprobar este PR desde Forja.');
  }
  if (checks.some(c => c.head_sha !== sha || c.status !== 'completed' || c.conclusion !== 'success') ||
      statuses.some(s => s.state !== 'success')) {
    deny('Hay pruebas pendientes, fallidas u omitidas. La tarea sigue en revisión.');
  }
  const passed = new Set([...checks.map(c => c.name), ...statuses.map(s => s.context)]);
  if (policy.checks.some(name => !passed.has(name))) {
    deny('Todavía no han pasado todas las pruebas obligatorias del cambio. La tarea sigue en revisión.');
  }
  const comparison = await api<{ behind_by: number }>(`/compare/${pr.base.sha}...${sha}`);
  if (comparison.behind_by !== 0) deny('Actualiza la rama del PR con la rama destino y vuelve a ejecutar las pruebas.');
  const fresh = await api<PullRequest>(path);
  if (fresh.head.sha !== sha || fresh.base.sha !== pr.base.sha || fresh.draft ||
      fresh.state !== 'open' || fresh.mergeable !== true || fresh.mergeable_state !== 'clean') {
    deny('El PR cambió durante la aprobación. Revísalo y vuelve a intentarlo.');
  }
  const result = await api<{ merged: boolean; sha: string }>(`${path}/merge`, {
    sha, merge_method: 'squash', commit_title: `Integrar PR #${number} aprobado en Forja`,
    commit_message: `Aprobación humana en Forja por usuario ${actorId}. Commit verificado: ${sha}.`,
  });
  if (result.merged !== true) deny('GitHub no confirmó la integración. La tarea sigue en revisión.');
  return { prUrl, headSha: sha, mergeSha: result.sha, alreadyMerged: false };
}
