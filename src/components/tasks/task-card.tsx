'use client';

import { formatDateRD } from '@/lib/date-utils';
import { Building2, Calendar, AlertTriangle, Lock } from 'lucide-react';

type TaskCardProps = {
  task: {
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
  isOverdue?: boolean;
  onStatusChange?: (taskId: string, status: string) => void;
};

const STATUS_LABELS: Record<string, string> = {
  no_iniciada: 'No iniciada',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
};

const PRIORITY_COLORS: Record<string, string> = {
  critica: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-gray-100 text-gray-700',
  baja: 'bg-gray-50 text-gray-500',
};

const SPACE_TYPE_COLORS: Record<string, string> = {
  recurrente: 'bg-blue-50 text-blue-600',
  proyecto: 'bg-purple-50 text-purple-600',
  continuo: 'bg-green-50 text-green-600',
};

const SPACE_TYPE_LABELS: Record<string, string> = {
  recurrente: 'Cierre',
  proyecto: 'Proyecto',
  continuo: 'Operativo',
};

export function TaskCard({ task, isOverdue, onStatusChange }: TaskCardProps) {
  const nextStatus = task.status === 'no_iniciada'
    ? 'en_proceso'
    : task.status === 'en_proceso'
      ? task.requiresApproval ? 'en_revision' : 'completada'
      : task.status === 'en_revision'
        ? 'completada'
        : null;

  return (
    <div className={`bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${
      isOverdue ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <a
            href={`/tareas/${task.id}`}
            className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2"
          >
            {task.title}
          </a>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
              SPACE_TYPE_COLORS[task.spaceType]
            }`}>
              {SPACE_TYPE_LABELS[task.spaceType] || task.spaceType}
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

          <div className="flex items-center gap-2 mt-1.5">
            {task.dueDate && (
              <span className={`inline-flex items-center gap-1 text-xs ${
                isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'
              }`}>
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
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                PRIORITY_COLORS[task.priority]
              }`}>
                {task.priority}
              </span>
            )}
          </div>
        </div>

        {nextStatus && onStatusChange && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onStatusChange(task.id, nextStatus);
            }}
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors"
            title={`Marcar ${STATUS_LABELS[nextStatus]?.toLowerCase()}`}
          >
            {nextStatus === 'completada' ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4,10 8,14 16,6" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,10 14,10" />
                <polyline points="10,6 10,14" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
