'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { TaskCard } from '@/components/tasks/task-card';

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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Mi trabajo</h1>
        <p className="text-sm text-gray-500 mt-1">
          {data.total} {data.total === 1 ? 'tarea pendiente' : 'tareas pendientes'}
        </p>
      </div>

      {data.overdue.length > 0 && (
        <Section
          title="Vencidas"
          count={data.overdue.length}
          variant="danger"
        >
          {data.overdue.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isOverdue
              onStatusChange={handleStatusChange}
            />
          ))}
        </Section>
      )}

      {data.dueToday.length > 0 && (
        <Section title="Vence hoy" count={data.dueToday.length} variant="warning">
          {data.dueToday.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
            />
          ))}
        </Section>
      )}

      {data.dueThisWeek.length > 0 && (
        <Section title="Esta semana" count={data.dueThisWeek.length}>
          {data.dueThisWeek.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
            />
          ))}
        </Section>
      )}

      {data.upcoming.length > 0 && (
        <Section title="Próximas" count={data.upcoming.length}>
          {data.upcoming.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
            />
          ))}
        </Section>
      )}

      {data.blocked.length > 0 && (
        <Section title="Bloqueadas" count={data.blocked.length} variant="blocked">
          {data.blocked.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
            />
          ))}
        </Section>
      )}

      {data.noDueDate.length > 0 && (
        <Section title="Sin fecha" count={data.noDueDate.length}>
          {data.noDueDate.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={handleStatusChange}
            />
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

function Section({
  title,
  count,
  variant,
  children,
}: {
  title: string;
  count: number;
  variant?: 'danger' | 'warning' | 'blocked';
  children: React.ReactNode;
}) {
  const headerColor = variant === 'danger'
    ? 'text-red-700'
    : variant === 'warning'
      ? 'text-amber-700'
      : variant === 'blocked'
        ? 'text-amber-600'
        : 'text-gray-700';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className={`text-sm font-semibold ${headerColor}`}>
          {title}
        </h2>
        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
          {count}
        </span>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}
