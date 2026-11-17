/**
 * Importador CSV de tareas: lógica pura, sin BD. Dos etapas:
 *  1. analyzeCsvImport(csv): tamaño, filas, cabecera y normalización/validación de cada fila.
 *     Devuelve además los correos y los hitos citados, para que la ruta los busque en bloque.
 *  2. resolveCsvImport(analysis, ctx): resuelve personas e hitos con Maps ya cargados.
 * Es la base de los importadores de otras herramientas (Jira, Linear, GitHub Issues).
 */

import { CsvParseError, parseCsv, type CsvParseResult } from './csv';
import { isValidIsoDate } from './validation';
import {
  IMPORT_CSV_MAX_BYTES,
  IMPORT_CSV_MAX_ROWS,
  TASK_KINDS,
  TASK_PRIORITIES,
  importRowSchema,
  type ImportRowFields,
} from './schemas/task-import';

export type TaskPriorityCode = (typeof TASK_PRIORITIES)[number];
export type TaskKindCode = (typeof TASK_KINDS)[number];

/** Columnas canónicas (en español) que entiende el importador. */
export const IMPORT_COLUMNS = [
  'titulo', 'descripcion', 'responsable', 'revisor', 'fecha_limite',
  'prioridad', 'tipo', 'estimacion', 'etiquetas', 'hito',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Error o aviso: `line` es la línea física del CSV (la cabecera es la 1); null = general. */
export type ImportIssue = { line: number | null; column: ImportColumn | null; message: string };

export type ImportMember = { id: string; name: string; email: string };
export type ImportMilestone = { id: string; name: string };

export type AnalyzedImportRow = {
  line: number;
  /** null si la fila no pasó la validación de campos. */
  fields: ImportRowFields | null;
  responsibleEmail: string | null;
  reviewerEmail: string | null;
  milestoneName: string | null;
};

export type CsvImportAnalysis = {
  rows: AnalyzedImportRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Correos citados, en minúsculas y sin repetir. */
  emails: string[];
  /** Nombres de hito citados, sin repetir. */
  milestoneNames: string[];
  /** Filas de datos del CSV. */
  total: number;
  hasResponsibleColumn: boolean;
};

export type ImportContext = {
  /** Personas elegibles (activas y con permiso de escritura), por correo en minúsculas. */
  membersByEmail: Map<string, ImportMember>;
  /** Hitos del proyecto por nombre exacto. */
  milestonesByName: Map<string, ImportMilestone[]>;
  defaultResponsible?: ImportMember;
  /** Líder del proyecto si es elegible; null = sin revisor por defecto. */
  defaultReviewerId: string | null;
};

export type ResolvedImportRow = {
  line: number;
  title: string;
  description: string | null;
  responsible: ImportMember;
  reviewer: { id: string; name: string } | null;
  dueDate: string | null;
  priority: TaskPriorityCode;
  kind: TaskKindCode;
  estimate: number | null;
  labels: string[];
  milestone: ImportMilestone | null;
};

export type CsvImportResult = {
  rows: ResolvedImportRow[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  total: number;
};

/** «  Fecha Límite » → «fecha_limite»: minúsculas, sin tildes, espacios y guiones → `_`. */
export function normalizeHeader(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');
}

const STATUS_COLUMN = 'estado';

/** Alias normalizados → columna canónica. `estado` sólo genera un aviso. */
export const COLUMN_ALIASES: Record<string, ImportColumn | typeof STATUS_COLUMN> = {
  titulo: 'titulo', title: 'titulo', summary: 'titulo', name: 'titulo', nombre: 'titulo',
  descripcion: 'descripcion', description: 'descripcion', desc: 'descripcion', body: 'descripcion',
  responsable: 'responsable', assignee: 'responsable', owner: 'responsable', asignado: 'responsable',
  responsible: 'responsable', assigned_to: 'responsable',
  revisor: 'revisor', reviewer: 'revisor',
  fecha_limite: 'fecha_limite', fecha: 'fecha_limite', vencimiento: 'fecha_limite', due: 'fecha_limite',
  due_date: 'fecha_limite', duedate: 'fecha_limite', deadline: 'fecha_limite',
  prioridad: 'prioridad', priority: 'prioridad',
  tipo: 'tipo', type: 'tipo', kind: 'tipo', issue_type: 'tipo',
  estimacion: 'estimacion', estimate: 'estimacion', estimation: 'estimacion', points: 'estimacion',
  story_points: 'estimacion', puntos: 'estimacion',
  etiquetas: 'etiquetas', labels: 'etiquetas', tags: 'etiquetas',
  hito: 'hito', milestone: 'hito',
  estado: STATUS_COLUMN, status: STATUS_COLUMN, state: STATUS_COLUMN,
};

const PRIORITY_ALIASES: Record<string, TaskPriorityCode> = {
  critica: 'critica', critical: 'critica',
  alta: 'alta', high: 'alta',
  normal: 'normal', medium: 'normal', media: 'normal',
  baja: 'baja', low: 'baja',
};

const KIND_ALIASES: Record<string, TaskKindCode> = {
  ...Object.fromEntries(TASK_KINDS.map(k => [k, k])),
  story: 'feature', task: 'feature', historia: 'feature', tarea: 'feature',
  improvement: 'mejora', enhancement: 'mejora',
  debt: 'deuda', tech_debt: 'deuda', deuda_tecnica: 'deuda',
};

function lookup<T>(map: Record<string, T>, key: string): T | null {
  return Object.hasOwn(map, key) ? map[key] : null;
}

/** `YYYY-MM-DD` o `DD/MM/YYYY` (día y mes de 1 o 2 dígitos) → ISO; null si no es una fecha real. */
export function parseImportDate(value: string): string | null {
  const v = value.trim();
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    iso = v;
  } else {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return iso && isValidIsoDate(iso) ? iso : null;
}

/** Prioridad en español o inglés; vacía = normal; null si no se reconoce. */
export function parseImportPriority(value: string): TaskPriorityCode | null {
  const key = normalizeHeader(value);
  if (key === '') return 'normal';
  return lookup(PRIORITY_ALIASES, key);
}

/** Tipo de TASK_KINDS o alias en inglés; vacío = feature; null si no se reconoce. */
export function parseImportKind(value: string): TaskKindCode | null {
  const key = normalizeHeader(value);
  if (key === '') return 'feature';
  return lookup(KIND_ALIASES, key);
}

/** Etiquetas separadas por `;`, `|` o `,`, recortadas, sin vacías ni repetidas. */
export function parseImportLabels(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(/[;|,]/)) {
    const label = part.trim();
    if (label) seen.add(label);
  }
  return [...seen];
}

const FIELD_COLUMN: Record<keyof ImportRowFields, ImportColumn> = {
  title: 'titulo',
  description: 'descripcion',
  dueDate: 'fecha_limite',
  priority: 'prioridad',
  kind: 'tipo',
  estimate: 'estimacion',
  labels: 'etiquetas',
};

const NO_DATA_ROWS = 'El CSV no tiene filas de datos';
const MAX_BYTES_MESSAGE =
  `El CSV supera el tamaño máximo de ${IMPORT_CSV_MAX_BYTES / (1024 * 1024)} MB (${IMPORT_CSV_MAX_BYTES} bytes)`;
const INVALID_UTF8_WARNING =
  'El archivo tiene caracteres que no son UTF-8: guárdalo como «CSV UTF-8» para conservar tildes y eñes';

function emptyAnalysis(errors: ImportIssue[], total = 0, warnings: ImportIssue[] = []): CsvImportAnalysis {
  return { rows: [], errors, warnings, emails: [], milestoneNames: [], total, hasResponsibleColumn: false };
}

/** Etapa 1: tamaño, filas, cabecera y validación de los valores de cada fila. */
export function analyzeCsvImport(csv: string): CsvImportAnalysis {
  if (new TextEncoder().encode(csv).length > IMPORT_CSV_MAX_BYTES) {
    return emptyAnalysis([{ line: null, column: null, message: MAX_BYTES_MESSAGE }]);
  }

  let parsed: CsvParseResult;
  try {
    parsed = parseCsv(csv);
  } catch (err) {
    if (err instanceof CsvParseError) return emptyAnalysis([{ line: err.line, column: null, message: err.message }]);
    throw err;
  }

  if (parsed.rows.length === 0) {
    return emptyAnalysis([{ line: null, column: null, message: NO_DATA_ROWS }]);
  }
  if (parsed.rows.length > IMPORT_CSV_MAX_ROWS) {
    return emptyAnalysis([{
      line: null,
      column: null,
      message: `El CSV tiene ${parsed.rows.length} filas de datos; el máximo es ${IMPORT_CSV_MAX_ROWS}`,
    }]);
  }

  const total = parsed.rows.length;
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  if (csv.includes('�')) warnings.push({ line: null, column: null, message: INVALID_UTF8_WARNING });

  // Cabecera → índice de cada columna canónica.
  const columnIndex = new Map<ImportColumn, number>();
  let statusWarned = false;
  parsed.header.forEach((rawName, index) => {
    const key = normalizeHeader(rawName);
    if (key === '') return;
    const target = lookup(COLUMN_ALIASES, key);
    if (target === null) {
      warnings.push({ line: 1, column: null, message: `La columna «${rawName.trim()}» no se reconoce y se ignora` });
    } else if (target === STATUS_COLUMN) {
      if (!statusWarned) {
        warnings.push({ line: 1, column: null, message: 'El estado no se importa: todas las tareas empiezan en Por hacer' });
        statusWarned = true;
      }
    } else if (columnIndex.has(target)) {
      const previous = parsed.header[columnIndex.get(target)!].trim();
      errors.push({
        line: 1,
        column: target,
        message: `Las columnas «${previous}» y «${rawName.trim()}» corresponden al mismo campo (${target})`,
      });
    } else {
      columnIndex.set(target, index);
    }
  });
  if (!columnIndex.has('titulo')) {
    errors.push({ line: 1, column: 'titulo', message: 'Falta la columna titulo (o title)' });
  }
  if (errors.length) return emptyAnalysis(errors, total, warnings);

  const rows: AnalyzedImportRow[] = [];
  const emails = new Set<string>();
  const milestoneNames = new Set<string>();

  for (const { line, cells } of parsed.rows) {
    const cell = (column: ImportColumn) => {
      const index = columnIndex.get(column);
      return index === undefined ? '' : (cells[index] ?? '').trim();
    };

    const dueDate = cell('fecha_limite');
    const priority = cell('prioridad');
    const kind = cell('tipo');
    const estimate = cell('estimacion');
    const candidate = {
      title: cell('titulo'),
      description: cell('descripcion') || null,
      // Lo que no se reconoce se pasa crudo para que el esquema lo rechace con su mensaje.
      dueDate: dueDate === '' ? null : parseImportDate(dueDate) ?? dueDate,
      priority: parseImportPriority(priority) ?? priority,
      kind: parseImportKind(kind) ?? kind,
      estimate: estimate === '' ? null : /^\d+$/.test(estimate) ? Number(estimate) : Number.NaN,
      labels: parseImportLabels(cell('etiquetas')),
    };

    const result = importRowSchema.safeParse(candidate);
    let fields: ImportRowFields | null = null;
    if (result.success) {
      fields = result.data;
    } else {
      const seen = new Set<string>();
      for (const issue of result.error.issues) {
        const column = FIELD_COLUMN[issue.path[0] as keyof ImportRowFields] ?? null;
        const key = `${column}|${issue.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        errors.push({ line, column, message: issue.message });
      }
    }

    const responsibleEmail = cell('responsable').toLowerCase() || null;
    const reviewerEmail = cell('revisor').toLowerCase() || null;
    const milestoneName = cell('hito') || null;
    if (responsibleEmail) emails.add(responsibleEmail);
    if (reviewerEmail) emails.add(reviewerEmail);
    if (milestoneName) milestoneNames.add(milestoneName);

    rows.push({ line, fields, responsibleEmail, reviewerEmail, milestoneName });
  }

  return {
    rows,
    errors,
    warnings,
    emails: [...emails],
    milestoneNames: [...milestoneNames],
    total,
    hasResponsibleColumn: columnIndex.has('responsable'),
  };
}

function notMember(email: string): string {
  return `${email} no es miembro del proyecto con permiso de escritura`;
}

/** Etapa 2: resuelve responsable, revisor e hito de cada fila con búsquedas en Map (O(filas)). */
export function resolveCsvImport(analysis: CsvImportAnalysis, ctx: ImportContext): CsvImportResult {
  const errors: ImportIssue[] = [...analysis.errors];
  const rows: ResolvedImportRow[] = [];

  const byId = new Map<string, ImportMember>();
  for (const member of ctx.membersByEmail.values()) byId.set(member.id, member);
  if (ctx.defaultResponsible) byId.set(ctx.defaultResponsible.id, ctx.defaultResponsible);
  const defaultReviewer = ctx.defaultReviewerId
    ? { id: ctx.defaultReviewerId, name: byId.get(ctx.defaultReviewerId)?.name ?? '' }
    : null;

  const missingResponsibleColumn = !analysis.hasResponsibleColumn && !ctx.defaultResponsible;
  if (missingResponsibleColumn && analysis.rows.length > 0) {
    errors.push({
      line: 1,
      column: 'responsable',
      message: 'Falta la columna responsable y no se eligió un responsable por defecto',
    });
  }

  for (const row of analysis.rows) {
    const rowErrors: ImportIssue[] = [];

    let responsible: ImportMember | undefined;
    if (row.responsibleEmail) {
      responsible = ctx.membersByEmail.get(row.responsibleEmail);
      if (!responsible) rowErrors.push({ line: row.line, column: 'responsable', message: notMember(row.responsibleEmail) });
    } else if (ctx.defaultResponsible) {
      responsible = ctx.defaultResponsible;
    } else if (!missingResponsibleColumn) {
      rowErrors.push({ line: row.line, column: 'responsable', message: 'Falta el responsable y no se eligió uno por defecto' });
    }

    let reviewer = defaultReviewer;
    if (row.reviewerEmail) {
      const found = ctx.membersByEmail.get(row.reviewerEmail);
      reviewer = found ? { id: found.id, name: found.name } : null;
      if (!found) rowErrors.push({ line: row.line, column: 'revisor', message: notMember(row.reviewerEmail) });
    }

    let milestone: ImportMilestone | null = null;
    if (row.milestoneName) {
      const matches = ctx.milestonesByName.get(row.milestoneName) ?? [];
      if (matches.length === 1) {
        milestone = matches[0];
      } else if (matches.length === 0) {
        rowErrors.push({ line: row.line, column: 'hito', message: `No existe el hito «${row.milestoneName}» en el proyecto` });
      } else {
        rowErrors.push({
          line: row.line,
          column: 'hito',
          message: `Hay ${matches.length} hitos llamados «${row.milestoneName}» en el proyecto; renombra uno antes de importar`,
        });
      }
    }

    errors.push(...rowErrors);
    if (rowErrors.length || !row.fields || !responsible) continue;
    rows.push({
      line: row.line,
      title: row.fields.title,
      description: row.fields.description,
      responsible,
      reviewer,
      dueDate: row.fields.dueDate,
      priority: row.fields.priority,
      kind: row.fields.kind,
      estimate: row.fields.estimate,
      labels: row.fields.labels,
      milestone,
    });
  }

  // Orden por línea (los generales primero); sort es estable, así que dentro de una fila se
  // conserva el orden de las columnas.
  errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { rows, errors, warnings: [...analysis.warnings], total: analysis.total };
}

/** Plantilla descargable: cabecera en español y dos filas de ejemplo con correos ficticios. */
export const CSV_IMPORT_TEMPLATE = [
  'titulo,descripcion,responsable,revisor,fecha_limite,prioridad,tipo,estimacion,etiquetas,hito',
  'Configurar el pipeline de CI,"Lint, tests y build en cada PR",ana@ejemplo.com,,2026-12-15,alta,feature,3,devops,',
  'Corregir el login en Safari,El botón Entrar no responde,beto@ejemplo.com,ana@ejemplo.com,20/12/2026,critica,bug,2,auth;frontend,',
].join('\n') + '\n';
