// Componentes de presentación puros (sin hooks ni fetch) para el detalle de una
// entrada de auditoría. Todo el contenido va como texto JSX: React lo escapa.
// Con previousValue y newValue se muestra «antes → después»; con uno solo (altas,
// bajas, p. ej. milestone_created / milestone_deleted) se muestra ese valor sin flecha.
// El reason se traduce con delayReasonLabel: los códigos de motivo de retraso se
// muestran con su etiqueta y el texto libre se muestra tal cual.
// Con `action`, los valores JSON heredados de task_created ({ title, responsible }) y
// space_created ({ name, type }) se muestran legibles: el título, o «nombre (tipo)»;
// el UUID del responsable se omite. Si el valor no tiene la forma esperada, se muestra tal cual.

import { delayReasonLabel, SPACE_TYPE_LABEL } from '@/lib/labels';

export type AuditEntryDetailProps = {
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  /** Acción del registro (p. ej. 'task_created'); permite formatear valores JSON heredados. */
  action?: string;
};

/** Lee una clave propia (no del prototipo) del objeto como string no vacío. */
function ownNonEmptyString(obj: object, key: string): string | null {
  if (!Object.hasOwn(obj, key)) return null;
  const v: unknown = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * Texto legible de un valor guardado como JSON por task_created o space_created.
 * Cualquier otro caso (otra acción, JSON inválido, forma inesperada) devuelve el valor tal cual.
 */
function readableAuditValue(action: string | undefined, value: string | null): string | null {
  if (!value || (action !== 'task_created' && action !== 'space_created')) return value;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return value;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return value;

  if (action === 'task_created') {
    return ownNonEmptyString(parsed, 'title') ?? value;
  }

  const name = ownNonEmptyString(parsed, 'name');
  if (!name) return value;
  const type = ownNonEmptyString(parsed, 'type');
  if (!type) return name;
  const label = Object.hasOwn(SPACE_TYPE_LABEL, type) ? SPACE_TYPE_LABEL[type] : type;
  return `${name} (${label})`;
}

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
export function AuditLogDetail({ previousValue, newValue, reason, action }: AuditEntryDetailProps) {
  const detail = formatAuditValues(readableAuditValue(action, previousValue), readableAuditValue(action, newValue));

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
export function TaskAuditDetail({ previousValue, newValue, reason, redacted, action }: TaskAuditDetailProps) {
  // Debe ir antes de cualquier rama de render: un registro redactado no muestra valores ni reason.
  if (redacted) return null;

  const detail = formatAuditValues(readableAuditValue(action, previousValue), readableAuditValue(action, newValue));

  if (!detail && !reason) return null;

  return (
    <>
      {detail ? <span className="text-gray-400 ml-1">({detail})</span> : null}
      {reason ? <span className="text-gray-400 ml-1 italic">— {delayReasonLabel(reason)}</span> : null}
    </>
  );
}
