import { CircleCheck, CircleDashed, CircleX, Clock, GitPullRequest } from 'lucide-react';
import {
  PR_STATE_CHIP, PR_STATE_LABEL, REVIEWER_STATE_CHIP, REVIEWER_STATE_LABEL,
} from '@/lib/labels';
import {
  formatDuration, reviewWait, summarizeChecks, type PullRequestView,
} from '@/lib/github-pull-request';

/**
 * Panel «Pull request» del detalle de la tarea. Componente puro: sin hooks ni fetch.
 * `now` llega como prop para poder probar el tiempo de espera de la revisión.
 */
export function PullRequestPanel({ pr, now }: { pr: PullRequestView | null; now: Date }) {
  if (!pr) return null;

  const wait = reviewWait(pr, now);
  const waitText = wait.kind === 'reviewed'
    ? `Primera revisión en ${formatDuration(wait.ms)}`
    : wait.kind === 'waiting'
      ? `Sin revisión desde hace ${formatDuration(wait.ms)}`
      : null;

  const checks = pr.checks;
  const checksText = summarizeChecks(checks);
  const ChecksIcon = !checks || checks.total === 0
    ? CircleDashed
    : checks.failure > 0 ? CircleX : checks.pending > 0 ? CircleDashed : CircleCheck;
  const checksColor = !checks || checks.total === 0
    ? 'text-gray-500'
    : checks.failure > 0 ? 'text-red-600' : checks.pending > 0 ? 'text-amber-600' : 'text-green-600';

  return (
    <section aria-label="Pull request" className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <GitPullRequest size={14} aria-hidden="true" className="text-purple-700" />
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-900 hover:underline"
        >
          {pr.title} <span className="font-mono text-xs text-[var(--text-muted)]">{`#${pr.number}`}</span>
        </a>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PR_STATE_CHIP[pr.state]}`}>
          {PR_STATE_LABEL[pr.state]}
        </span>
      </div>

      <div className="mt-2">
        <p className="text-xs text-gray-500 mb-1">Revisores</p>
        {pr.reviewers.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {pr.reviewers.map(r => (
              <li key={r.login} className="inline-flex items-center gap-1.5">
                <span className="font-mono text-xs text-gray-700">{r.login}</span>
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${REVIEWER_STATE_CHIP[r.state]}`}>
                  {REVIEWER_STATE_LABEL[r.state]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">Sin revisores</p>
        )}
      </div>

      <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-gray-700">
        <span className={`inline-flex items-center gap-1 ${checksColor}`}>
          <ChecksIcon size={13} aria-hidden="true" />
          {`Checks: ${checksText}`}
        </span>
        {waitText && (
          <span className="inline-flex items-center gap-1">
            <Clock size={13} aria-hidden="true" />
            {waitText}
          </span>
        )}
      </div>
    </section>
  );
}
