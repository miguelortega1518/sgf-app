// Control «Mostrar métricas por persona» de /admin/ajustes (DECISIONES §22).
// Componente puro: el contenedor hace el GET/PATCH y decide `canEdit` (sólo admin).

import { Users } from 'lucide-react';

const INPUT_ID = 'setting-person-metrics';
const HELP_ID = 'setting-person-metrics-help';
const NOTE_ID = 'setting-person-metrics-note';

export function PersonMetricsSettingForm({ enabled, canEdit, saving, onToggle }: {
  enabled: boolean;
  canEdit: boolean;
  saving: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5" aria-labelledby="setting-person-metrics-title">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <Users size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 id="setting-person-metrics-title" className="text-base font-medium text-[var(--text-primary)]">Métricas por persona</h2>
          <div className="mt-3 flex items-center gap-2">
            <input
              id={INPUT_ID}
              type="checkbox"
              checked={enabled}
              disabled={!canEdit || saving}
              onChange={e => onToggle(e.target.checked)}
              aria-describedby={canEdit ? HELP_ID : `${HELP_ID} ${NOTE_ID}`}
              className="h-4 w-4 rounded border-[var(--border-strong)] text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <label htmlFor={INPUT_ID} className="text-sm font-medium text-[var(--text-primary)]">
              Mostrar métricas por persona
            </label>
          </div>
          <p id={HELP_ID} className="mt-2 text-sm text-[var(--text-secondary)]">
            Sirven para equilibrar la carga del equipo, no para hacer rankings. Si se apaga, desaparecen el reporte
            por persona y la carga por persona del panel; los totales del equipo siguen visibles.
          </p>
          {!canEdit && (
            <p id={NOTE_ID} className="mt-2 text-xs text-[var(--text-muted)]">Sólo un admin puede cambiar este ajuste.</p>
          )}
        </div>
      </div>
    </section>
  );
}
