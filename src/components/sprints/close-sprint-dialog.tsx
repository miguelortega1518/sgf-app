'use client';

import { useId, useState } from 'react';

export const BACKLOG_CARRY = 'backlog';

export type CloseSprintDialogProps = {
  sprintName: string;
  /** Tareas no completadas (no archivadas) del sprint y sus puntos. */
  pending: { tasks: number; points: number };
  /** Siguiente sprint planificado (nextPlannedSprint) o null. */
  nextPlanned: { id: string; name: string } | null;
  /** carryOverTo: id del sprint destino o 'backlog'. */
  onConfirm: (carryOverTo: string) => void;
  onCancel: () => void;
};

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Diálogo de «Cerrar sprint» (presentación pura; sólo guarda la opción elegida):
 * con pendientes, ofrece llevarlas al siguiente sprint planificado (por defecto)
 * o al backlog; sin pendientes, sólo pide confirmar.
 */
export function CloseSprintDialog({ sprintName, pending, nextPlanned, onConfirm, onCancel }: CloseSprintDialogProps) {
  const titleId = useId();
  const groupName = useId();
  const defaultTarget = nextPlanned?.id ?? BACKLOG_CARRY;
  const [target, setTarget] = useState(defaultTarget);
  const hasPending = pending.tasks > 0;

  const options = [
    ...(nextPlanned ? [{ value: nextPlanned.id, label: `Al siguiente sprint planificado (${nextPlanned.name})` }] : []),
    { value: BACKLOG_CARRY, label: 'Al backlog' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
    >
      <h4 id={titleId} className="text-sm font-semibold text-[var(--text-primary)]">{`Cerrar «${sprintName}»`}</h4>
      {hasPending ? (
        <fieldset className="mt-2">
          <legend className="text-xs text-[var(--text-secondary)]">
            {`${pending.tasks === 1 ? 'Queda' : 'Quedan'} ${countLabel(pending.tasks, 'tarea', 'tareas')} sin completar (${countLabel(pending.points, 'punto', 'puntos')}). ¿A dónde las llevamos?`}
          </legend>
          <div className="mt-2 space-y-1">
            {options.map(o => (
              <label key={o.value} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                <input
                  type="radio"
                  name={groupName}
                  value={o.value}
                  checked={target === o.value}
                  onChange={() => setTarget(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Todas las tareas del sprint están completadas. ¿Confirmas el cierre?
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >Cancelar</button>
        <button
          type="button"
          onClick={() => onConfirm(hasPending ? target : defaultTarget)}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
        >Cerrar sprint</button>
      </div>
    </div>
  );
}
