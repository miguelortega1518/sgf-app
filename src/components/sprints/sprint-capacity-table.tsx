import { overloadPoints, SPRINT_CAPACITY_MAX, type CapacityRow } from '@/lib/sprint-capacity';

export type SprintCapacityTableProps = {
  sprintName: string;
  rows: CapacityRow[];
  canEdit: boolean;
  /** points null = volver a la capacidad por defecto. */
  onSave: (personId: string, points: number | null) => void;
};

function pointsLabel(n: number): string {
  return `${n} ${n === 1 ? 'punto' : 'puntos'}`;
}

/**
 * Valor del campo de capacidad: '' → null (por defecto); entero 0..999 → número;
 * cualquier otra cosa → undefined (no se envía).
 */
export function parseCapacityInput(raw: string): number | null | undefined {
  const value = raw.trim();
  if (value === '') return null;
  if (!/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n <= SPRINT_CAPACITY_MAX ? n : undefined;
}

function CapacityInput({ sprintName, row, onSave }: {
  sprintName: string;
  row: CapacityRow;
  onSave: SprintCapacityTableProps['onSave'];
}) {
  const shown = row.points === null ? '' : String(row.points);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={SPRINT_CAPACITY_MAX}
      step={1}
      defaultValue={shown}
      placeholder="Sin datos"
      aria-label={`Capacidad de ${row.name} en ${sprintName}`}
      onBlur={e => {
        const next = parseCapacityInput(e.currentTarget.value);
        if (next === undefined) {
          e.currentTarget.value = shown;
          return;
        }
        // Vaciar una capacidad que ya es la de por defecto no cambia nada.
        if (next === null ? row.isDefault : (!row.isDefault && next === row.points)) return;
        onSave(row.personId, next);
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-20 rounded border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5 text-xs text-[var(--text-primary)]"
    />
  );
}

/**
 * Tabla de capacidad de un sprint planificado o activo (presentación pura): por
 * persona, capacidad (guardada, por defecto o vacía), asignado y aviso de sobrecarga.
 */
export function SprintCapacityTable({ sprintName, rows, canEdit, onSave }: SprintCapacityTableProps) {
  if (rows.length === 0) {
    return <p className="py-2 text-xs text-[var(--text-muted)]">No hay personas en este proyecto</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[var(--text-muted)]">
          <th scope="col" className="py-1 pr-2 font-medium">Persona</th>
          <th scope="col" className="py-1 pr-2 font-medium">Capacidad</th>
          <th scope="col" className="py-1 pr-2 font-medium">Asignado</th>
          <th scope="col" className="py-1 font-medium"><span className="sr-only">Aviso</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {rows.map(row => {
          const over = overloadPoints(row);
          return (
            <tr key={`${row.personId}-${row.points ?? 'null'}-${row.isDefault}`}>
              <td className="py-1 pr-2 text-[var(--text-primary)]">{row.name}</td>
              <td className="py-1 pr-2 text-[var(--text-secondary)]">
                <span className="flex flex-wrap items-center gap-1">
                  {canEdit
                    ? <CapacityInput sprintName={sprintName} row={row} onSave={onSave} />
                    : <span>{row.points === null ? 'Sin datos' : pointsLabel(row.points)}</span>}
                  {row.isDefault && row.points !== null && (
                    <span className="text-[var(--text-muted)]">(media de los últimos sprints)</span>
                  )}
                </span>
              </td>
              <td className="py-1 pr-2 text-[var(--text-secondary)]">{pointsLabel(row.assigned)}</td>
              <td className="py-1">
                {row.overloaded && over > 0 && (
                  <span role="status" className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                    {`Supera su capacidad en ${pointsLabel(over)}`}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
