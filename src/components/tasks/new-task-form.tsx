'use client';

import { useState, type FormEvent } from 'react';
import { ESTIMATE_STEPS, KIND_LABEL, KIND_ORDER } from '@/lib/labels';

export type NewTaskPayloadInput = {
  spaceId: string;
  title: string;
  description: string;
  responsibleId: string;
  companyId: string;
  dueDate: string;
  kind: string;
  estimate: string;
  requiresApproval: boolean;
};

export function buildNewTaskPayload(input: NewTaskPayloadInput) {
  const description = input.description.trim();

  return {
    spaceId: input.spaceId,
    title: input.title,
    ...(description ? { description } : {}),
    responsibleId: input.responsibleId,
    ...(input.companyId ? { companyId: input.companyId } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    kind: input.kind,
    ...(input.estimate ? { estimate: Number(input.estimate) } : {}),
    requiresApproval: input.requiresApproval,
  };
}

type NewTaskFormProps = {
  spaceId: string;
  people: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  onCreated: () => void;
  onCancel: () => void;
};

export function NewTaskForm({
  spaceId, people, companies, onCreated, onCancel,
}: NewTaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [kind, setKind] = useState('feature');
  const [estimate, setEstimate] = useState('');
  const [review, setReview] = useState(true);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildNewTaskPayload({
        spaceId,
        title,
        description,
        responsibleId,
        companyId,
        dueDate,
        kind,
        estimate,
        requiresApproval: review,
      })),
    });
    if (res.ok) onCreated();
    else setFormError((await res.json().catch(() => null))?.error || 'No se pudo crear la tarea');
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
      <input
        type="text"
        placeholder="Título de la tarea"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
        autoFocus
      />
      <div>
        <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 mb-1">
          Descripción (opcional)
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Añade contexto o el resultado esperado"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
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
          <option value="">Repositorio (opcional)</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Tipo de tarea"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          {KIND_ORDER.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select value={estimate} onChange={e => setEstimate(e.target.value)} aria-label="Estimación en puntos"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">Sin estimar</option>
          {ESTIMATE_STEPS.map(n => <option key={n} value={n}>{n} {n === 1 ? 'punto' : 'puntos'}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} className="accent-[var(--accent)]" />
          Requiere code review
        </label>
      </div>
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
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
