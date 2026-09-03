'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';
import { Plus, RefreshCw, Target, Layers } from 'lucide-react';

type SpaceItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  period: string | null;
  targetDate: string | null;
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

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  activo: 'Activo',
  cerrado: 'Cerrado',
};

const STATUS_COLORS: Record<string, string> = {
  borrador: 'bg-yellow-100 text-yellow-700',
  activo: 'bg-green-100 text-green-700',
  cerrado: 'bg-gray-100 text-gray-500',
};

export default function EspaciosPage() {
  const { user } = useSession();
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/spaces')
      .then(r => r.ok ? r.json() : [])
      .then(setSpaces)
      .finally(() => setLoading(false));
  }, []);

  const canCreate = user?.role === 'admin' || user?.role === 'miembro';

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Espacios</h1>
        {canCreate && (
          <button
            onClick={() => router.push('/espacios/nuevo')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Nuevo espacio
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {spaces.map(space => {
            const Icon = TYPE_ICONS[space.type] || Layers;
            return (
              <div
                key={space.id}
                onClick={() => router.push(`/espacios/${space.id}`)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm cursor-pointer transition-shadow flex items-center gap-4"
              >
                <Icon size={20} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{space.name}</span>
                    {space.period && (
                      <span className="text-xs text-gray-400">{space.period}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {TYPE_LABELS[space.type]}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  STATUS_COLORS[space.status] || 'bg-gray-100 text-gray-500'
                }`}>
                  {STATUS_LABELS[space.status] || space.status}
                </span>
              </div>
            );
          })}
          {spaces.length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">No hay espacios creados</p>
          )}
        </div>
      )}
    </div>
  );
}
