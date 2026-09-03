'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { useRouter } from 'next/navigation';
import { formatDateRD } from '@/lib/date-utils';
import {
  FolderOpen, AlertTriangle, Lock, RefreshCw,
  Target, Layers,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/mi-trabajo');
      return;
    }
    fetch('/api/panorama')
      .then(r => r.ok ? r.json() : [])
      .then(setSpaces)
      .finally(() => setLoading(false));
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Panorama</h1>
        <p className="text-sm text-gray-500 mt-1">
          {spaces.length} {spaces.length === 1 ? 'espacio activo' : 'espacios activos'}
        </p>
      </div>

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
    </div>
  );
}
