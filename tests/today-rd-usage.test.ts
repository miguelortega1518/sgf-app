import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

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

describe('vistas de tareas usan la fecha RD', () => {
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

  it('kanban-board no define un isOverdue local', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src/components/tasks/kanban-board.tsx'), 'utf8');
    expect(src).not.toMatch(/function isOverdue\s*\(/);
    expect(src).toContain('isOverdue(task.dueDate, task.status)');
  });
});
