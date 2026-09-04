'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { useRouter } from 'next/navigation';
import { formatDateRD } from '@/lib/date-utils';
import {
  FolderOpen, AlertTriangle, Lock, RefreshCw,
  Target, Layers, TrendingUp, Users, Building2, CheckCircle, Download,
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

type DashboardData = {
  totals: { total: number; completed: number; overdue: number; blocked: number; completionRate: number };
  byStatus: { status: string; label: string; count: number; color: string }[];
  byPerson: { personName: string; total: number; completed: number; overdue: number }[];
  byCompany: { companyName: string; total: number; completed: number; overdue: number }[];
};

const TYPE_ICONS: Record<string, typeof RefreshCw> = {
  recurrente: RefreshCw,
  proyecto: Target,
  continuo: Layers,
};

const TYPE_LABELS: Record<string, string> = {
  recurrente: 'Recurrente',
  proyecto: 'Proyecto',
  continuo: 'Continuo',
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'espacios' | 'kpis'>('espacios');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/mi-trabajo');
      return;
    }
    Promise.all([
      fetch('/api/panorama').then(r => r.ok ? r.json() : []),
      fetch('/api/dashboard').then(r => r.ok ? r.json() : null),
    ]).then(([spacesData, dashData]) => {
      setSpaces(spacesData);
      setDashboard(dashData);
    }).finally(() => setLoading(false));
  }, [user, router]);

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
          <h1 className="text-2xl font-semibold text-gray-900">Panorama</h1>
          <p className="text-sm text-gray-500 mt-1">
            {spaces.length} {spaces.length === 1 ? 'espacio activo' : 'espacios activos'}
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
            onClick={() => setTab('espacios')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === 'espacios' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Espacios
          </button>
          <button
            onClick={() => setTab('kpis')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === 'kpis' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            KPIs
          </button>
        </div>
        </div>
      </div>

      {tab === 'kpis' && dashboard && (
        <div className="space-y-6 mb-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={16} className="text-green-500" />
                <p className="text-sm text-gray-500">Cumplimiento</p>
              </div>
              <p className="text-3xl font-semibold text-gray-900">{dashboard.totals.completionRate}%</p>
              <p className="text-xs text-gray-400 mt-1">{dashboard.totals.completed} de {dashboard.totals.total}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-blue-500" />
                <p className="text-sm text-gray-500">Total tareas</p>
              </div>
              <p className="text-3xl font-semibold text-gray-900">{dashboard.totals.total}</p>
            </div>
            <div className={`bg-white border rounded-lg p-4 ${dashboard.totals.overdue > 0 ? 'border-red-300' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} className="text-red-500" />
                <p className="text-sm text-gray-500">Vencidas</p>
              </div>
              <p className={`text-3xl font-semibold ${dashboard.totals.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{dashboard.totals.overdue}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={16} className="text-amber-500" />
                <p className="text-sm text-gray-500">Bloqueadas</p>
              </div>
              <p className="text-3xl font-semibold text-gray-900">{dashboard.totals.blocked}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <div className="w-1 h-4 bg-blue-500 rounded" />
                Por estado
              </h3>
              <div className="flex items-center gap-6">
                <DonutChart segments={dashboard.byStatus} completionRate={dashboard.totals.completionRate} />
                <div className="space-y-2 flex-1">
                  {dashboard.byStatus.map(s => (
                    <div key={s.status} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm text-gray-700 flex-1">{s.label}</span>
                      <span className="text-sm font-semibold text-gray-900">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Users size={16} className="text-gray-400" />
                Por persona
              </h3>
              <div className="space-y-2.5">
                {dashboard.byPerson.slice(0, 8).map(p => {
                  const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
                  return (
                    <div key={p.personName}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700 truncate">{p.personName}</span>
                        <div className="flex items-center gap-2">
                          {p.overdue > 0 && (
                            <span className="text-[10px] text-red-600 font-medium">{p.overdue} venc.</span>
                          )}
                          <span className="text-xs text-gray-500">{p.completed}/{p.total}</span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {dashboard.byCompany.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Building2 size={16} className="text-gray-400" />
                Por empresa
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {dashboard.byCompany.map(c => {
                  const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
                  return (
                    <div key={c.companyName} className="border border-gray-100 rounded-lg p-3">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.companyName}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8">{pct}%</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                        <span>{c.completed}/{c.total} completadas</span>
                        {c.overdue > 0 && <span className="text-red-600">{c.overdue} vencidas</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'espacios' && (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Espacio</th>
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
                      <span className="text-xs text-gray-500 w-8">{pct}%</span>
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
            No hay espacios activos
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function DonutChart({ segments, completionRate }: {
  segments: { count: number; color: string }[];
  completionRate: number;
}) {
  const size = 140;
  const strokeWidth = 20;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) return null;

  let cumulativeAngle = -90;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      {segments.filter(s => s.count > 0).map((segment, i) => {
        const fraction = segment.count / total;
        const dashLength = fraction * circumference;
        const gapLength = circumference - dashLength;
        const rotation = cumulativeAngle;
        cumulativeAngle += fraction * 360;
        return (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLength} ${gapLength}`}
            transform={`rotate(${rotation} ${center} ${center})`}
          />
        );
      })}
      <text x={center} y={center - 4} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '24px', fontWeight: 700, fill: '#111827' }}>
        {completionRate}%
      </text>
      <text x={center} y={center + 16} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '10px', fill: '#6b7280' }}>
        cumplimiento
      </text>
    </svg>
  );
}
