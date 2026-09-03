'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { TaskCard } from '@/components/tasks/task-card';
import { CheckSquare, Square } from 'lucide-react';

type TaskItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  dueDateOriginal: string | null;
  priority: string;
  spaceName: string;
  spaceType: string;
  companyName: string | null;
  blockedByArea: string | null;
  requiresApproval?: boolean;
};

type MyWorkData = {
  overdue: TaskItem[];
  dueToday: TaskItem[];
  dueThisWeek: TaskItem[];
  upcoming: TaskItem[];
  noDueDate: TaskItem[];
  blocked: TaskItem[];
  total: number;
};

export default function MiTrabajoPage() {
  const { user } = useSession();
  const [data, setData] = useState<MyWorkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/my-work');
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleStatusChange(taskId: string, status: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      fetchData();
    }
  }

  function toggleSelect(taskId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function handleBatchAction(status: string) {
    if (selected.size === 0) return;
    setBatchLoading(true);
    const res = await fetch('/api/tasks/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: [...selected], status }),
    });
    if (res.ok) {
      setSelected(new Set());
      setBatchMode(false);
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || 'Error al actualizar');
    }
    setBatchLoading(false);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-24 bg-gray-200 rounded" />
          <div className="h-24 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mi trabajo</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.total} {data.total === 1 ? 'tarea pendiente' : 'tareas pendientes'}
          </p>
        </div>
        {data.total > 0 && (
          <button
            onClick={() => { setBatchMode(!batchMode); setSelected(new Set()); }}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              batchMode ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {batchMode ? 'Cancelar selección' : 'Selección múltiple'}
          </button>
        )}
      </div>

      {batchMode && selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-blue-700 font-medium">
            {selected.size} tarea{selected.size !== 1 && 's'} seleccionada{selected.size !== 1 && 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBatchAction('en_proceso')}
              disabled={batchLoading}
              className="text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Iniciar todas
            </button>
            <button
              onClick={() => handleBatchAction('completada')}
              disabled={batchLoading}
              className="text-xs font-medium px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Completar todas
            </button>
          </div>
        </div>
      )}

      {data.overdue.length > 0 && (
        <Section title="Vencidas" count={data.overdue.length} variant="danger">
          {data.overdue.map(task => (
            <TaskRow key={task.id} task={task} isOverdue batchMode={batchMode} selected={selected.has(task.id)}
              onToggle={() => toggleSelect(task.id)} onStatusChange={handleStatusChange} />
          ))}
        </Section>
      )}

      {data.dueToday.length > 0 && (
        <Section title="Vence hoy" count={data.dueToday.length} variant="warning">
          {data.dueToday.map(task => (
            <TaskRow key={task.id} task={task} batchMode={batchMode} selected={selected.has(task.id)}
              onToggle={() => toggleSelect(task.id)} onStatusChange={handleStatusChange} />
          ))}
        </Section>
      )}

      {data.dueThisWeek.length > 0 && (
        <Section title="Esta semana" count={data.dueThisWeek.length}>
          {data.dueThisWeek.map(task => (
            <TaskRow key={task.id} task={task} batchMode={batchMode} selected={selected.has(task.id)}
              onToggle={() => toggleSelect(task.id)} onStatusChange={handleStatusChange} />
          ))}
        </Section>
      )}

      {data.upcoming.length > 0 && (
        <Section title="Próximas" count={data.upcoming.length}>
          {data.upcoming.map(task => (
            <TaskRow key={task.id} task={task} batchMode={batchMode} selected={selected.has(task.id)}
              onToggle={() => toggleSelect(task.id)} onStatusChange={handleStatusChange} />
          ))}
        </Section>
      )}

      {data.blocked.length > 0 && (
        <Section title="Bloqueadas" count={data.blocked.length} variant="blocked">
          {data.blocked.map(task => (
            <TaskRow key={task.id} task={task} batchMode={batchMode} selected={selected.has(task.id)}
              onToggle={() => toggleSelect(task.id)} onStatusChange={handleStatusChange} />
          ))}
        </Section>
      )}

      {data.noDueDate.length > 0 && (
        <Section title="Sin fecha" count={data.noDueDate.length}>
          {data.noDueDate.map(task => (
            <TaskRow key={task.id} task={task} batchMode={batchMode} selected={selected.has(task.id)}
              onToggle={() => toggleSelect(task.id)} onStatusChange={handleStatusChange} />
          ))}
        </Section>
      )}

      {data.total === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No tienes tareas pendientes</p>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, isOverdue, batchMode, selected, onToggle, onStatusChange,
}: {
  task: TaskItem; isOverdue?: boolean; batchMode: boolean; selected: boolean;
  onToggle: () => void; onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      {batchMode && (
        <button onClick={onToggle} className="mt-3 shrink-0 text-gray-400 hover:text-blue-600">
          {selected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
        </button>
      )}
      <div className="flex-1">
        <TaskCard task={task} isOverdue={isOverdue} onStatusChange={onStatusChange} />
      </div>
    </div>
  );
}

function Section({
  title, count, variant, children,
}: {
  title: string; count: number; variant?: 'danger' | 'warning' | 'blocked'; children: React.ReactNode;
}) {
  const headerColor = variant === 'danger' ? 'text-red-700'
    : variant === 'warning' ? 'text-amber-700'
    : variant === 'blocked' ? 'text-amber-600'
    : 'text-gray-700';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className={`text-sm font-semibold ${headerColor}`}>{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
