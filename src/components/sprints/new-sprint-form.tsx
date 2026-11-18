'use client';

import { useState, type FormEvent } from 'react';
import { SPRINT_GOAL_MAX, SPRINT_NAME_MAX } from '@/lib/sprints';

export type NewSprintPayloadInput = {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
};

export type NewSprintPayload = {
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
};

/** Cuerpo del POST /api/spaces/[id]/sprints: textos recortados y objetivo vacío como null. */
export function buildNewSprintPayload(input: NewSprintPayloadInput): NewSprintPayload {
  const goal = input.goal.trim();
  return {
    name: input.name.trim(),
    goal: goal ? goal : null,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export type NewSprintFormProps = {
  defaultDates: { startDate: string; endDate: string };
  onSubmit: (payload: NewSprintPayload) => boolean | void | Promise<boolean | void>;
};

const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm';
const labelClass = 'block text-xs font-medium text-[var(--text-secondary)] mb-1';

/** Formulario puro (sin fetch): el contenedor decide qué hacer con el payload. */
export function NewSprintForm({ defaultDates, onSubmit }: NewSprintFormProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = buildNewSprintPayload({
      name: String(data.get('name') ?? ''),
      goal: String(data.get('goal') ?? ''),
      startDate: String(data.get('startDate') ?? ''),
      endDate: String(data.get('endDate') ?? ''),
    });
    setSubmitting(true);
    try {
      // Si el contenedor devuelve false (error de la API), se conservan los datos escritos.
      const ok = await onSubmit(payload);
      if (ok !== false) form.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="sprint-name" className={labelClass}>Nombre</label>
        <input id="sprint-name" name="name" required maxLength={SPRINT_NAME_MAX} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="sprint-start" className={labelClass}>Inicio</label>
          <input type="date" id="sprint-start" name="startDate" required defaultValue={defaultDates.startDate} className={inputClass} />
        </div>
        <div>
          <label htmlFor="sprint-end" className={labelClass}>Fin</label>
          <input type="date" id="sprint-end" name="endDate" required defaultValue={defaultDates.endDate} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="sprint-goal" className={labelClass}>Objetivo (opcional)</label>
        <textarea id="sprint-goal" name="goal" rows={2} maxLength={SPRINT_GOAL_MAX} className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50"
      >
        Crear sprint
      </button>
    </form>
  );
}
