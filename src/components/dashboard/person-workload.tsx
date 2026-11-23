// Vistas por persona (DECISIONES §22). Componentes puros: pintan las filas en el orden
// recibido (por carga, para equilibrar) sin posiciones, medallas ni nada que parezca un ranking.

import { Users } from 'lucide-react';
import type { PersonLoadRow, WipRow } from '@/lib/metrics';

const PERSON_LOAD_LIMIT = 8;

const overdueText = (n: number) => `${n} ${n === 1 ? 'vencida' : 'vencidas'}`;

/** Tabla «Trabajo en curso por persona». */
export function WipByPersonTable({ rows }: { rows: WipRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--text-muted)]">Nadie tiene tareas en curso.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--text-muted)]">
          <th className="font-medium pb-2">Persona</th>
          <th className="font-medium pb-2 text-right">En progreso</th>
          <th className="font-medium pb-2 text-right">Code review</th>
          <th className="font-medium pb-2 text-right">Bloqueadas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.personId} className="border-t border-[var(--border)]">
            <td className="py-2 text-[var(--text-primary)]">{r.name}</td>
            <td className="py-2 text-right tabular">{r.inProgress}</td>
            <td className="py-2 text-right tabular">{r.inReview}</td>
            <td className={`py-2 text-right tabular ${r.blocked ? 'text-red-700 dark:text-red-400 font-medium' : ''}`}>{r.blocked}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tarjeta «Por persona» de los KPIs de Panorama: completadas sobre total y vencidas. */
export function PersonLoadCard({ rows }: { rows: PersonLoadRow[] }) {
  return (
    <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
        <Users size={16} className="text-gray-400" />
        Por persona
      </h3>
      <ul className="space-y-2.5">
        {rows.slice(0, PERSON_LOAD_LIMIT).map(p => {
          const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
          return (
            <li key={p.personId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700 truncate">{p.name}</span>
                <div className="flex items-center gap-2">
                  {p.overdue > 0 && (
                    <span className="text-[10px] text-red-600 font-medium">{overdueText(p.overdue)}</span>
                  )}
                  <span className="text-xs text-gray-500">{p.completed}/{p.total}</span>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
