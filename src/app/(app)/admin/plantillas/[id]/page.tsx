'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, Play, ArrowLeft } from 'lucide-react';

type TaskTemplateRow = {
  id: string;
  taskName: string;
  companyId: string | null;
  companyName: string | null;
  order: number;
  businessDayLimit: number;
  defaultResponsibleId: string | null;
  responsibleName: string | null;
  requiresApproval: boolean;
  requiresEvidence: boolean;
  applies: boolean;
};

type TemplateDetail = {
  id: string;
  name: string;
  periodicity: string;
  targetCycleDays: number;
  active: boolean;
};

type Person = { id: string; name: string };
type Company = { id: string; name: string };

const PERIODICITY_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

export default function PlantillaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplateRow[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddTask, setShowAddTask] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const fetchData = useCallback(async () => {
    const [tplRes, persRes, compRes] = await Promise.all([
      fetch(`/api/templates/${id}`),
      fetch('/api/users'),
      fetch('/api/companies'),
    ]);

    if (tplRes.ok) {
      const data = await tplRes.json();
      setTemplate(data.template);
      setTaskTemplates(data.tasks);
    }
    if (persRes.ok) setPersons(await persRes.json());
    if (compRes.ok) setCompanies(await compRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDeleteTask(taskId: string) {
    if (!confirm('¿Eliminar esta tarea de la plantilla?')) return;
    const res = await fetch(`/api/templates/${id}/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) fetchData();
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!template) return <div className="p-6">Plantilla no encontrada</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-1">
        <a href="/admin/plantillas" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </a>
        <span className="text-sm text-gray-500">Plantilla</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{template.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>{PERIODICITY_LABELS[template.periodicity]}</span>
            <span>{template.targetCycleDays} días ciclo</span>
            <span>{taskTemplates.length} tareas</span>
          </div>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          <Play size={16} />
          Generar ciclo
        </button>
      </div>

      {/* Task templates table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Tareas de la plantilla</h2>
          <button
            onClick={() => setShowAddTask(true)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <Plus size={14} />
            Agregar tarea
          </button>
        </div>

        {taskTemplates.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No hay tareas en esta plantilla
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                  <th className="px-4 py-2 w-10">#</th>
                  <th className="px-4 py-2">Tarea</th>
                  <th className="px-4 py-2">Empresa</th>
                  <th className="px-4 py-2">Responsable</th>
                  <th className="px-4 py-2 text-center">DH</th>
                  <th className="px-4 py-2 text-center">Aprob.</th>
                  <th className="px-4 py-2 text-center">Evid.</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {taskTemplates.map(tt => (
                  <tr
                    key={tt.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      !tt.applies ? 'opacity-40' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 text-gray-400">{tt.order}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{tt.taskName}</td>
                    <td className="px-4 py-2.5 text-gray-500">{tt.companyName || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{tt.responsibleName || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{tt.businessDayLimit}</td>
                    <td className="px-4 py-2.5 text-center">{tt.requiresApproval ? 'Si' : '—'}</td>
                    <td className="px-4 py-2.5 text-center">{tt.requiresEvidence ? 'Si' : '—'}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleDeleteTask(tt.id)}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddTask && (
        <AddTaskDialog
          templateId={id}
          persons={persons}
          companies={companies}
          nextOrder={taskTemplates.length + 1}
          onClose={() => setShowAddTask(false)}
          onSaved={() => { setShowAddTask(false); fetchData(); }}
        />
      )}

      {showGenerate && (
        <GenerateCycleDialog
          templateId={id}
          templateName={template.name}
          onClose={() => setShowGenerate(false)}
          onGenerated={(spaceId) => {
            router.push(`/espacios/${spaceId}`);
          }}
        />
      )}
    </div>
  );
}

function AddTaskDialog({
  templateId, persons, companies, nextOrder, onClose, onSaved,
}: {
  templateId: string;
  persons: Person[];
  companies: Company[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [taskName, setTaskName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [businessDayLimit, setBusinessDayLimit] = useState(5);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [requiresEvidence, setRequiresEvidence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const res = await fetch(`/api/templates/${templateId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskName,
        companyId: companyId || null,
        order: nextOrder,
        businessDayLimit,
        defaultResponsibleId: responsibleId || null,
        requiresApproval,
        requiresEvidence,
      }),
    });

    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error || 'Error al agregar tarea');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">Agregar tarea a la plantilla</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la tarea</label>
            <input
              type="text"
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
              <select
                value={companyId}
                onChange={e => setCompanyId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas / ninguna</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
              <select
                value={responsibleId}
                onChange={e => setResponsibleId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Sin asignar</option>
                {persons.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Días hábiles (desde fecha ancla)
            </label>
            <input
              type="number"
              value={businessDayLimit}
              onChange={e => setBusinessDayLimit(parseInt(e.target.value) || 1)}
              min={1}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={e => setRequiresApproval(e.target.checked)}
              />
              Requiere aprobación
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requiresEvidence}
                onChange={e => setRequiresEvidence(e.target.checked)}
              />
              Requiere evidencia
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GenerateCycleDialog({
  templateId, templateName, onClose, onGenerated,
}: {
  templateId: string;
  templateName: string;
  onClose: () => void;
  onGenerated: (spaceId: string) => void;
}) {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const defaultAnchor = lastDayPrevMonth.toISOString().slice(0, 10);

  const [period, setPeriod] = useState(defaultPeriod);
  const [anchorDate, setAnchorDate] = useState(defaultAnchor);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) { setError('Error de sesión'); setSubmitting(false); return; }
    const me = await meRes.json();

    const res = await fetch('/api/spaces/generate-cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spaceTemplateId: templateId,
        period,
        anchorDate,
        ownerId: me.user.id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      onGenerated(data.space.id);
    } else {
      const data = await res.json();
      setError(data.error || 'Error al generar el ciclo');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold mb-1">Generar ciclo</h3>
        <p className="text-sm text-gray-500 mb-4">
          Plantilla: {templateName}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Período (YYYY-MM)
            </label>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha ancla (día 0 del cronograma)
            </label>
            <input
              type="date"
              value={anchorDate}
              onChange={e => setAnchorDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Generalmente el último día del mes anterior
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Generando...' : 'Generar ciclo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
