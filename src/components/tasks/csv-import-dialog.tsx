'use client';

import { useState, type ChangeEvent } from 'react';
import { Download, X } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import { useToast } from '@/components/providers/toast-provider';
import { CSV_IMPORT_TEMPLATE } from '@/lib/task-import';
import { IMPORT_CSV_MAX_BYTES } from '@/lib/schemas/task-import';
import {
  CsvImportPreview,
  canConfirmImport,
  importedTasksText,
  type CsvImportPreviewData,
} from './csv-import-preview';

type Props = {
  spaceId: string;
  /** Miembros del proyecto que no son observadores. */
  members: { personId: string; name: string }[];
  onImported: () => void;
  onClose: () => void;
};

const MAX_MB = IMPORT_CSV_MAX_BYTES / (1024 * 1024);
const FILE_TOO_LARGE = `El archivo supera el máximo de ${MAX_MB} MB`;

function downloadTemplate() {
  // El BOM hace que Excel abra la plantilla como UTF-8; el importador lo quita.
  const blob = new Blob(['﻿' + CSV_IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-tareas.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function CsvImportDialog({ spaceId, members, onImported, onClose }: Props) {
  const trapRef = useFocusTrap(true);
  const { toast } = useToast();
  const [csv, setCsv] = useState('');
  const [defaultResponsibleId, setDefaultResponsibleId] = useState('');
  const [preview, setPreview] = useState<CsvImportPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(null);
    setMessage(null);
    setCsv('');
    if (!file) return;
    if (file.size > IMPORT_CSV_MAX_BYTES) {
      setMessage(FILE_TOO_LARGE);
      e.target.value = '';
      return;
    }
    setCsv(await file.text());
  }

  async function send(dryRun: boolean) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, dryRun, ...(defaultResponsibleId ? { defaultResponsibleId } : {}) }),
      });
      const body = await res.json().catch(() => null);
      if (dryRun && res.ok) {
        setPreview(body);
      } else if (!dryRun && res.status === 201) {
        toast(importedTasksText(body?.imported ?? 0));
        onImported();
      } else if (Array.isArray(body?.errors)) {
        setPreview(prev => ({ rows: prev?.rows ?? [], errors: body.errors, warnings: body.warnings ?? [], total: body.total ?? 0 }));
        setMessage(body.error ?? null);
      } else {
        setMessage(body?.error || 'No se pudo procesar el CSV');
      }
    } catch {
      setMessage('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        className="bg-[var(--bg-card)] rounded-xl shadow-lg p-5 w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="csv-import-title" className="text-base font-semibold text-[var(--text-primary)]">Importar tareas desde CSV</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-3">
          {`Archivo CSV en UTF-8, separado por comas o punto y coma, de hasta ${MAX_MB} MB. Se importan todas las filas o ninguna, y no se envían avisos a las personas asignadas.`}
        </p>

        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label htmlFor="csv-import-file" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Archivo</label>
            <input
              id="csv-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="text-sm text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label htmlFor="csv-import-default-responsible" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Responsable por defecto (opcional)
            </label>
            <select
              id="csv-import-default-responsible"
              value={defaultResponsibleId}
              onChange={e => { setDefaultResponsibleId(e.target.value); setPreview(null); }}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-[var(--bg-card)]"
            >
              <option value="">Sin responsable por defecto</option>
              {members.map(m => <option key={m.personId} value={m.personId}>{m.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            <Download size={14} aria-hidden="true" />
            Descargar plantilla
          </button>
        </div>

        {message && (
          <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{message}</div>
        )}

        {preview && <CsvImportPreview preview={preview} />}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancelar
          </button>
          <button
            onClick={() => send(true)}
            disabled={!csv || loading}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            Vista previa
          </button>
          <button
            onClick={() => send(false)}
            disabled={!canConfirmImport(preview) || loading}
            className="px-3 py-1.5 text-sm text-white rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}
