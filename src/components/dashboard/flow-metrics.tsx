'use client';

import { useEffect, useState } from 'react';
import type { CfdEntry, CycleHistogram } from '@/lib/flow-metrics';
import { CumulativeFlowChart } from './cumulative-flow-chart';
import { CycleTimeHistogram } from './cycle-time-histogram';

type FlowData = { days: number; cfd: CfdEntry[]; cycleHistogram: CycleHistogram };
type SpaceOption = { id: string; name: string };

/** Sección «Flujo de trabajo» de Panorama: CFD e histograma del ciclo, con filtro por proyecto. */
export function FlowMetrics() {
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [spaceId, setSpaceId] = useState('');
  // Resultado de la última carga, ligado al proyecto pedido para no mostrar datos de otro.
  const [result, setResult] = useState<{ spaceId: string; data: FlowData | null; failed: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/spaces')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: SpaceOption[]) => setSpaces(rows.map(s => ({ id: s.id, name: s.name }))))
      .catch(() => setSpaces([]));
  }, []);

  useEffect(() => {
    let ignore = false;
    const query = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : '';
    fetch(`/api/metrics/flow${query}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: FlowData) => { if (!ignore) setResult({ spaceId, data, failed: false }); })
      .catch(() => { if (!ignore) setResult({ spaceId, data: null, failed: true }); });
    return () => { ignore = true; };
  }, [spaceId]);

  const current = result && result.spaceId === spaceId ? result : null;

  return (
    <section className="mb-8" aria-labelledby="flujo-title">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 id="flujo-title" className="text-base font-semibold text-[var(--text-primary)]">Flujo de trabajo</h2>
        <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          Proyecto
          <select
            value={spaceId}
            onChange={e => setSpaceId(e.target.value)}
            className="h-8 px-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-card)] text-sm"
          >
            <option value="">Todos los proyectos</option>
            {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {current?.failed ? (
        <p className="text-sm text-red-700" role="alert">No se pudieron cargar las métricas de flujo.</p>
      ) : !current?.data ? (
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" aria-hidden="true" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
              Flujo acumulado · últimos {current.data.days} días
            </h3>
            <CumulativeFlowChart data={current.data.cfd} />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Distribución del tiempo de ciclo</h3>
            <CycleTimeHistogram histogram={current.data.cycleHistogram} />
          </div>
        </div>
      )}
    </section>
  );
}
