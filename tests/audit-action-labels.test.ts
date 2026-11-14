import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { AUDIT_ACTION_LABEL, auditActionLabel, auditActionChip } from '../src/lib/labels';

const ROOT = resolve(__dirname, '..');

// La definición de logAudit no es una llamada.
const EXCLUDED = ['src/lib/audit.ts'];

const KNOWN_ACTIONS = [
  'task_created',
  'status_changed',
  'responsible_changed',
  'due_date_changed',
  'task_approved',
  'task_approved_admin_override',
  'comment_edited',
  'comment_deleted',
  'evidence_added',
  'evidence_removed',
  'dependency_added',
  'dependency_removed',
  'space_created',
  'space_updated',
  'milestone_date_changed',
  'milestone_created',
  'milestone_deleted',
  'milestone_renamed',
  'milestone_completion_changed',
  'subtask_added',
  'subtask_removed',
  'subtask_renamed',
  'subtask_completion_changed',
];

// Ruta relativa a la raíz del repo, siempre con '/'.
function toRepoPath(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

// Recorre un directorio de forma recursiva y devuelve las rutas de los .ts/.tsx.
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Toma la expresión de `action:` hasta la siguiente coma de nivel superior,
// salto de línea o `}` que cierre el objeto.
function readExpression(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return src.slice(start, i);
      depth--;
    } else if ((ch === ',' || ch === '\n') && depth === 0) return src.slice(start, i);
  }
  return src.slice(start);
}

type Emission = { file: string; expr: string; actions: string[]; literalOnly: boolean };

function extractEmissions(): { files: string[]; emissions: Emission[] } {
  const files = listSourceFiles(resolve(ROOT, 'src'))
    .map(toRepoPath)
    .filter((file) => !EXCLUDED.includes(file))
    .filter((file) => readFileSync(resolve(ROOT, file), 'utf8').includes('logAudit('));

  const emissions: Emission[] = [];
  for (const file of files) {
    const src = readFileSync(resolve(ROOT, file), 'utf8');
    let idx = src.indexOf('logAudit(');
    while (idx !== -1) {
      const actionIdx = src.indexOf('action:', idx);
      if (actionIdx === -1) {
        emissions.push({ file, expr: '<sin action:>', actions: [], literalOnly: false });
        break;
      }
      const expr = readExpression(src, actionIdx + 'action:'.length).trim();
      const actions = [...expr.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      // Sin los literales, sólo pueden quedar `?`, `:`, paréntesis, espacios
      // y, como mucho, un identificador de condición del ternario.
      const rest = expr.replace(/'[a-z_]+'/g, '').replace(/[?:()\s]/g, ' ').trim();
      const literalOnly = actions.length > 0
        && (rest === '' || (actions.length >= 2 && /^!?[A-Za-z_$][\w$]*$/.test(rest)));
      emissions.push({ file, expr, actions, literalOnly });
      idx = src.indexOf('logAudit(', actionIdx);
    }
  }
  return { files, emissions };
}

describe('acciones de auditoría', () => {
  const { files, emissions } = extractEmissions();
  const extracted = new Set(emissions.flatMap((e) => e.actions));

  it('el extractor encuentra todas las acciones conocidas', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const a of KNOWN_ACTIONS) expect(extracted, `falta ${a}`).toContain(a);
    expect(extracted).not.toContain('auditLog.action');
    for (const a of extracted) expect(a).toMatch(/^[a-z_]+$/);
  });

  it('el valor de action: en logAudit sólo contiene literales de string', () => {
    const offenders = emissions
      .filter((e) => !e.literalOnly)
      .map((e) => `${e.file}: action: ${e.expr} (usa literales de string)`);
    expect(offenders).toEqual([]);
  });

  it('toda acción emitida por logAudit tiene etiqueta en AUDIT_ACTION_LABEL', () => {
    const offenders = emissions.flatMap((e) =>
      e.actions
        .filter((a) => !Object.hasOwn(AUDIT_ACTION_LABEL, a))
        .map((a) => `${e.file}: ${a}`),
    );
    expect(offenders).toEqual([]);
  });

  it('milestone_date_changed tiene etiqueta propia', () => {
    expect(AUDIT_ACTION_LABEL.milestone_date_changed).toBe('Cambio de fecha de hito');
    expect(auditActionLabel('milestone_date_changed')).toBe('Cambio de fecha de hito');
    expect(auditActionLabel('milestone_date_changed')).not.toBe(auditActionLabel('accion_inexistente'));
  });

  it.each([
    ['milestone_created', 'Hito creado', 'bg-sky-100 text-sky-700'],
    ['milestone_deleted', 'Hito eliminado', 'bg-red-100 text-red-700'],
    ['milestone_renamed', 'Hito renombrado', 'bg-amber-100 text-amber-700'],
    ['milestone_completion_changed', 'Cambio de estado de hito', 'bg-green-100 text-green-700'],
  ])('%s tiene etiqueta y chip propios', (action, label, chip) => {
    expect(AUDIT_ACTION_LABEL[action]).toBe(label);
    expect(auditActionLabel(action)).toBe(label);
    expect(auditActionLabel(action)).not.toBe(auditActionLabel('accion_inexistente'));
    expect(auditActionChip(action)).toBe(chip);
  });

  it.each([
    ['subtask_added', 'Subtarea añadida', 'bg-sky-100 text-sky-700'],
    ['subtask_removed', 'Subtarea eliminada', 'bg-red-100 text-red-700'],
    ['subtask_renamed', 'Subtarea renombrada', 'bg-amber-100 text-amber-700'],
    ['subtask_completion_changed', 'Cambio de estado de subtarea', 'bg-green-100 text-green-700'],
  ])('%s tiene etiqueta y chip propios', (action, label, chip) => {
    expect(AUDIT_ACTION_LABEL[action]).toBe(label);
    expect(auditActionLabel(action)).toBe(label);
    expect(auditActionLabel(action)).not.toBe(auditActionLabel('accion_inexistente'));
    expect(auditActionChip(action)).toBe(chip);
  });

  it('las acciones heredadas siguen legibles', () => {
    expect(AUDIT_ACTION_LABEL.space_health_updated).toBe('Actualización de salud');
    expect(AUDIT_ACTION_LABEL.space_closed).toBe('Proyecto cerrado');
  });
});

describe('auditActionLabel / auditActionChip', () => {
  it('auditActionLabel devuelve español y es seguro frente al prototipo', () => {
    const FALLBACK = auditActionLabel('accion_inexistente');
    const label = auditActionLabel('evidence_added');
    expect(typeof label).toBe('string');
    expect(label).not.toBe('evidence_added');
    expect(label).not.toBe(FALLBACK);
    expect(FALLBACK).toBe('Acción registrada');
    for (const a of ['constructor', '__proto__', 'toString', 'accion_inexistente']) {
      const v = auditActionLabel(a);
      expect(typeof v).toBe('string');
      expect(v).toBe(FALLBACK);
      expect(v).not.toBe(a);
    }
  });

  it('auditActionChip devuelve la clase de la Bitácora y un fallback gris', () => {
    expect(auditActionChip('status_changed')).toBe('bg-blue-100 text-blue-700');
    expect(auditActionChip('due_date_changed')).toBe('bg-amber-100 text-amber-700');
    expect(auditActionChip('responsible_changed')).toBe('bg-purple-100 text-purple-700');
    expect(auditActionChip('task_approved')).toBe('bg-green-100 text-green-700');
    expect(auditActionChip('task_approved_admin_override')).toBe('bg-green-100 text-green-700');
    expect(auditActionChip('milestone_date_changed')).toBe('bg-amber-100 text-amber-700');
    for (const a of ['constructor', '__proto__', 'toString', 'x']) {
      expect(auditActionChip(a)).toBe('bg-gray-100 text-gray-600');
    }
  });
});

describe('las vistas usan el vocabulario de labels.ts', () => {
  const PAGES = ['src/app/(app)/tareas/[id]/page.tsx', 'src/app/(app)/admin/bitacora/page.tsx'];

  it('ninguna página de src/app define ACTION_LABELS/ACTION_COLORS', () => {
    const files = listSourceFiles(resolve(ROOT, 'src/app'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .filter((file) => {
        const src = readFileSync(file, 'utf8');
        return src.includes('ACTION_LABELS') || src.includes('ACTION_COLORS');
      })
      .map(toRepoPath);
    expect(offenders).toEqual([]);
  });

  it.each(PAGES)('%s importa auditActionLabel desde @/lib/labels y no cae al identificador', (path) => {
    const src = readFileSync(resolve(ROOT, path), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*\bauditActionLabel\b[^}]*\}\s*from '@\/lib\/labels'/);
    expect(src).toContain('auditActionLabel(entry.action)');
    expect(src).not.toContain('|| entry.action');
  });

  it('la Actividad de la tarea usa redactedCommentLabel para los registros redactados', () => {
    const src = readFileSync(resolve(ROOT, 'src/app/(app)/tareas/[id]/page.tsx'), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*\bredactedCommentLabel\b[^}]*\}\s*from '@\/lib\/labels'/);
    expect(src).toContain('redactedCommentLabel(entry.action, entry.reason)');
    expect(src).toContain('redacted={entry.redacted}');
  });

  it('la Bitácora importa auditActionChip desde @/lib/labels', () => {
    const src = readFileSync(resolve(ROOT, 'src/app/(app)/admin/bitacora/page.tsx'), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*\bauditActionChip\b[^}]*\}\s*from '@\/lib\/labels'/);
    expect(src).toContain('auditActionChip(entry.action)');
  });
});
