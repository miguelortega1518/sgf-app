'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { GitBranch, GitPullRequest, Lock, MoveRight } from 'lucide-react';
import {
  STATUS_ORDER, STATUS_LABEL, STATUS_DOT, KIND_CHIP, KIND_LABEL, PRIORITY_DOT, PRIORITY_LABEL,
  BLOCK_AREAS, taskKey, prLabel, initials,
  type TaskStatus, type TaskKind,
} from '@/lib/labels';
import { formatDateRD } from '@/lib/date-utils';

export type BoardTask = {
  id: string;
  number?: number | null;
  title: string;
  status: string;
  kind?: string | null;
  estimate?: number | null;
  branch?: string | null;
  prUrl?: string | null;
  labels?: string[] | null;
  priority: string;
  dueDate: string | null;
  dueDateOriginal: string | null;
  responsibleName: string;
  companyName: string | null;
  blockedByArea: string | null;
  requiresApproval: boolean;
};

type Props = {
  tasks: BoardTask[];
  readOnly?: boolean;
  /** Devuelve true si el cambio se aplicó. */
  onMove: (taskId: string, status: TaskStatus, extra?: { blockedByArea?: string; blockedByAreaText?: string }) => Promise<boolean>;
};

function isOverdue(t: BoardTask): boolean {
  if (t.status === 'completada' || !t.dueDate) return false;
  return t.dueDate < new Date().toISOString().slice(0, 10);
}

export function KanbanBoard({ tasks, readOnly = false, onMove }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [area, setArea] = useState('');
  const [areaText, setAreaText] = useState('');

  const columns = useMemo(() => {
    const by: Record<TaskStatus, BoardTask[]> = {
      no_iniciada: [], en_proceso: [], en_revision: [], completada: [], bloqueada: [],
    };
    for (const t of tasks) (by[t.status as TaskStatus] ?? by.no_iniciada).push(t);
    const rank: Record<string, number> = { critica: 0, alta: 1, normal: 2, baja: 3 };
    for (const k of STATUS_ORDER) by[k].sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) || (a.number ?? 0) - (b.number ?? 0));
    return by;
  }, [tasks]);

  async function move(taskId: string, status: TaskStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === status || readOnly) return;
    if (status === 'bloqueada') { setPendingBlock(taskId); setArea(''); setAreaText(''); return; }
    await onMove(taskId, status);
  }

  async function confirmBlock() {
    if (!pendingBlock || !area) return;
    const id = pendingBlock;
    setPendingBlock(null);
    await onMove(id, 'bloqueada', { blockedByArea: area, blockedByAreaText: area === 'otro' ? areaText : undefined });
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x" role="list" aria-label="Tablero de tareas">
        {STATUS_ORDER.map(status => {
          const items = columns[status];
          const points = items.reduce((s, t) => s + (t.estimate ?? 0), 0);
          const isOver = overCol === status && dragId !== null;
          return (
            <section
              key={status}
              role="listitem"
              aria-label={`${STATUS_LABEL[status]}, ${items.length} tareas`}
              onDragOver={e => { if (readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverCol(status); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={e => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || dragId;
                setOverCol(null); setDragId(null);
                if (id) void move(id, status);
              }}
              className={`snap-start shrink-0 w-[16rem] xl:w-auto xl:flex-1 xl:min-w-[13.5rem] flex flex-col rounded-lg border transition-colors ${
                isOver ? 'border-blue-400 bg-blue-50' : 'border-[var(--border)] bg-gray-50'
              }`}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2 text-xs font-medium text-[var(--text-secondary)]">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
                <h3 className="font-medium text-[var(--text-primary)]">{STATUS_LABEL[status]}</h3>
                <span className="tabular text-[var(--text-muted)]">{items.length}</span>
                {points > 0 && <span className="ml-auto tabular text-[var(--text-muted)]">{points} pts</span>}
              </header>

              <div className="flex-1 px-2 pb-2 space-y-2 min-h-24">
                {items.map(t => (
                  <TaskCardBoard
                    key={t.id}
                    task={t}
                    dragging={dragId === t.id}
                    readOnly={readOnly}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onMove={s => void move(t.id, s)}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] px-2 py-6 text-center">
                    {readOnly ? 'Sin tareas' : 'Arrastra una tarea aquí'}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {pendingBlock && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="block-title" onClick={() => setPendingBlock(null)}>
          <div className="w-full max-w-sm rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 id="block-title" className="text-base font-semibold text-[var(--text-primary)]">¿Qué la bloquea?</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Queda registrado para ver dónde se atascan las tareas.</p>
            <div className="mt-4 grid gap-1.5">
              {BLOCK_AREAS.map(a => (
                <label key={a.value} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${area === a.value ? 'border-blue-500 bg-blue-50' : 'border-[var(--border)] hover:bg-gray-50'}`}>
                  <input type="radio" name="area" value={a.value} checked={area === a.value} onChange={() => setArea(a.value)} className="accent-[var(--accent)]" />
                  {a.label}
                </label>
              ))}
            </div>
            {area === 'otro' && (
              <input autoFocus value={areaText} onChange={e => setAreaText(e.target.value)} placeholder="Describe el bloqueo" className="mt-3 w-full h-9 px-3 rounded-md border border-[var(--border-strong)] text-sm" />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPendingBlock(null)} className="h-9 px-3 rounded-md text-sm text-[var(--text-secondary)] hover:bg-gray-100">Cancelar</button>
              <button onClick={confirmBlock} disabled={!area || (area === 'otro' && !areaText.trim())} className="h-9 px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Marcar bloqueada</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TaskCardBoard({
  task, dragging, readOnly, onDragStart, onDragEnd, onMove,
}: {
  task: BoardTask; dragging: boolean; readOnly: boolean;
  onDragStart: () => void; onDragEnd: () => void; onMove: (s: TaskStatus) => void;
}) {
  const kind = (task.kind ?? 'feature') as TaskKind;
  const overdue = isOverdue(task);
  return (
    <article
      draggable={!readOnly}
      onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className={`group relative rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-[0_1px_2px_oklch(0.2_0.02_255/0.06)] transition-[box-shadow,opacity,border-color] hover:border-[var(--border-strong)] hover:shadow-[0_2px_6px_oklch(0.2_0.02_255/0.1)] ${
        dragging ? 'opacity-40' : ''
      } ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div className="flex items-center gap-2 mb-1.5 pr-7">
        <span className="font-mono text-[11px] text-[var(--text-muted)] tabular">{taskKey(task.number)}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${KIND_CHIP[kind] ?? KIND_CHIP.feature}`}>{KIND_LABEL[kind] ?? kind}</span>
      </div>

      <Link href={`/tareas/${task.id}`} draggable={false} className="block text-[13px] leading-snug font-medium text-[var(--text-primary)] hover:text-blue-700 after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 after:rounded-lg">
        {task.title}
      </Link>

      {task.companyName && <p className="mt-1 text-[11px] text-[var(--text-muted)] truncate">{task.companyName}</p>}

      {task.status === 'bloqueada' && task.blockedByArea && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-700"><Lock size={11} aria-hidden="true" />Bloqueada</p>
      )}

      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)] relative z-10 pointer-events-none whitespace-nowrap">
        <span title={`Prioridad ${PRIORITY_LABEL[task.priority] ?? task.priority}`} className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.normal}`} />
        {task.estimate != null && <span className="tabular shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">{task.estimate} pts</span>}
        {task.dueDate && <span className={`tabular shrink-0 ${overdue ? 'text-red-700 font-medium' : ''}`}>{formatDateRD(task.dueDate)}</span>}
        <span className="ml-auto w-5 h-5 shrink-0 rounded-full bg-blue-100 text-blue-700 text-[9px] font-semibold flex items-center justify-center" title={task.responsibleName}>{initials(task.responsibleName)}</span>
      </div>

      {(task.branch || task.prUrl) && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-muted)] relative z-10 pointer-events-none min-w-0">
          {task.branch && <span className="inline-flex items-center gap-1 font-mono truncate min-w-0" title={task.branch}><GitBranch size={11} className="shrink-0" aria-hidden="true" /><span className="truncate">{task.branch}</span></span>}
          {task.prUrl && <span className="inline-flex items-center gap-1 font-mono text-purple-700 shrink-0"><GitPullRequest size={11} aria-hidden="true" />{prLabel(task.prUrl)}</span>}
        </div>
      )}

      {!readOnly && (
        <label className="absolute top-1.5 right-1.5 z-20 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity [@media(hover:none)]:opacity-100">
          <span className="sr-only">Mover {taskKey(task.number)} a</span>
          <select
            value=""
            onChange={e => { if (e.target.value) onMove(e.target.value as TaskStatus); }}
            className="h-6 w-6 appearance-none rounded border border-[var(--border)] bg-[var(--bg-card)] text-transparent cursor-pointer hover:bg-gray-100"
            aria-label={`Mover ${taskKey(task.number)} a otra columna`}
          >
            <option value="" disabled>Mover a…</option>
            {STATUS_ORDER.filter(s => s !== task.status).map(s => <option key={s} value={s} className="text-[var(--text-primary)]">{STATUS_LABEL[s]}</option>)}
          </select>
          <MoveRight size={12} className="absolute inset-0 m-auto text-[var(--text-secondary)] pointer-events-none" aria-hidden="true" />
        </label>
      )}
    </article>
  );
}
