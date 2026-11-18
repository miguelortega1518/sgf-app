'use client';

import { useState, type FormEvent } from 'react';
import { STATUS_LABEL } from '@/lib/labels';
import { WIP_LIMITED_STATUSES, type WipLimits } from '@/lib/wip-limits';
import { WIP_LIMIT_MAX, WIP_LIMIT_MESSAGE, WIP_LIMIT_MIN } from '@/lib/schemas/wip-limits';

/** '' (o sólo espacios) = sin límite (null); si no, el número escrito. El servidor valida el rango. */
export function normalizeWipInput(value: string): number | null {
  const v = value.trim();
  return v === '' ? null : Number(v);
}

function isValidLimit(v: number | null): boolean {
  return v === null || (Number.isInteger(v) && v >= WIP_LIMIT_MIN && v <= WIP_LIMIT_MAX);
}

export type WipLimitsFormProps = {
  initial: WipLimits;
  /** Guarda los límites (el contenedor hace el PUT). Devuelve false si falló. */
  onSave: (limits: WipLimits) => boolean | void | Promise<boolean | void>;
};

const inputClass = 'w-24 h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 text-sm tabular';
const labelClass = 'block text-xs font-medium text-[var(--text-secondary)] mb-1';

/** Formulario puro (sin fetch) de los límites de trabajo en curso de un proyecto. */
export function WipLimitsForm({ initial, onSave }: WipLimitsFormProps) {
  const [values, setValues] = useState<Record<keyof WipLimits, string>>({
    en_proceso: initial.en_proceso === null ? '' : String(initial.en_proceso),
    en_revision: initial.en_revision === null ? '' : String(initial.en_revision),
  });
  const [clientError, setClientError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const limits: WipLimits = {
      en_proceso: normalizeWipInput(values.en_proceso),
      en_revision: normalizeWipInput(values.en_revision),
    };
    if (!WIP_LIMITED_STATUSES.every(s => isValidLimit(limits[s]))) {
      setClientError(WIP_LIMIT_MESSAGE);
      return;
    }
    setClientError(null);
    setSaving(true);
    try {
      await onSave(limits);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="wip-limits-title" className="space-y-3">
      <div>
        <h3 id="wip-limits-title" className="text-sm font-medium text-[var(--text-primary)]">Límites de trabajo en curso</h3>
        <p className="text-xs text-[var(--text-muted)]">Avisan en el tablero si una columna se llena. Vacío = sin límite. Nunca impiden mover tareas.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {WIP_LIMITED_STATUSES.map(status => (
          <div key={status}>
            <label htmlFor={`wip-${status}`} className={labelClass}>{STATUS_LABEL[status]}</label>
            <input
              id={`wip-${status}`}
              name={status}
              type="number"
              inputMode="numeric"
              min={WIP_LIMIT_MIN}
              max={WIP_LIMIT_MAX}
              step={1}
              placeholder="Sin límite"
              value={values[status]}
              onChange={e => setValues(v => ({ ...v, [status]: e.target.value }))}
              aria-invalid={clientError ? true : undefined}
              aria-describedby={clientError ? 'wip-limits-error' : undefined}
              className={inputClass}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={saving}
          className="h-9 px-4 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          Guardar límites
        </button>
      </div>
      {clientError && <p id="wip-limits-error" role="alert" className="text-xs text-red-700">{clientError}</p>}
    </form>
  );
}
