'use client';

import Link from 'next/link';
import { formatDateRD } from '@/lib/date-utils';
import { Calendar, AlertTriangle, Lock, GitBranch, GitPullRequest, Play, GitPullRequestArrow, Check } from 'lucide-react';
import {
  STATUS_LABEL, KIND_CHIP, KIND_LABEL, PRIORITY_DOT, PRIORITY_LABEL, SPACE_TYPE_LABEL, AREA_LABEL,
  taskKey, prLabel, type TaskKind, type TaskStatus,
} from '@/lib/labels';

type TaskCardProps = {
  task: {
    id: string;
    number?: number | null;
    kind?: string | null;
    estimate?: number | null;
    branch?: string | null;
    prUrl?: string | null;
    title: string;
    status: string;
    dueDate: string | null;
    dueDateOriginal: string | null;
    priority: string;
    spaceName: string;
    spaceType: string;
    companyName: string | null;
    blockedByArea: string | null;
    requiresApproval?: boolean;
  };
  isOverdue?: boolean;
  onStatusChange?: (taskId: string, status: string) => void;
};

function nextStatusOf(task: TaskCardProps['task']): TaskStatus | null {
  if (task.status === 'no_iniciada') return 'en_proceso';
  if (task.status === 'en_proceso') return task.requiresApproval ? 'en_revision' : 'completada';
  if (task.status === 'en_revision') return 'completada';
  return null;
}

const NEXT_ACTION: Record<string, { label: string; Icon: typeof Play }> = {
  en_proceso: { label: 'Empezar', Icon: Play },
  en_revision: { label: 'Pedir code review', Icon: GitPullRequestArrow },
  completada: { label: 'Marcar como hecho', Icon: Check },
};

export function TaskCard({ task, isOverdue, onStatusChange }: TaskCardProps) {
  const next = nextStatusOf(task);
  const action = next ? NEXT_ACTION[next] : null;
  const kind = (task.kind ?? 'feature') as TaskKind;

  return (
    <div className={`group rounded-lg border p-3 transition-[border-color,box-shadow] hover:shadow-[0_2px_6px_oklch(0.2_0.02_255/0.08)] ${
      isOverdue ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] text-[var(--text-muted)] tabular">{taskKey(task.number)}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${KIND_CHIP[kind] ?? KIND_CHIP.feature}`}>{KIND_LABEL[kind] ?? kind}</span>
            {task.estimate != null && <span className="tabular rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">{task.estimate} pts</span>}
            {task.priority !== 'normal' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]" title={`Prioridad ${PRIORITY_LABEL[task.priority] ?? task.priority}`}>
                <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.normal}`} aria-hidden="true" />
                {PRIORITY_LABEL[task.priority] ?? task.priority}
              </span>
            )}
          </div>

          <Link href={`/tareas/${task.id}`} className="text-sm font-medium text-[var(--text-primary)] hover:text-blue-700 line-clamp-2">
            {task.title}
          </Link>

          <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 flex-wrap text-xs text-[var(--text-muted)]">
            <span className="truncate">{task.spaceName} · {SPACE_TYPE_LABEL[task.spaceType] ?? task.spaceType}</span>
            {task.companyName && <span className="font-mono">{task.companyName}</span>}
            {task.branch && <span className="inline-flex items-center gap-1 font-mono"><GitBranch size={12} aria-hidden="true" />{task.branch}</span>}
            {task.prUrl && (
              <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-purple-700 hover:underline">
                <GitPullRequest size={12} aria-hidden="true" />{prLabel(task.prUrl)}
              </a>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs">
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[11px] font-medium">{STATUS_LABEL[task.status as TaskStatus] ?? task.status}</span>
            {task.dueDate && (
              <span className={`inline-flex items-center gap-1 tabular ${isOverdue ? 'text-red-700 font-medium' : 'text-[var(--text-muted)]'}`}>
                <Calendar size={12} aria-hidden="true" />
                {formatDateRD(task.dueDate)}
                {isOverdue && <AlertTriangle size={12} aria-label="Vencida" />}
              </span>
            )}
            {task.status === 'bloqueada' && (
              <span className="inline-flex items-center gap-1 text-red-700">
                <Lock size={12} aria-hidden="true" />
                {task.blockedByArea ? (AREA_LABEL[task.blockedByArea] ?? task.blockedByArea) : 'Bloqueada'}
              </span>
            )}
          </div>
        </div>

        {next && action && onStatusChange && (
          <button
            onClick={(e) => { e.preventDefault(); onStatusChange(task.id, next); }}
            className="shrink-0 h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
            aria-label={`${action.label}: ${task.title}`}
          >
            <action.Icon size={14} aria-hidden="true" />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        )}
      </div>
    </div>
  );
}
