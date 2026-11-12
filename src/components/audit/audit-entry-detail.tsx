// Componentes de presentación puros (sin hooks ni fetch) para el detalle de una
// entrada de auditoría. Todo el contenido va como texto JSX: React lo escapa.
// El reason se traduce con delayReasonLabel: los códigos de motivo de retraso se
// muestran con su etiqueta y el texto libre se muestra tal cual.

import { delayReasonLabel } from '@/lib/labels';

export type AuditEntryDetailProps = {
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
};

/** Celda «Detalle» de la bitácora: «antes → después» y, si existe, el reason (traducido) debajo. */
export function AuditLogDetail({ previousValue, newValue, reason }: AuditEntryDetailProps) {
  const hasChange = Boolean(previousValue && newValue);

  if (!hasChange && !reason) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  if (!hasChange) {
    return <span className="text-xs text-gray-500">{delayReasonLabel(reason ?? '')}</span>;
  }

  return (
    <>
      <span className="text-xs text-gray-500">
        {previousValue} → {newValue}
      </span>
      {reason ? <span className="block text-xs text-gray-400">{delayReasonLabel(reason)}</span> : null}
    </>
  );
}

export type TaskAuditDetailProps = AuditEntryDetailProps & {
  /** Registro redactado por la API para quien no es admin: no se muestra contenido. */
  redacted?: boolean;
};

/** Historial «Actividad» de la tarea: «(antes → después)» y el reason (traducido) como texto secundario. */
export function TaskAuditDetail({ previousValue, newValue, reason, redacted }: TaskAuditDetailProps) {
  // Debe ir antes de cualquier rama de render: un registro redactado no muestra valores ni reason.
  if (redacted) return null;

  const hasChange = Boolean(previousValue && newValue);

  if (!hasChange && !reason) return null;

  return (
    <>
      {hasChange ? (
        <span className="text-gray-400 ml-1">
          ({previousValue} → {newValue})
        </span>
      ) : null}
      {reason ? <span className="text-gray-400 ml-1 italic">— {delayReasonLabel(reason)}</span> : null}
    </>
  );
}
