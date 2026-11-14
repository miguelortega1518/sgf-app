// Textos legibles de auditoría para plantillas y sus tareas.
// Funciones puras: las rutas de src/app/api/templates las usan para previousValue/newValue.

type FieldSpec<K extends string> = readonly { key: K; label: string; reference?: boolean }[];

type TemplateState = {
  name: string;
  periodicity: string;
  targetCycleDays: number;
  autoGenerate: boolean;
  active: boolean;
};

type TaskTemplateState = {
  taskName: string;
  order: number;
  businessDayLimit: number;
  requiresApproval: boolean;
  requiresEvidence: boolean;
  applies: boolean;
  instructions: string | null;
  doneDefinition: string | null;
  notApplicableReason: string | null;
  companyId: string | null;
  defaultResponsibleId: string | null;
  alternateId: string | null;
  reviewerId: string | null;
};

export type AuditChange = { previousValue: string; newValue: string };

const TEMPLATE_FIELDS: FieldSpec<keyof TemplateState> = [
  { key: 'name', label: 'Nombre' },
  { key: 'periodicity', label: 'Periodicidad' },
  { key: 'targetCycleDays', label: 'Días de ciclo' },
  { key: 'autoGenerate', label: 'Generación automática' },
  { key: 'active', label: 'Activa' },
];

// Las referencias a companies/persons se muestran sin UUID.
const TASK_TEMPLATE_FIELDS: FieldSpec<keyof TaskTemplateState> = [
  { key: 'taskName', label: 'Nombre' },
  { key: 'order', label: 'Orden' },
  { key: 'businessDayLimit', label: 'Días hábiles' },
  { key: 'requiresApproval', label: 'Requiere aprobación' },
  { key: 'requiresEvidence', label: 'Requiere evidencia' },
  { key: 'applies', label: 'Aplica' },
  { key: 'instructions', label: 'Instrucciones' },
  { key: 'doneDefinition', label: 'Definición de hecho' },
  { key: 'notApplicableReason', label: 'Motivo de no aplica' },
  { key: 'companyId', label: 'Empresa', reference: true },
  { key: 'defaultResponsibleId', label: 'Responsable', reference: true },
  { key: 'alternateId', label: 'Suplente', reference: true },
  { key: 'reviewerId', label: 'Revisor', reference: true },
];

/** '<plantilla> › <tarea>' */
export function templateTaskLabel(templateName: string, taskName: string): string {
  return `${templateName} › ${taskName}`;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function formatValue(v: unknown, reference: boolean): string {
  if (reference) return isEmpty(v) ? 'sin asignar' : 'asignado';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (isEmpty(v)) return 'vacío';
  return String(v);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return a === b;
}

function describeChanges<K extends string>(
  prefix: string,
  fields: FieldSpec<K>,
  current: Record<K, unknown>,
  input: Partial<Record<K, unknown>>,
): AuditChange | null {
  const before: string[] = [];
  const after: string[] = [];
  for (const { key, label, reference = false } of fields) {
    if (!Object.hasOwn(input, key)) continue;
    const next = input[key];
    if (next === undefined) continue;
    const prev = current[key];
    if (sameValue(prev, next)) continue;
    before.push(`${label}: ${formatValue(prev, reference)}`);
    after.push(`${label}: ${formatValue(next, reference)}`);
  }
  if (before.length === 0) return null;
  return {
    previousValue: `${prefix}: ${before.join('; ')}`,
    newValue: `${prefix}: ${after.join('; ')}`,
  };
}

/** Diferencias legibles de una plantilla; null si ningún campo del input cambia. */
export function describeTemplateChanges(
  current: TemplateState,
  input: Partial<TemplateState>,
): AuditChange | null {
  return describeChanges(current.name, TEMPLATE_FIELDS, current, input);
}

/** Diferencias legibles de una tarea de plantilla; null si ningún campo del input cambia. */
export function describeTaskTemplateChanges(
  templateName: string,
  current: TaskTemplateState,
  input: Partial<TaskTemplateState>,
): AuditChange | null {
  return describeChanges(
    templateTaskLabel(templateName, current.taskName),
    TASK_TEMPLATE_FIELDS,
    current,
    input,
  );
}
