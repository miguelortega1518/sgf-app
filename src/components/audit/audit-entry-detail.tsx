// Componentes de presentación puros (sin hooks ni fetch) para el detalle de una
// entrada de auditoría. Todo el contenido va como texto JSX: React lo escapa.
// Con previousValue y newValue se muestra «antes → después»; con uno solo (altas:
// solo newValue; bajas: solo previousValue) se muestra ese valor sin flecha.
// El reason se traduce con delayReasonLabel: los códigos de motivo de retraso se
// muestran con su etiqueta y el texto libre se muestra tal cual.

import { delayReasonLabel } from '@/lib/labels';

export type AuditEntryDetailProps = {
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
};

/**
 * Texto del cambio: «prev → new» si hay ambos, el único valor si solo hay uno y
 * null si no hay ninguno. Una cadena vacía cuenta como valor ausente.
 */
function formatAuditChange(previousValue: string | null, newValue: string | null): string | null {
  if (previousValue && newValue) return `${previousValue} → ${newValue}`;
  return previousValue || newValue || null;
}

/**
 * Celda «Detalle» de la bitácora: «antes → después» (o el único valor, si solo hay
 * uno) y, si existe, el reason (traducido) debajo.
 */
export function AuditLogDetail({ previousValue, newValue, reason }: AuditEntryDetailProps) {
  const change = formatAuditChange(previousValue, newValue);

  if (!change && !reason) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  if (!change) {
    return <span className="text-xs text-gray-500">{delayReasonLabel(reason ?? '')}</span>;
  }

  return (
    <>
      <span className="text-xs text-gray-500">{change}</span>
      {reason ? <span className="block text-xs text-gray-400">{delayReasonLabel(reason)}</span> : null}
    </>
  );
}

/**
 * Historial «Actividad» de la tarea: «(antes → después)» (o «(valor)», si solo hay
 * uno) y el reason (traducido) como texto secundario.
 */
export function TaskAuditDetail({ previousValue, newValue, reason }: AuditEntryDetailProps) {
  const change = formatAuditChange(previousValue, newValue);

  if (!change && !reason) return null;

  return (
    <>
      {change ? <span className="text-gray-400 ml-1">({change})</span> : null}
      {reason ? <span className="text-gray-400 ml-1 italic">— {delayReasonLabel(reason)}</span> : null}
    </>
  );
}
