// Pestaña KPIs de Panorama. Componente puro: totales del equipo (siempre visibles) y,
// si el ajuste del equipo lo permite, la carga por persona (DECISIONES §22).

import { AlertTriangle, Building2, CheckCircle, Lock, TrendingUp } from 'lucide-react';
import type { PersonLoadRow } from '@/lib/metrics';
import { PersonLoadCard } from './person-workload';

/** Respuesta de /api/dashboard: sólo totales del equipo. */
export type DashboardData = {
  totals: { total: number; completed: number; overdue: number; blocked: number; completionRate: number };
  byStatus: { status: string; label: string; count: number; color: string }[];
  byCompany: { companyName: string; total: number; completed: number; overdue: number }[];
};

export function PanoramaKpis({ dashboard, personLoad }: { dashboard: DashboardData; personLoad: PersonLoadRow[] | null }) {
  const showPersonLoad = personLoad !== null && personLoad.length > 0;
  return (
    <div className="space-y-6 mb-6">
      <div className="grid gap-4 grid-cols-4">
        <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={16} className="text-green-500" />
            <p className="text-sm text-gray-500">Cumplimiento</p>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{dashboard.totals.completionRate}%</p>
          <p className="text-xs text-gray-400 mt-1">{dashboard.totals.completed} de {dashboard.totals.total}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-blue-500" />
            <p className="text-sm text-gray-500">Total tareas</p>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{dashboard.totals.total}</p>
        </div>
        <div className={`bg-[var(--bg-card)] border rounded-lg p-4 ${dashboard.totals.overdue > 0 ? 'border-red-300' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-red-500" />
            <p className="text-sm text-gray-500">Vencidas</p>
          </div>
          <p className={`text-3xl font-semibold ${dashboard.totals.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{dashboard.totals.overdue}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={16} className="text-amber-500" />
            <p className="text-sm text-gray-500">Bloqueadas</p>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{dashboard.totals.blocked}</p>
        </div>
      </div>

      <div className={`grid gap-6 ${showPersonLoad ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4">
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

        {showPersonLoad && <PersonLoadCard rows={personLoad} />}
      </div>

      {dashboard.byCompany.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Building2 size={16} className="text-gray-400" />
            Por repositorio
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

  const visible = segments.filter(s => s.count > 0);
  // Ángulo de inicio de cada segmento, calculado sin mutar variables durante el render.
  const rotations = visible.reduce<number[]>((acc, _s, i) => {
    acc.push(i === 0 ? -90 : acc[i - 1] + (visible[i - 1].count / total) * 360);
    return acc;
  }, []);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      {visible.map((segment, i) => {
        const fraction = segment.count / total;
        const dashLength = fraction * circumference;
        const gapLength = circumference - dashLength;
        const rotation = rotations[i];
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
        style={{ fontSize: '24px', fontWeight: 700, fill: 'var(--text-primary)' }}>
        {completionRate}%
      </text>
      <text x={center} y={center + 16} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: '10px', fill: 'var(--text-muted)' }}>
        cumplimiento
      </text>
    </svg>
  );
}
