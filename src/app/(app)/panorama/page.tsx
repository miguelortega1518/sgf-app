'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { useRouter } from 'next/navigation';
import { formatDateRD } from '@/lib/date-utils';
import { DeliveryMetrics } from '@/components/dashboard/delivery-metrics';
import { FlowMetrics } from '@/components/dashboard/flow-metrics';
import { PanoramaKpis, type DashboardData } from '@/components/dashboard/panorama-kpis';
import type { PersonLoadRow, WipRow } from '@/lib/metrics';
import {
  FolderOpen, AlertTriangle, Lock, RefreshCw,
  Target, Layers, Download,
} from 'lucide-react';

type SpaceRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  targetDate: string | null;
  declaredHealth: string | null;
  ownerName: string;
  period: string | null;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  daysSinceUpdate: number | null;
  noSignal: boolean;
};

type PersonMetrics = { wip: WipRow[]; byPerson: PersonLoadRow[] };

/** Si falla el ajuste o las métricas por persona, se ocultan sus tarjetas y se avisa. */
const PERSON_METRICS_ERROR = 'No se pudieron cargar las métricas por persona.';

/**
 * Métricas por persona según el ajuste del equipo (DECISIONES §22): null si está apagado.
 * Rechaza si no se puede leer el ajuste o, con él encendido, las métricas.
 */
async function loadPersonMetrics(): Promise<PersonMetrics | null> {
  const settingsRes = await fetch('/api/settings/team');
  if (!settingsRes.ok) throw new Error(`settings ${settingsRes.status}`);
  const settings = (await settingsRes.json()) as { showPersonMetrics: boolean };
  if (!settings.showPersonMetrics) return null;

  const res = await fetch('/api/metrics/people');
  // 403: un admin lo apagó entre las dos peticiones; es el estado «apagado», no un error.
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`metrics/people ${res.status}`);
  return (await res.json()) as PersonMetrics;
}

const TYPE_ICONS: Record<string, typeof RefreshCw> = {
  recurrente: RefreshCw,
  proyecto: Target,
  continuo: Layers,
};

const TYPE_LABELS: Record<string, string> = {
  recurrente: 'Sprint',
  proyecto: 'Iniciativa',
  continuo: 'Backlog',
};

const HEALTH_COLORS: Record<string, string> = {
  verde: 'bg-green-400',
  amarillo: 'bg-yellow-400',
  rojo: 'bg-red-400',
};

export default function PanoramaPage() {
  const { user } = useSession();
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [personMetrics, setPersonMetrics] = useState<PersonMetrics | null>(null);
  const [personMetricsFailed, setPersonMetricsFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'proyectos' | 'kpis'>('proyectos');

  useEffect(() => {
    Promise.all([
      fetch('/api/panorama').then(r => r.ok ? r.json() : []),
      fetch('/api/dashboard').then(r => r.ok ? r.json() : null),
      loadPersonMetrics().catch((err: unknown) => {
        console.error('No se pudieron cargar las métricas por persona', err);
        setPersonMetricsFailed(true);
        return null;
      }),
    ]).then(([spacesData, dashData, people]) => {
      setSpaces(spacesData);
      setDashboard(dashData);
      setPersonMetrics(people);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-48" />
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Panorama del equipo</h1>
          <p className="text-sm text-gray-500 mt-1">
            {spaces.length} {spaces.length === 1 ? 'proyecto activo' : 'proyectos activos'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <a
              href="/api/export"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 transition-colors"
            >
              <Download size={14} />
              Excel
            </a>
            <a
              href="/api/export?format=pdf"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-1.5 border-l border-gray-200 transition-colors"
            >
              PDF
            </a>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab('proyectos')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === 'proyectos' ? 'bg-[var(--bg-card)] text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Proyectos
            </button>
            <button
              onClick={() => setTab('kpis')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === 'kpis' ? 'bg-[var(--bg-card)] text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              KPIs
            </button>
          </div>
        </div>
      </div>

      {personMetricsFailed && (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-300" role="alert">{PERSON_METRICS_ERROR}</p>
      )}

      <DeliveryMetrics personWorkload={personMetrics?.wip ?? null} />
      <FlowMetrics />

      {tab === 'kpis' && dashboard && (
        <PanoramaKpis dashboard={dashboard} personLoad={personMetrics?.byPerson ?? null} />
      )}

      {tab === 'proyectos' && (
      <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Proyecto</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Tipo</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Dueño</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">Progreso</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">Salud</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">Vencidas</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">Bloqueadas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {spaces.map(space => {
              const Icon = TYPE_ICONS[space.type] || FolderOpen;
              const pct = space.totalTasks > 0
                ? Math.round((space.completedTasks / space.totalTasks) * 100)
                : 0;

              return (
                <tr
                  key={space.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/espacios/${space.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">
                        {space.name}
                      </span>
                      {space.period && (
                        <span className="text-xs text-gray-400">{space.period}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">
                      {TYPE_LABELS[space.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">{space.ownerName}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-12">{space.completedTasks}/{space.totalTasks}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {space.noSignal ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                        Sin señal
                      </span>
                    ) : space.declaredHealth ? (
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                        HEALTH_COLORS[space.declaredHealth] || 'bg-gray-300'
                      }`} />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {space.overdueTasks > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertTriangle size={12} />
                        {space.overdueTasks}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {space.blockedTasks > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <Lock size={12} />
                        {space.blockedTasks}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {spaces.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No hay proyectos activos
          </div>
        )}
      </div>
      )}
    </div>
  );
}
