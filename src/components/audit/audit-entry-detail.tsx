// Componentes de presentación puros (sin hooks ni fetch) para el detalle de una
// entrada de auditoría. Todo el contenido va como texto JSX: React lo escapa.
// Con previousValue y newValue se muestra «antes → después»; con uno solo (altas,
// bajas, p. ej. milestone_created / milestone_deleted) se muestra ese valor sin flecha.
// El reason se traduce con delayReasonLabel: los códigos de motivo de retraso se
// muestran con su etiqueta y el texto libre se muestra tal cual.

import { delayReasonLabel } from '@/lib/labels';

export type AuditEntryDetailProps = {
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
};

/**
 * Texto de los valores de una entrada: «antes → después» si existen los dos, el único
 * valor si solo hay uno, o null si no hay ninguno. La cadena vacía cuenta como ausente.
 */
function formatAuditValues(previousValue: string | null, newValue: string | null): string | null {
  if (previousValue && newValue) return `${previousValue} → ${newValue}`;
  return previousValue || newValue || null;
}

/**
 * Celda «Detalle» de la bitácora: «antes → después» (o el único valor, si solo hay uno)
 * y, si existe, el reason (traducido) debajo.
 */
export function AuditLogDetail({ previousValue, newValue, reason }: AuditEntryDetailProps) {
  const detail = formatAuditValues(previousValue, newValue);

  if (!detail && !reason) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  if (!detail) {
    return <span className="text-xs text-gray-500">{delayReasonLabel(reason ?? '')}</span>;
  }

  return (
    <>
      <span className="text-xs text-gray-500">{detail}</span>
      {reason ? <span className="block text-xs text-gray-400">{delayReasonLabel(reason)}</span> : null}
    </>
  );
}

export type TaskAuditDetailProps = AuditEntryDetailProps & {
  /** Registro redactado por la API para quien no es admin: no se muestra contenido. */
  redacted?: boolean;
};

/**
 * Historial «Actividad» de la tarea: «(antes → después)» (o «(valor)» si solo hay uno)
 * y el reason (traducido) como texto secundario.
 */
export function TaskAuditDetail({ previousValue, newValue, reason, redacted }: TaskAuditDetailProps) {
  // Debe ir antes de cualquier rama de render: un registro redactado no muestra valores ni reason.
  if (redacted) return null;

  const detail = formatAuditValues(previousValue, newValue);

  if (!detail && !reason) return null;

  return (
    <>
      {detail ? <span className="text-gray-400 ml-1">({detail})</span> : null}
      {reason ? <span className="text-gray-400 ml-1 italic">— {delayReasonLabel(reason)}</span> : null}
    </>
  );
}
