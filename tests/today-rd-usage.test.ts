import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

const ROOT = resolve(__dirname, '..');
const UTC_DATE = 'toISOString().slice(0, 10)';

// Excepciones en src/lib donde usar la fecha UTC es deliberado:
// - validation.ts parsea con 'T00:00:00Z' a propósito para comprobar que una
//   fecha ISO YYYY-MM-DD no desborda (p. ej. 2026-02-30); comparar en UTC es lo correcto.
// - metrics.ts agrupa semanas a partir del lunes 00:00 UTC (weekStart) de forma
//   coherente en todo el cálculo; pasarlo a hora RD queda fuera de alcance.
const UTC_ALLOWED = ['src/lib/validation.ts', 'src/lib/metrics.ts'];

// Ruta relativa a la raíz del repo, siempre con '/'.
function toRepoPath(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

// Guarda de regresión estática: estas vistas deben calcular "hoy" en hora RD
// (todayRD / isOverdue de @/lib/date-utils), no con la fecha UTC.
const FILES = [
  'src/components/tasks/kanban-board.tsx',
  'src/app/(app)/espacios/[id]/page.tsx',
  'src/app/(app)/mi-equipo/page.tsx',
  'src/app/(app)/calendario/page.tsx',
  'src/app/(app)/admin/feriados/page.tsx',
  'src/app/(app)/admin/plantillas/[id]/page.tsx',
];

// Recorre un directorio de forma recursiva y devuelve las rutas de los .ts/.tsx.
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('el código usa la fecha RD', () => {
  it.each(FILES)('%s no calcula "hoy" en UTC', (path) => {
    const src = readFileSync(resolve(__dirname, '..', path), 'utf8');
    expect(src).not.toContain('toISOString().slice(0, 10)');
    expect(src).toMatch(/from '@\/lib\/date-utils'/);
  });

  it('ningún archivo de src/app/(app) usa toISOString().slice(0, 10)', () => {
    const files = listSourceFiles(resolve(__dirname, '..', 'src/app/(app)'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) =>
      readFileSync(file, 'utf8').includes('toISOString().slice(0, 10)'),
    );
    expect(offenders).toEqual([]);
  });

  it('ningún archivo de src/app/api usa toISOString().slice(0, 10)', () => {
    const files = listSourceFiles(resolve(ROOT, 'src/app/api'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files
      .filter((file) => readFileSync(file, 'utf8').includes(UTC_DATE))
      .map(toRepoPath);
    expect(offenders).toEqual([]);
  });

  it('src/lib sólo usa toISOString().slice(0, 10) en las excepciones documentadas', () => {
    const files = listSourceFiles(resolve(ROOT, 'src/lib'));
    expect(files.map(toRepoPath)).toContain('src/lib/task-transitions.ts');
    const offenders = files
      .map(toRepoPath)
      .filter((file) => !UTC_ALLOWED.includes(file))
      .filter((file) => readFileSync(resolve(ROOT, file), 'utf8').includes(UTC_DATE));
    expect(offenders).toEqual([]);
  });

  it('kanban-board no define un isOverdue local', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src/components/tasks/kanban-board.tsx'), 'utf8');
    expect(src).not.toMatch(/function isOverdue\s*\(/);
    expect(src).toContain('isOverdue(task.dueDate, task.status)');
  });
});
