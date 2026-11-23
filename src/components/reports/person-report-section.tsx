// Tarjeta «Reporte por persona» de /reportes. Componente puro: no se pinta si el
// equipo apagó las métricas por persona (DECISIONES §22).

import { Download, FileText, Users } from 'lucide-react';

export type ReportPerson = { id: string; name: string };
export type PersonReportFormat = 'xlsx' | 'pdf';

const BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors';

export function PersonReportSection({ enabled, people, personId, generating, onSelect, onDownload }: {
  enabled: boolean;
  people: ReportPerson[];
  personId: string;
  /** Clave del reporte que se está generando ('persona-xlsx', 'persona-pdf', …) o null. */
  generating: string | null;
  onSelect: (personId: string) => void;
  onDownload: (format: PersonReportFormat) => void;
}) {
  if (!enabled) return null;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <Users size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-base font-medium text-[var(--text-primary)]">Reporte por persona</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Tareas asignadas, completadas, vencidas, tasa de cumplimiento y tiempo promedio de resolución
          </p>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="report-person" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Persona</label>
          <select
            id="report-person"
            value={personId}
            onChange={e => onSelect(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => onDownload('xlsx')}
          disabled={!personId || generating === 'persona-xlsx'}
          className={BUTTON}
        >
          <Download size={14} />
          {generating === 'persona-xlsx' ? 'Generando...' : 'Excel'}
        </button>
        <button
          type="button"
          onClick={() => onDownload('pdf')}
          disabled={!personId || generating === 'persona-pdf'}
          className={BUTTON}
        >
          <FileText size={14} />
          {generating === 'persona-pdf' ? 'Generando...' : 'PDF'}
        </button>
      </div>
    </div>
  );
}
