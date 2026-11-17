import { IMPORT_CSV_PREVIEW_ROWS } from '@/lib/schemas/task-import';
import { KIND_LABEL, PRIORITY_LABEL } from '@/lib/labels';
import type { CsvImportResult, ImportIssue } from '@/lib/task-import';

/** Respuesta de la vista previa (dryRun) de POST /api/spaces/[id]/import-csv. */
export type CsvImportPreviewData = CsvImportResult;

/** Sólo se puede confirmar sin errores y con al menos una fila. */
export function canConfirmImport(preview: CsvImportPreviewData | null): boolean {
  return !!preview && preview.errors.length === 0 && preview.total > 0;
}

/** «1 tarea importada», «5 tareas importadas». */
export function importedTasksText(n: number): string {
  return `${n} ${n === 1 ? 'tarea importada' : 'tareas importadas'}`;
}

/** «Línea 3 · responsable: mensaje», sin las partes que no apliquen. */
export function issueText(issue: ImportIssue): string {
  const where = [issue.line !== null ? `Línea ${issue.line}` : null, issue.column].filter(Boolean).join(' · ');
  return where ? `${where}: ${issue.message}` : issue.message;
}

function countText(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const CELL = 'px-2 py-1.5 align-top';

export function CsvImportPreview({ preview }: { preview: CsvImportPreviewData }) {
  const shown = preview.rows.slice(0, IMPORT_CSV_PREVIEW_ROWS);

  return (
    <div className="space-y-4">
      {preview.errors.length > 0 && (
        <section aria-labelledby="csv-import-errors" className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h4 id="csv-import-errors" className="text-sm font-medium text-red-700 mb-1">
            {countText(preview.errors.length, 'error', 'errores')}: corrígelos en el archivo y vuelve a cargarlo
          </h4>
          <ul className="text-xs text-red-700 space-y-0.5 max-h-40 overflow-y-auto">
            {preview.errors.map((issue, i) => <li key={i}>{issueText(issue)}</li>)}
          </ul>
        </section>
      )}

      {preview.warnings.length > 0 && (
        <section aria-labelledby="csv-import-warnings" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h4 id="csv-import-warnings" className="text-sm font-medium text-amber-800 mb-1">
            {countText(preview.warnings.length, 'aviso', 'avisos')}
          </h4>
          <ul className="text-xs text-amber-800 space-y-0.5 max-h-32 overflow-y-auto">
            {preview.warnings.map((issue, i) => <li key={i}>{issueText(issue)}</li>)}
          </ul>
        </section>
      )}

      {shown.length > 0 && (
        <div>
          <div className="overflow-x-auto max-h-80 rounded-lg border border-[var(--border)]">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-[var(--text-secondary)] sticky top-0">
                <tr>
                  <th scope="col" className={CELL}>Línea</th>
                  <th scope="col" className={CELL}>Título</th>
                  <th scope="col" className={CELL}>Responsable</th>
                  <th scope="col" className={CELL}>Revisor</th>
                  <th scope="col" className={CELL}>Fecha límite</th>
                  <th scope="col" className={CELL}>Prioridad</th>
                  <th scope="col" className={CELL}>Tipo</th>
                  <th scope="col" className={CELL}>Estimación</th>
                  <th scope="col" className={CELL}>Etiquetas</th>
                  <th scope="col" className={CELL}>Hito</th>
                </tr>
              </thead>
              <tbody className="text-[var(--text-primary)]">
                {shown.map(row => (
                  <tr key={row.line} className="border-t border-[var(--border)]">
                    <td className={`${CELL} text-[var(--text-muted)]`}>{row.line}</td>
                    <td className={CELL}>{row.title}</td>
                    <td className={CELL}>{row.responsible.name}</td>
                    <td className={CELL}>{row.reviewer?.name ?? '—'}</td>
                    <td className={CELL}>{row.dueDate ?? '—'}</td>
                    <td className={CELL}>{PRIORITY_LABEL[row.priority] ?? row.priority}</td>
                    <td className={CELL}>{KIND_LABEL[row.kind]}</td>
                    <td className={CELL}>{row.estimate ?? '—'}</td>
                    <td className={CELL}>{row.labels.length ? row.labels.join(', ') : '—'}</td>
                    <td className={CELL}>{row.milestone?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > IMPORT_CSV_PREVIEW_ROWS && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {`Mostrando ${shown.length} de ${preview.rows.length} filas`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
