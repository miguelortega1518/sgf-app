'use client';

import { useState, useEffect } from 'react';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';

type AuditEntry = {
  id: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  timestamp: string;
  actorName: string;
  actorEmail: string;
  taskId: string | null;
  taskTitle: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  status_changed: 'Cambio de estado',
  due_date_changed: 'Cambio de fecha',
  responsible_changed: 'Cambio de responsable',
  task_approved: 'Tarea aprobada',
  task_approved_admin_override: 'Aprobación admin',
  space_health_updated: 'Actualización de salud',
  space_closed: 'Espacio cerrado',
};

const ACTION_COLORS: Record<string, string> = {
  status_changed: 'bg-blue-100 text-blue-700',
  due_date_changed: 'bg-amber-100 text-amber-700',
  responsible_changed: 'bg-purple-100 text-purple-700',
  task_approved: 'bg-green-100 text-green-700',
  task_approved_admin_override: 'bg-green-100 text-green-700',
};

export default function BitacoraPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit-log?page=${page}`)
      .then(r => r.json())
      .then(data => {
        setEntries(data.entries || []);
        setHasMore(data.hasMore || false);
      })
      .finally(() => setLoading(false));
  }, [page]);

  function formatTimestamp(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString('es-DO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  if (loading && page === 1) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-16 bg-gray-200 rounded" />
          <div className="h-16 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bitácora</h1>
        <p className="text-sm text-gray-500 mt-1">
          Registro de todas las acciones del sistema
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <ScrollText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay registros</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Fecha</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Acción</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Tarea</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Usuario</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                        ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.taskTitle ? (
                        <a
                          href={`/tareas/${entry.taskId}`}
                          className="text-sm text-blue-600 hover:underline truncate block max-w-48"
                        >
                          {entry.taskTitle}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{entry.actorName}</p>
                    </td>
                    <td className="px-4 py-3">
                      {entry.previousValue && entry.newValue ? (
                        <span className="text-xs text-gray-500">
                          {entry.previousValue} → {entry.newValue}
                        </span>
                      ) : entry.reason ? (
                        <span className="text-xs text-gray-500">{entry.reason}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span className="text-sm text-gray-500">Página {page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
