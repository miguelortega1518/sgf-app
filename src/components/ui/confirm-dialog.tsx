'use client';

import { X } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  variant = 'default', onConfirm, onCancel,
}: Props) {
  const trapRef = useFocusTrap(true);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="bg-[var(--bg-card)] rounded-xl shadow-lg p-5 w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="confirm-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm text-white rounded-md ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
