// Presentación pura de las métricas de ciclo y de la antigüedad del trabajo en curso.
// Sin hooks ni fetch: delivery-metrics.tsx carga los datos y los pasa por props.

import Link from 'next/link';
import { STATUS_CHIP, STATUS_LABEL, WIP_AGED_CHIP, taskKey, type TaskStatus } from '@/lib/labels';
import type { CycleStats, LeadStats, WipAgingRow } from '@/lib/metrics';

const MAX_ROWS = 10;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const fmtDays = (n: number) => `${n} ${plural(n, 'día', 'días')}`;

function statusLabel(s: string): string {
  return Object.hasOwn(STATUS_LABEL, s) ? STATUS_LABEL[s as TaskStatus] : s;
}

function statusChip(s: string): string {
  return Object.hasOwn(STATUS_CHIP, s) ? STATUS_CHIP[s as TaskStatus] : STATUS_CHIP.no_iniciada;
}

export function CycleTimeSummary({ cycle, lead, openTasks }: { cycle: CycleStats; lead: LeadStats; openTasks: number }) {
  return (
    <>
      {cycle.count === 0 || cycle.median === null || cycle.p85 === null ? (
        <p className="text-sm text-[var(--text-muted)]">Aún no hay tareas terminadas en este periodo.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">Mediana</dt>
            <dd className="tabular text-2xl font-semibold text-[var(--text-primary)]">
              {cycle.median}<span className="text-sm font-normal text-[var(--text-muted)]">{` ${plural(cycle.median, 'día', 'días')}`}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">9 de cada 10 tareas</dt>
            <dd className="tabular text-2xl font-semibold text-[var(--text-primary)]">
              {`≤ ${cycle.p85}`}<span className="text-sm font-normal text-[var(--text-muted)]">{` ${plural(cycle.p85, 'día', 'días')}`}</span>
            </dd>
          </div>
        </dl>
      )}
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">Desde que empieza el trabajo hasta que se cierra.</p>
      {lead.count > 0 && lead.median !== null && lead.p85 !== null && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {`Lead time (desde la creación): mediana ${fmtDays(lead.median)} · p85 ${fmtDays(lead.p85)}`}
        </p>
      )}
      {cycle.withoutStart > 0 && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {`${cycle.withoutStart} ${plural(cycle.withoutStart, 'tarea', 'tareas')} sin inicio registrado: se mide desde su creación.`}
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {`${cycle.count} ${plural(cycle.count, 'tarea terminada', 'tareas terminadas')} · ${openTasks} ${plural(openTasks, 'abierta', 'abiertas')}`}
      </p>
    </>
  );
}

export function WipAgingList({ items, total }: { items: WipAgingRow[]; total: number }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Nada en curso ahora mismo.</p>;
  }
  const shown = items.slice(0, MAX_ROWS);
  return (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {shown.map(r => (
          <li key={r.id} className="py-2 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Link href={`/tareas/${r.id}`} className="text-sm text-[var(--text-primary)] hover:text-blue-700">
                <span className="tabular text-xs text-[var(--text-muted)] mr-1.5">{taskKey(r.number)}</span>
                <span className="break-words">{r.title}</span>
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className={`rounded-full px-2 py-0.5 ${statusChip(r.status)}`}>{statusLabel(r.status)}</span>
                <span>{r.responsibleName}</span>
                {r.aged && (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${WIP_AGED_CHIP}`} title="Lleva más tiempo que el 85 % de las tareas cerradas en los últimos 60 días">
                    Envejecida
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`tabular text-sm ${r.aged ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{fmtDays(r.days)}</span>
              {r.withoutStart && <p className="text-[10px] text-[var(--text-muted)]">desde su creación</p>}
            </div>
          </li>
        ))}
      </ul>
      {total > shown.length && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          {`Se muestran ${shown.length} de ${total} tareas en curso, las más antiguas.`}
        </p>
      )}
    </>
  );
}
