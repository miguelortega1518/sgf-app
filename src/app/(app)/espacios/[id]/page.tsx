'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';
import { formatDateRD } from '@/lib/date-utils';
import {
  Plus, Users, Calendar, Target, Building2, ChevronDown,
  ChevronRight, Play, XCircle, CheckCircle2, Pencil, Heart,
} from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

type TaskItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  dueDateOriginal: string | null;
  priority: string;
  companyId: string | null;
  companyName: string | null;
  responsibleId: string;
  responsibleName: string;
  blockedByArea: string | null;
  requiresApproval: boolean;
  requiresEvidence: boolean;
  completedAt: string | null;
  templateId: string | null;
};

type SpaceData = {
  space: {
    id: string;
    name: string;
    type: string;
    status: string;
    objective: string | null;
    targetDate: string | null;
    period: string | null;
    anchorDate: string | null;
    ownerName: string;
    spaceTemplateId: string | null;
  };
  members: { personId: string; spaceRole: string; name: string }[];
  tasks: TaskItem[];
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
  bloqueada: 'bg-red-100 text-red-700',
};

const SPACE_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  borrador: { label: 'Borrador', className: 'bg-gray-100 text-gray-700' },
  activo: { label: 'Activo', className: 'bg-green-100 text-green-700' },
  cerrado: { label: 'Cerrado', className: 'bg-blue-100 text-blue-700' },
};

export default function SpaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const router = useRouter();
  const [data, setData] = useState<SpaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [showNewTask, setShowNewTask] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [editingSpace, setEditingSpace] = useState(false);
  const [editName, setEditName] = useState('');
  const [editObjective, setEditObjective] = useState('');
  const [editTargetDate, setEditTargetDate] = useState('');

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/spaces/${id}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
    fetch('/api/users').then(r => r.ok ? r.json() : []).then(setPeople);
    fetch('/api/companies').then(r => r.ok ? r.json() : []).then(setCompanies);
  }, [fetchData]);

  async function handleStatusChange(taskId: string, status: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchData();
  }

  async function handleSpaceAction(action: 'activar' | 'cerrar') {
    setActionError(null);
    const newStatus = action === 'activar' ? 'activo' : 'cerrado';
    const res = await fetch(`/api/spaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) { fetchData(); toast(action === 'activar' ? 'Espacio activado' : 'Espacio cerrado'); }
    else {
      const body = await res.json();
      setActionError(body.error || 'Error al cambiar el estado');
    }
  }

  function startEditingSpace() {
    if (!data) return;
    setEditName(data.space.name);
    setEditObjective(data.space.objective || '');
    setEditTargetDate(data.space.targetDate || '');
    setEditingSpace(true);
  }

  async function saveSpaceEdit() {
    const res = await fetch(`/api/spaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        objective: editObjective || null,
        targetDate: editTargetDate || null,
      }),
    });
    if (res.ok) { setEditingSpace(false); fetchData(); toast('Espacio actualizado'); }
  }

  if (loading || !data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const { space, members, tasks: spaceTasks } = data;
  const isRecurrente = space.type === 'recurrente';
  const isAdmin = user?.role === 'admin';
  const canAddTask = user?.role !== 'observador';

  return (
    <div className="p-6 max-w-6xl">
      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}
      <SpaceHeader
        space={space}
        members={members}
        tasks={spaceTasks}
        isAdmin={isAdmin ?? false}
        canEdit={user?.role !== 'observador' && space.status !== 'cerrado'}
        editing={editingSpace}
        editName={editName}
        editObjective={editObjective}
        editTargetDate={editTargetDate}
        onEditName={setEditName}
        onEditObjective={setEditObjective}
        onEditTargetDate={setEditTargetDate}
        onStartEdit={startEditingSpace}
        onSaveEdit={saveSpaceEdit}
        onCancelEdit={() => setEditingSpace(false)}
        onActivate={() => handleSpaceAction('activar')}
        onClose={() => handleSpaceAction('cerrar')}
      />

      <HealthUpdatesSection spaceId={space.id} canPost={user?.role !== 'observador' && space.status === 'activo'} />

      <div className="flex items-center justify-between mb-4 mt-6">
        <h2 className="text-lg font-medium text-gray-900">
          Tareas ({spaceTasks.filter(t => t.status !== 'completada').length} pendientes)
        </h2>
        {canAddTask && space.status !== 'cerrado' && (
          <button
            onClick={() => setShowNewTask(!showNewTask)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Nueva tarea
          </button>
        )}
      </div>

      {showNewTask && (
        <NewTaskForm
          spaceId={space.id}
          people={people}
          companies={companies}
          onCreated={() => { setShowNewTask(false); fetchData(); }}
          onCancel={() => setShowNewTask(false)}
        />
      )}

      {isRecurrente ? (
        <GroupedByCompanyView
          tasks={spaceTasks}
          onStatusChange={handleStatusChange}
          spaceClosed={space.status === 'cerrado'}
        />
      ) : (
        <FlatTaskList
          tasks={spaceTasks}
          spaceName={space.name}
          spaceType={space.type}
          onStatusChange={handleStatusChange}
          spaceClosed={space.status === 'cerrado'}
        />
      )}
    </div>
  );
}

function SpaceHeader({
  space, members, tasks, isAdmin, canEdit,
  editing, editName, editObjective, editTargetDate,
  onEditName, onEditObjective, onEditTargetDate,
  onStartEdit, onSaveEdit, onCancelEdit,
  onActivate, onClose,
}: {
  space: SpaceData['space'];
  members: SpaceData['members'];
  tasks: TaskItem[];
  isAdmin: boolean;
  canEdit?: boolean;
  editing: boolean;
  editName: string;
  editObjective: string;
  editTargetDate: string;
  onEditName: (v: string) => void;
  onEditObjective: (v: string) => void;
  onEditTargetDate: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onActivate: () => void;
  onClose: () => void;
}) {
  const completed = tasks.filter(t => t.status === 'completada').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const badge = SPACE_STATUS_BADGES[space.status];
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter(t =>
    t.dueDate && t.dueDate < today && t.status !== 'completada'
  ).length;
  const blocked = tasks.filter(t => t.status === 'bloqueada').length;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <span className="capitalize">{space.type}</span>
        {space.period && <span>· {space.period}</span>}
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {editing ? (
        <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4 mt-2">
          <input value={editName} onChange={e => onEditName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <textarea value={editObjective} onChange={e => onEditObjective(e.target.value)} placeholder="Objetivo (opcional)" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fecha meta</label>
            <input type="date" value={editTargetDate} onChange={e => onEditTargetDate(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveEdit} disabled={!editName.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">Guardar</button>
            <button onClick={onCancelEdit} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">{space.name}</h1>
              {canEdit && (
                <button onClick={onStartEdit} className="text-gray-400 hover:text-blue-600 p-1" title="Editar espacio">
                  <Pencil size={16} />
                </button>
              )}
            </div>
            {space.objective && <p className="text-sm text-gray-600 mt-1">{space.objective}</p>}
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Users size={14} />{members.length} miembros</span>
              {space.targetDate && <span className="flex items-center gap-1"><Target size={14} />Meta: {formatDateRD(space.targetDate)}</span>}
              <span className="flex items-center gap-1"><Calendar size={14} />{completed}/{total} tareas</span>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              {space.status === 'borrador' && (
                <button onClick={onActivate} className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"><Play size={14} />Activar</button>
              )}
              {space.status === 'activo' && (
                <button onClick={onClose} className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 font-medium"><XCircle size={14} />Cerrar ciclo</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progreso general</span>
          <span className="text-sm font-semibold text-gray-900">{pct}%</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pct === 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span>{completed} completadas</span>
          {overdue > 0 && <span className="text-red-600 font-medium">{overdue} vencidas</span>}
          {blocked > 0 && <span className="text-amber-600 font-medium">{blocked} bloqueadas</span>}
        </div>
      </div>
    </div>
  );
}

function GroupedByCompanyView({
  tasks, onStatusChange, spaceClosed,
}: {
  tasks: TaskItem[];
  onStatusChange: (taskId: string, status: string) => void;
  spaceClosed: boolean;
}) {
  const groups = new Map<string, { companyName: string; tasks: TaskItem[] }>();

  for (const task of tasks) {
    const key = task.companyId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, { companyName: task.companyName || 'Sin empresa', tasks: [] });
    }
    groups.get(key)!.tasks.push(task);
  }

  const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
    a[1].companyName.localeCompare(b[1].companyName)
  );

  return (
    <div className="space-y-4">
      {sortedGroups.map(([key, group]) => (
        <CompanyGroup
          key={key}
          companyName={group.companyName}
          tasks={group.tasks}
          onStatusChange={onStatusChange}
          spaceClosed={spaceClosed}
        />
      ))}
    </div>
  );
}

function CompanyGroup({
  companyName, tasks, onStatusChange, spaceClosed,
}: {
  companyName: string;
  tasks: TaskItem[];
  onStatusChange: (taskId: string, status: string) => void;
  spaceClosed: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const completed = tasks.filter(t => t.status === 'completada').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <Building2 size={16} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">{companyName}</span>
          <span className="text-xs text-gray-400">{completed}/{total}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500 w-8 text-right">{pct}%</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase bg-gray-50/50">
                <th className="px-4 py-2 w-8"></th>
                <th className="px-4 py-2">Tarea</th>
                <th className="px-4 py-2">Responsable</th>
                <th className="px-4 py-2 text-center">Estado</th>
                <th className="px-4 py-2 text-center">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => {
                const isOverdue = !!(task.dueDate && task.dueDate < today && task.status !== 'completada');
                const nextStatus = getNextStatus(task);

                return (
                  <tr
                    key={task.id}
                    className={`border-t border-gray-50 hover:bg-gray-50 ${
                      isOverdue ? 'bg-red-50/30' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {nextStatus && !spaceClosed ? (
                        <button
                          onClick={() => onStatusChange(task.id, nextStatus)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            task.status === 'completada'
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 hover:border-blue-500'
                          }`}
                          title={`Marcar ${STATUS_LABELS[nextStatus]?.toLowerCase()}`}
                        >
                          {task.status === 'completada' && (
                            <CheckCircle2 size={12} />
                          )}
                        </button>
                      ) : (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          task.status === 'completada'
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-200'
                        }`}>
                          {task.status === 'completada' && <CheckCircle2 size={12} />}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/tareas/${task.id}`}
                        className={`font-medium hover:text-blue-600 ${
                          task.status === 'completada'
                            ? 'text-gray-400 line-through'
                            : 'text-gray-900'
                        }`}
                      >
                        {task.title}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {task.responsibleName}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                        STATUS_COLORS[task.status]
                      }`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {task.dueDate ? (
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {formatDateRD(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FlatTaskList({
  tasks, spaceName, spaceType, onStatusChange, spaceClosed,
}: {
  tasks: TaskItem[];
  spaceName: string;
  spaceType: string;
  onStatusChange: (taskId: string, status: string) => void;
  spaceClosed: boolean;
}) {
  const activeTasks = tasks.filter(t => t.status !== 'completada');
  const completedTasks = tasks.filter(t => t.status === 'completada');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="space-y-2 mb-8">
        {activeTasks.map(task => {
          const isOverdue = !!(task.dueDate && task.dueDate < today && task.status !== 'completada');
          const nextStatus = getNextStatus(task);

          return (
            <div key={task.id} className={`bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${
              isOverdue ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <a href={`/tareas/${task.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                    {task.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span>{task.responsibleName}</span>
                    {task.companyName && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1"><Building2 size={11} />{task.companyName}</span>
                      </>
                    )}
                    {task.dueDate && (
                      <>
                        <span>·</span>
                        <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                          {formatDateRD(task.dueDate)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {nextStatus && !spaceClosed && (
                  <button
                    onClick={() => onStatusChange(task.id, nextStatus)}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border-2 border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                    title={`Marcar ${STATUS_LABELS[nextStatus]?.toLowerCase()}`}
                  >
                    {nextStatus === 'completada' ? (
                      <CheckCircle2 size={16} className="text-gray-400" />
                    ) : (
                      <Play size={14} className="text-gray-400" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {activeTasks.length === 0 && (
          <p className="text-sm text-gray-500 py-4 text-center">No hay tareas pendientes</p>
        )}
      </div>

      {completedTasks.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-700">
            Completadas ({completedTasks.length})
          </summary>
          <div className="space-y-2 mt-2">
            {completedTasks.map(task => (
              <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-3 opacity-60">
                <a href={`/tareas/${task.id}`} className="text-sm text-gray-500 line-through">
                  {task.title}
                </a>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function getNextStatus(task: TaskItem): string | null {
  if (task.status === 'no_iniciada') return 'en_proceso';
  if (task.status === 'en_proceso') return task.requiresApproval ? 'en_revision' : 'completada';
  if (task.status === 'en_revision') return 'completada';
  return null;
}

function NewTaskForm({
  spaceId, people, companies, onCreated, onCancel,
}: {
  spaceId: string;
  people: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spaceId,
        title,
        responsibleId,
        companyId: companyId || undefined,
        dueDate: dueDate || undefined,
      }),
    });
    if (res.ok) onCreated();
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
      <input
        type="text"
        placeholder="Título de la tarea"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
        autoFocus
      />
      <div className="flex gap-3">
        <select
          value={responsibleId}
          onChange={e => setResponsibleId(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          required
        >
          <option value="">Responsable</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={companyId}
          onChange={e => setCompanyId(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">Empresa (opcional)</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
          Crear
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
          Cancelar
        </button>
      </div>
    </form>
  );
}

const HEALTH_CONFIG = {
  verde: { label: 'Verde', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  amarillo: { label: 'Amarillo', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  rojo: { label: 'Rojo', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

type HealthUpdate = {
  id: string;
  health: string;
  content: string;
  createdAt: string;
  authorName: string;
};

function HealthUpdatesSection({ spaceId, canPost }: { spaceId: string; canPost: boolean }) {
  const [updates, setUpdates] = useState<HealthUpdate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [health, setHealth] = useState<'verde' | 'amarillo' | 'rojo'>('verde');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/spaces/${spaceId}/updates`)
      .then(r => r.ok ? r.json() : [])
      .then(setUpdates)
      .catch(() => {});
  }, [spaceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/spaces/${spaceId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ health, content: content.trim() }),
    });
    if (res.ok) {
      const updated = await fetch(`/api/spaces/${spaceId}/updates`).then(r => r.json());
      setUpdates(updated);
      setContent('');
      setShowForm(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="mt-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <Heart size={14} />
          Actualizaciones de salud
        </h3>
        {canPost && (
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
            <Plus size={12} />Publicar
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 border rounded-lg p-3 mb-3 space-y-2">
          <div className="flex gap-2">
            {(['verde', 'amarillo', 'rojo'] as const).map(h => {
              const cfg = HEALTH_CONFIG[h];
              return (
                <button key={h} type="button" onClick={() => setHealth(h)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    health === h ? cfg.color + ' border-current' : 'border-gray-200 text-gray-500'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Describe el estado actual..." rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting || !content.trim()} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50">Publicar</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-gray-600">Cancelar</button>
          </div>
        </form>
      )}

      {updates.length > 0 ? (
        <div className="space-y-2">
          {updates.slice(0, 5).map(u => {
            const cfg = HEALTH_CONFIG[u.health as keyof typeof HEALTH_CONFIG] || HEALTH_CONFIG.verde;
            return (
              <div key={u.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-xs font-medium text-gray-700">{u.authorName}</span>
                  <span className="text-xs text-gray-400">{formatDateRD(u.createdAt.slice(0, 10))}</span>
                </div>
                <p className="text-sm text-gray-600">{u.content}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Sin actualizaciones</p>
      )}
    </div>
  );
}
