'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { formatDateRD } from '@/lib/date-utils';
import {
  Users, ChevronDown, ChevronRight, AlertTriangle,
  Calendar, Building2, Lock,
} from 'lucide-react';

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
  responsibleId: string;
  responsibleName: string;
  responsibleEmail: string;
};

type MemberGroup = {
  personId: string;
  personName: string;
  personEmail: string;
  total: number;
  overdue: number;
  tasks: TaskItem[];
};

type TeamData = {
  members: MemberGroup[];
  totalTasks: number;
  totalOverdue: number;
  totalMembers: number;
};

const STATUS_LABELS: Record<string, string> = {
  no_iniciada: 'No iniciada',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
};

const STATUS_COLORS: Record<string, string> = {
  no_iniciada: 'bg-gray-100 text-gray-600',
  en_proceso: 'bg-blue-100 text-blue-700',
  en_revision: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700',
  bloqueada: 'bg-amber-100 text-amber-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-gray-100 text-gray-700',
  baja: 'bg-gray-50 text-gray-500',
};

export default function MiEquipoPage() {
  const { user } = useSession();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/my-team');
      if (res.ok) {
        const result: TeamData = await res.json();
        setData(result);
        if (expanded.size === 0) {
          setExpanded(new Set(result.members.map(m => m.personId)));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleExpand(personId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  async function handleStatusChange(taskId: string, status: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchData();
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
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Mi equipo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tareas donde eres revisor — seguimiento a tu equipo
        </p>
      </div>

      {data.totalMembers > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Personas</p>
            <p className="text-2xl font-semibold text-gray-900">{data.totalMembers}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Tareas pendientes</p>
            <p className="text-2xl font-semibold text-gray-900">{data.totalTasks}</p>
          </div>
          <div className={`bg-white border rounded-lg p-4 ${data.totalOverdue > 0 ? 'border-red-300' : 'border-gray-200'}`}>
            <p className="text-sm text-gray-500">Vencidas</p>
            <p className={`text-2xl font-semibold ${data.totalOverdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {data.totalOverdue}
            </p>
          </div>
        </div>
      )}

      {data.members.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <Users size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No tienes tareas como revisor</p>
          <p className="text-xs text-gray-400 mt-1">
            Las tareas donde seas asignado como revisor aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.members.map(member => (
            <div key={member.personId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleExpand(member.personId)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                    {member.personName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium text-gray-900">{member.personName}</h3>
                    <p className="text-xs text-gray-500">{member.personEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {member.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                      <AlertTriangle size={12} />
                      {member.overdue} vencida{member.overdue !== 1 && 's'}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full font-medium">
                    {member.total} tarea{member.total !== 1 && 's'}
                  </span>
                  {expanded.has(member.personId) ? (
                    <ChevronDown size={18} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={18} className="text-gray-400" />
                  )}
                </div>
              </button>

              {expanded.has(member.personId) && (
                <div className="border-t border-gray-100 px-4 pb-3">
                  <div className="divide-y divide-gray-100">
                    {member.tasks.map(task => {
                      const isOverdue = !!(task.dueDateOriginal && task.dueDateOriginal < new Date().toISOString().slice(0, 10));
                      const nextStatus = task.status === 'en_revision' ? 'completada' : null;

                      return (
                        <div
                          key={task.id}
                          className={`py-3 ${isOverdue ? 'bg-red-50/40' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <a
                                href={`/tareas/${task.id}`}
                                className="text-sm font-medium text-gray-900 hover:text-blue-600"
                              >
                                {task.title}
                              </a>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[task.status]}`}>
                                  {STATUS_LABELS[task.status]}
                                </span>
                                <span className="text-xs text-gray-500 truncate">
                                  {task.spaceName}
                                </span>
                                {task.companyName && (
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                    <Building2 size={12} />
                                    {task.companyName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {task.dueDate && (
                                  <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                    <Calendar size={12} />
                                    {formatDateRD(task.dueDate)}
                                    {isOverdue && <AlertTriangle size={12} />}
                                  </span>
                                )}
                                {task.status === 'bloqueada' && (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                    <Lock size={12} />
                                    {task.blockedByArea || 'Bloqueada'}
                                  </span>
                                )}
                                {task.priority !== 'normal' && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${PRIORITY_COLORS[task.priority]}`}>
                                    {task.priority}
                                  </span>
                                )}
                              </div>
                            </div>

                            {nextStatus && (
                              <button
                                onClick={() => handleStatusChange(task.id, nextStatus)}
                                className="shrink-0 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                                title="Aprobar tarea"
                              >
                                Aprobar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
