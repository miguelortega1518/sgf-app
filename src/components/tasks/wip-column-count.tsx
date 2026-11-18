// Recuento de la cabecera de una columna del kanban con su límite de trabajo en
// curso. Componente puro: sólo avisa, nunca bloquea mover tareas.

import { wipLimitState } from '@/lib/wip-limits';

/** Aviso del límite, o '' si no se alcanza (sin límite o por debajo). */
export function wipLimitWarning(count: number, limit: number | null): string {
  const state = wipLimitState(count, limit);
  if (state === 'at') return `Límite de trabajo en curso alcanzado (${limit})`;
  if (state === 'over') return `Límite de trabajo en curso superado: ${count} de ${limit}`;
  return '';
}

/** Sufijo para el aria-label de la columna: '. <aviso>' o ''. */
export function wipAriaSuffix(count: number, limit: number | null): string {
  const warning = wipLimitWarning(count, limit);
  return warning ? `. ${warning}` : '';
}

const STATE_CLASS = {
  under: 'text-[var(--text-muted)]',
  at: 'rounded px-1.5 bg-amber-100 text-amber-800 font-medium',
  over: 'rounded px-1.5 bg-red-100 text-red-700 font-medium',
} as const;

export function WipColumnCount({ count, limit }: { count: number; limit: number | null }) {
  const state = wipLimitState(count, limit);
  if (state === 'none') return <span className="tabular text-[var(--text-muted)]">{count}</span>;
  const warning = wipLimitWarning(count, limit) || undefined;
  return (
    <span
      className={`tabular ${STATE_CLASS[state]}`}
      data-wip-state={state}
      title={warning ?? `Límite de trabajo en curso: ${limit}`}
      aria-label={warning}
    >
      {count}/{limit}
    </span>
  );
}
