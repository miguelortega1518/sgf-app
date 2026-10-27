'use client';

import { useEffect, useState } from 'react';
import { AREA_LABEL, KIND_LABEL, type TaskKind } from '@/lib/labels';

type Metrics = {
  velocity: { start: string; tasks: number; points: number }[];
  averagePointsPerWeek: number;
  cycleTime: { count: number; median: number | null; p85: number | null };
  wip: { personId: string; name: string; inProgress: number; inReview: number; blocked: number }[];
  blockers: { area: string; count: number }[];
  doneByKind: { kind: string; count: number }[];
  openTasks: number;
};

const fmtWeek = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function DeliveryMetrics() {
  const [m, setM] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/metrics').then(r => (r.ok ? r.json() : Promise.reject())).then(setM).catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="mb-6 text-sm text-red-700" role="alert">No se pudieron cargar las métricas de entrega.</p>;
  if (!m) return <div className="mb-6 h-64 rounded-lg bg-gray-100 animate-pulse" aria-hidden="true" />;

  const maxPts = Math.max(1, ...m.velocity.map(w => w.points));
  const maxBlock = Math.max(1, ...m.blockers.map(b => b.count));

  return (
    <section className="mb-8" aria-labelledby="entrega-title">
      <h2 id="entrega-title" className="text-base font-semibold text-[var(--text-primary)] mb-3">Entrega del equipo</h2>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Velocidad semanal</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Promedio 4 semanas: <span className="tabular font-semibold text-[var(--text-primary)]">{m.averagePointsPerWeek}</span> pts
            </p>
          </div>
          <div className="flex items-end gap-2 h-36" role="img" aria-label={`Puntos terminados por semana: ${m.velocity.map(w => `${fmtWeek(w.start)}: ${w.points}`).join(', ')}`}>
            {m.velocity.map((w, i) => {
              const last = i === m.velocity.length - 1;
              return (
                <div key={w.start} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                  <span className="tabular text-[11px] text-[var(--text-secondary)] mb-1">{w.points || ''}</span>
                  <div
                    className={`w-full rounded-t ${last ? 'bg-blue-300' : 'bg-blue-600'}`}
                    style={{ height: `${Math.max(w.points ? 6 : 2, (w.points / maxPts) * 100)}%` }}
                    title={`${fmtWeek(w.start)}: ${w.points} pts, ${w.tasks} tareas${last ? ' (semana en curso)' : ''}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            {m.velocity.map(w => <span key={w.start} className="flex-1 text-center text-[10px] text-[var(--text-muted)] truncate">{fmtWeek(w.start)}</span>)}
          </div>
          <p className="mt-3 text-[11px] text-[var(--text-muted)]">La barra clara es la semana en curso; aún no está completa.</p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Tiempo de ciclo · últimos 60 días</h3>
          {m.cycleTime.count === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aún no hay tareas terminadas en este periodo.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Mediana</dt>
                <dd className="tabular text-2xl font-semibold text-[var(--text-primary)]">{m.cycleTime.median}<span className="text-sm font-normal text-[var(--text-muted)]"> días</span></dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">9 de cada 10 tareas</dt>
                <dd className="tabular text-2xl font-semibold text-[var(--text-primary)]">≤ {m.cycleTime.p85}<span className="text-sm font-normal text-[var(--text-muted)]"> días</span></dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {m.cycleTime.count} tareas terminadas · {m.openTasks} abiertas
          </p>
          {m.doneByKind.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {m.doneByKind.map(k => (
                <li key={k.kind} className="text-xs rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text-secondary)]">
                  <span className="tabular font-semibold text-[var(--text-primary)]">{k.count}</span> {KIND_LABEL[k.kind as TaskKind] ?? k.kind} (30 d)
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Trabajo en curso por persona</h3>
          {m.wip.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nadie tiene tareas en curso.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="font-medium pb-2">Persona</th>
                  <th className="font-medium pb-2 text-right">En progreso</th>
                  <th className="font-medium pb-2 text-right">Code review</th>
                  <th className="font-medium pb-2 text-right">Bloqueadas</th>
                </tr>
              </thead>
              <tbody>
                {m.wip.map(r => (
                  <tr key={r.personId} className="border-t border-[var(--border)]">
                    <td className="py-2 text-[var(--text-primary)]">{r.name}</td>
                    <td className="py-2 text-right tabular">{r.inProgress}</td>
                    <td className="py-2 text-right tabular">{r.inReview}</td>
                    <td className={`py-2 text-right tabular ${r.blocked ? 'text-red-700 font-medium' : ''}`}>{r.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Qué está bloqueando al equipo</h3>
          {m.blockers.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nada bloqueado ahora mismo.</p>
          ) : (
            <ul className="space-y-2.5">
              {m.blockers.map(b => (
                <li key={b.area}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--text-primary)]">{AREA_LABEL[b.area] ?? b.area}</span>
                    <span className="tabular text-[var(--text-secondary)]">{b.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${(b.count / maxBlock) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
