'use client';

import { useEffect, useState } from 'react';
import { AREA_LABEL, KIND_LABEL, type TaskKind } from '@/lib/labels';
import type { CycleStats, LeadStats, WipAgingRow, WipRow } from '@/lib/metrics';
import { CycleTimeSummary, WipAgingList } from './wip-aging-list';
import { WipByPersonTable } from './person-workload';

/** Respuesta de /api/metrics: sólo totales del equipo (lo por persona está en /api/metrics/people). */
export type Metrics = {
  velocity: { start: string; tasks: number; points: number }[];
  averagePointsPerWeek: number;
  cycleTime: CycleStats;
  leadTime: LeadStats;
  wipAging: WipAgingRow[];
  wipAgingTotal: number;
  blockers: { area: string; count: number }[];
  doneByKind: { kind: string; count: number }[];
  openTasks: number;
};

const fmtWeek = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Contenedor: carga /api/metrics. `personWorkload` llega de /api/metrics/people y es null
 * si el equipo apagó las métricas por persona (DECISIONES §22) o si no se pudieron cargar.
 */
export function DeliveryMetrics({ personWorkload }: { personWorkload: WipRow[] | null }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/metrics').then(r => (r.ok ? r.json() : Promise.reject())).then(setM).catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="mb-6 text-sm text-red-700" role="alert">No se pudieron cargar las métricas de entrega.</p>;
  if (!m) return <div className="mb-6 h-64 rounded-lg bg-gray-100 animate-pulse" aria-hidden="true" />;

  return <DeliveryMetricsView metrics={m} personWorkload={personWorkload} />;
}

/** Presentación pura del panel de entrega. Sin datos por persona (null) no pinta su tarjeta. */
export function DeliveryMetricsView({ metrics: m, personWorkload }: { metrics: Metrics; personWorkload: WipRow[] | null }) {
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
          <CycleTimeSummary cycle={m.cycleTime} lead={m.leadTime} openTasks={m.openTasks} />
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

        {personWorkload !== null && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Trabajo en curso por persona</h3>
            <WipByPersonTable rows={personWorkload} />
          </div>
        )}

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Antigüedad del trabajo en curso</h3>
          <WipAgingList items={m.wipAging} total={m.wipAgingTotal} />
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
