'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';
import { formatDateRD, toTimestampRD } from '@/lib/date-utils';
import {
  Calendar, User, Building2, Clock, FileText,
  Link as LinkIcon, Image, Paperclip, Trash2, Plus,
  MessageSquare, Send, ShieldAlert, X, AlertTriangle,
  Pencil, Check, Square, CheckSquare,
} from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

type TaskDetail = {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    dueDate: string | null;
    dueDateOriginal: string | null;
    priority: string;
    responsibleName: string;
    responsibleId: string;
    reviewerId: string | null;
    spaceId: string;
    companyId: string | null;
    blockedByArea: string | null;
    blockedSince: string | null;
    doneDefinition: string | null;
    instructions: string | null;
    requiresApproval: boolean;
    requiresEvidence: boolean;
    overdue: boolean;
    completedAt: string | null;
    createdAt: string;
  };
  subtasks: { id: string; title: string; completed: boolean }[];
  evidence: { id: string; urlOrFile: string; type: string; uploadedBy: string }[];
  comments: { id: string; content: string; authorName: string; createdAt: string }[];
  audit: { id: string; action: string; actorName: string; previousValue: string | null; newValue: string | null; reason: string | null; timestamp: string }[];
};

const STATUS_LABELS: Record<string, string> = {
  no_iniciada: 'No iniciada',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
};

const STATUS_COLORS: Record<string, string> = {
  no_iniciada: 'bg-gray-100 text-gray-700',
  en_proceso: 'bg-blue-100 text-blue-700',
  en_revision: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700',
  bloqueada: 'bg-red-100 text-red-700',
};

const ACTION_LABELS: Record<string, string> = {
  task_created: 'Tarea creada',
  status_changed: 'Cambio de estado',
  responsible_changed: 'Responsable cambiado',
  due_date_changed: 'Fecha límite cambiada',
  task_approved: 'Tarea aprobada',
  task_approved_admin_override: 'Aprobada por admin (anulación)',
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const [data, setData] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    fetch(`/api/tasks/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { toast } = useToast();
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showDelayDialog, setShowDelayDialog] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  async function handleStatusChange(status: string, extra?: Record<string, unknown>) {
    setStatusError(null);
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    });
    if (res.ok) { fetchData(); toast('Estado actualizado'); }
    else {
      const body = await res.json();
      setStatusError(body.error || 'Error al cambiar el estado');
    }
  }

  function startEditing() {
    if (!data) return;
    setEditTitle(data.task.title);
    setEditDescription(data.task.description || '');
    setEditDueDate(data.task.dueDate || '');
    setEditPriority(data.task.priority);
    setEditing(true);
  }

  async function saveEdit() {
    setEditSaving(true);
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription || null,
        dueDate: editDueDate || null,
        priority: editPriority,
      }),
    });
    if (res.ok) { setEditing(false); fetchData(); toast('Tarea actualizada'); }
    setEditSaving(false);
  }

  function handleCompleteClick() {
    if (data?.task.overdue) {
      setShowDelayDialog(true);
    } else {
      handleStatusChange('completada');
    }
  }

  if (loading || !data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const { task, subtasks, evidence: taskEvidence, comments, audit } = data;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        {editing ? (
          <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha límite</label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prioridad</label>
                <select
                  value={editPriority}
                  onChange={e => setEditPriority(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                >
                  <option value="critica">Crítica</option>
                  <option value="alta">Alta</option>
                  <option value="normal">Normal</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={editSaving || !editTitle.trim()} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
                Guardar
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <h1 className="text-xl font-semibold text-gray-900">{task.title}</h1>
              {user?.role !== 'observador' && task.status !== 'completada' && (
                <button onClick={startEditing} className="text-gray-400 hover:text-blue-600 p-1" title="Editar tarea">
                  <Pencil size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                {STATUS_LABELS[task.status]}
              </span>
              {task.overdue && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Vencida</span>
              )}
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <User size={14} />{task.responsibleName}
              </span>
              {task.dueDate && (
                <span className={`flex items-center gap-1 text-sm ${task.overdue ? 'text-red-600' : 'text-gray-600'}`}>
                  <Calendar size={14} />{formatDateRD(task.dueDate)}
                  {task.dueDateOriginal && task.dueDate !== task.dueDateOriginal && (
                    <span className="text-xs text-gray-400 line-through ml-1">{formatDateRD(task.dueDateOriginal)}</span>
                  )}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {task.doneDefinition && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-amber-800 mb-1 flex items-center gap-1">
            <FileText size={14} />
            Definición de terminado
          </h3>
          <p className="text-sm text-amber-700">{task.doneDefinition}</p>
        </div>
      )}

      {task.description && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Descripción</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {task.instructions && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Instructivo</h3>
          <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border">
            {task.instructions}
          </div>
        </div>
      )}

      {statusError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between">
          <span>{statusError}</span>
          <button onClick={() => setStatusError(null)} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {user?.role !== 'observador' && task.status !== 'completada' && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {task.status === 'no_iniciada' && (
            <button onClick={() => handleStatusChange('en_proceso')}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
              Iniciar
            </button>
          )}
          {task.status === 'en_proceso' && !task.requiresApproval && (
            <button onClick={handleCompleteClick}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700">
              Completar
            </button>
          )}
          {task.status === 'en_proceso' && task.requiresApproval && (
            <button onClick={() => handleStatusChange('en_revision')}
              className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700">
              Enviar a revisión
            </button>
          )}
          {task.status === 'en_revision' && (
            <button onClick={handleCompleteClick}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700">
              Aprobar
            </button>
          )}
          {task.status !== 'bloqueada' && task.status !== 'no_iniciada' && (
            <button onClick={() => setShowBlockDialog(true)}
              className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded-md hover:bg-red-200">
              <ShieldAlert size={14} className="inline mr-1" />
              Bloquear
            </button>
          )}
          {task.status === 'bloqueada' && (
            <button onClick={() => handleStatusChange('en_proceso')}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
              Desbloquear
            </button>
          )}
        </div>
      )}

      {task.status === 'bloqueada' && task.blockedByArea && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <span className="text-red-700 font-medium">Bloqueada por: </span>
          <span className="text-red-600 capitalize">{task.blockedByArea}</span>
          {task.blockedSince && (
            <span className="text-red-400 ml-2">desde {formatDateRD(task.blockedSince)}</span>
          )}
        </div>
      )}

      {showBlockDialog && (
        <BlockDialog
          onConfirm={(area, areaText) => {
            handleStatusChange('bloqueada', { blockedByArea: area, blockedByAreaText: areaText });
            setShowBlockDialog(false);
          }}
          onCancel={() => setShowBlockDialog(false)}
        />
      )}

      {showDelayDialog && (
        <DelayReasonDialog
          onConfirm={(reason, reasonText) => {
            handleStatusChange('completada', { delayReason: reason, delayReasonText: reasonText });
            setShowDelayDialog(false);
          }}
          onCancel={() => setShowDelayDialog(false)}
        />
      )}

      <SubtasksSection
        taskId={task.id}
        subtasks={subtasks}
        canEdit={user?.role !== 'observador' && task.status !== 'completada'}
        onChanged={fetchData}
      />

      <EvidenceSection
        taskId={task.id}
        evidence={taskEvidence}
        canEdit={user?.role !== 'observador' && task.status !== 'completada'}
        isAdmin={user?.role === 'admin'}
        userId={user?.id}
        onChanged={fetchData}
      />

      <CommentsSection
        taskId={task.id}
        comments={comments}
        canComment={user?.role !== 'observador'}
        onChanged={fetchData}
      />

      {audit.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Bitácora</h3>
          <div className="space-y-2">
            {audit.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                <div>
                  <span className="text-gray-700 font-medium">{entry.actorName}</span>
                  <span className="text-gray-500 ml-1">
                    {ACTION_LABELS[entry.action] || entry.action}
                  </span>
                  {entry.previousValue && entry.newValue && (
                    <span className="text-gray-400 ml-1">
                      ({entry.previousValue} → {entry.newValue})
                    </span>
                  )}
                  <span className="text-gray-400 text-xs ml-2">
                    {toTimestampRD(new Date(entry.timestamp))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubtasksSection({
  taskId, subtasks: items, canEdit, onChanged,
}: {
  taskId: string;
  subtasks: TaskDetail['subtasks'];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) { setNewTitle(''); onChanged(); }
    setAdding(false);
  }

  async function toggleComplete(subtaskId: string, completed: boolean) {
    await fetch(`/api/tasks/${taskId}/subtasks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtaskId, completed: !completed }),
    });
    onChanged();
  }

  async function handleDelete(subtaskId: string) {
    await fetch(`/api/tasks/${taskId}/subtasks?subtaskId=${subtaskId}`, { method: 'DELETE' });
    onChanged();
  }

  const completedCount = items.filter(s => s.completed).length;

  return (
    <div className="mt-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <CheckSquare size={14} />
          Subtareas ({completedCount}/{items.length})
        </h3>
      </div>

      {items.length > 0 && (
        <div className="space-y-1 mb-3">
          {items.map(sub => (
            <div key={sub.id} className="flex items-center gap-2 group">
              <button
                onClick={() => canEdit && toggleComplete(sub.id, sub.completed)}
                className={`shrink-0 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                disabled={!canEdit}
              >
                {sub.completed
                  ? <CheckSquare size={16} className="text-green-500" />
                  : <Square size={16} className="text-gray-300" />}
              </button>
              <span className={`flex-1 text-sm ${sub.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                {sub.title}
              </span>
              {canEdit && (
                <button
                  onClick={() => handleDelete(sub.id)}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Agregar subtarea..."
            className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={adding || !newTitle.trim()}
            className="px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={14} />
          </button>
        </form>
      )}

      {items.length === 0 && !canEdit && (
        <p className="text-xs text-gray-400">Sin subtareas</p>
      )}
    </div>
  );
}

const EVIDENCE_TYPE_LABELS: Record<string, { label: string; icon: typeof LinkIcon }> = {
  enlace: { label: 'Enlace', icon: LinkIcon },
  archivo: { label: 'Archivo', icon: Paperclip },
  captura: { label: 'Captura', icon: Image },
};

function EvidenceSection({
  taskId, evidence: items, canEdit, isAdmin, userId, onChanged,
}: {
  taskId: string;
  evidence: TaskDetail['evidence'];
  canEdit: boolean;
  isAdmin: boolean;
  userId?: string;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'enlace' | 'archivo' | 'captura'>('enlace');
  const [urlOrFile, setUrlOrFile] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/tasks/${taskId}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlOrFile, type }),
    });
    if (res.ok) {
      setUrlOrFile('');
      setShowForm(false);
      onChanged();
    }
    setSubmitting(false);
  }

  async function handleDelete(evidenceId: string) {
    const res = await fetch(`/api/tasks/${taskId}/evidence?evidenceId=${evidenceId}`, {
      method: 'DELETE',
    });
    if (res.ok) onChanged();
  }

  return (
    <div className="mt-6 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          Evidencias ({items.length})
        </h3>
        {canEdit && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <Plus size={12} />
            Agregar
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-50 border rounded-lg p-3 mb-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={type}
              onChange={e => setType(e.target.value as 'enlace' | 'archivo' | 'captura')}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm"
            >
              <option value="enlace">Enlace</option>
              <option value="archivo">Archivo</option>
              <option value="captura">Captura</option>
            </select>
            <input
              type="text"
              value={urlOrFile}
              onChange={e => setUrlOrFile(e.target.value)}
              placeholder={type === 'enlace' ? 'https://...' : 'Nombre del archivo'}
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map(ev => {
            const meta = EVIDENCE_TYPE_LABELS[ev.type] || EVIDENCE_TYPE_LABELS.enlace;
            const Icon = meta.icon;
            return (
              <div
                key={ev.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={14} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-400">{meta.label}</span>
                  {ev.type === 'enlace' ? (
                    <a
                      href={ev.urlOrFile}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate"
                    >
                      {ev.urlOrFile}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-700 truncate">{ev.urlOrFile}</span>
                  )}
                </div>
                {(isAdmin || ev.uploadedBy === userId) && canEdit && (
                  <button
                    onClick={() => handleDelete(ev.id)}
                    className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Sin evidencias</p>
      )}
    </div>
  );
}

function CommentsSection({
  taskId, comments: items, canComment, onChanged,
}: {
  taskId: string;
  comments: TaskDetail['comments'];
  canComment: boolean;
  onChanged: () => void;
}) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim() }),
    });
    if (res.ok) {
      setContent('');
      onChanged();
    }
    setSubmitting(false);
  }

  return (
    <div className="mt-6 mb-6">
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
        <MessageSquare size={14} />
        Comentarios ({items.length})
      </h3>

      {canComment && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Escribe un comentario..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
          </button>
        </form>
      )}

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map(c => (
            <div key={c.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-700">{c.authorName}</span>
                <span className="text-xs text-gray-400">
                  {toTimestampRD(new Date(c.createdAt))}
                </span>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Sin comentarios</p>
      )}
    </div>
  );
}

const BLOCK_AREAS = [
  { value: 'compras', label: 'Compras' },
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'tesoreria', label: 'Tesorería' },
  { value: 'contabilidad', label: 'Contabilidad' },
  { value: 'administracion', label: 'Administración' },
  { value: 'presupuesto', label: 'Presupuesto' },
  { value: 'otro', label: 'Otro' },
] as const;

function BlockDialog({
  onConfirm, onCancel,
}: {
  onConfirm: (area: string, areaText?: string) => void;
  onCancel: () => void;
}) {
  const [area, setArea] = useState('');
  const [areaText, setAreaText] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-500" />
            Bloquear tarea
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-3">Selecciona el área que bloquea esta tarea:</p>
        <select
          value={area}
          onChange={e => setArea(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
          autoFocus
        >
          <option value="">Seleccionar área...</option>
          {BLOCK_AREAS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        {area === 'otro' && (
          <input
            type="text"
            value={areaText}
            onChange={e => setAreaText(e.target.value)}
            placeholder="Especifique el área"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(area, area === 'otro' ? areaText : undefined)}
            disabled={!area || (area === 'otro' && !areaText.trim())}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            Confirmar bloqueo
          </button>
        </div>
      </div>
    </div>
  );
}

const DELAY_REASONS = [
  { value: 'falta_informacion_terceros', label: 'Falta de información de terceros' },
  { value: 'documento_no_recibido_otra_area', label: 'Documento no recibido de otra área' },
  { value: 'error_sistema', label: 'Error de sistema' },
  { value: 'capacidad_insuficiente', label: 'Capacidad insuficiente' },
  { value: 'dependencia_atrasada', label: 'Dependencia atrasada' },
  { value: 'repriorizacion', label: 'Repriorización' },
  { value: 'otro', label: 'Otro' },
] as const;

function DelayReasonDialog({
  onConfirm, onCancel,
}: {
  onConfirm: (reason: string, reasonText?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [reasonText, setReasonText] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-5 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Tarea vencida
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Esta tarea se completó fuera de plazo. Selecciona el motivo del retraso:
        </p>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
          autoFocus
        >
          <option value="">Seleccionar motivo...</option>
          {DELAY_REASONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {reason === 'otro' && (
          <input
            type="text"
            value={reasonText}
            onChange={e => setReasonText(e.target.value)}
            placeholder="Describa el motivo"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-3"
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason, reason === 'otro' ? reasonText : undefined)}
            disabled={!reason || (reason === 'otro' && !reasonText.trim())}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            Completar tarea
          </button>
        </div>
      </div>
    </div>
  );
}
