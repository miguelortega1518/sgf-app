import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Guarda de regresión estática: estas vistas deben calcular "hoy" en hora RD
// (todayRD / isOverdue de @/lib/date-utils), no con la fecha UTC.
const FILES = [
  'src/components/tasks/kanban-board.tsx',
  'src/app/(app)/espacios/[id]/page.tsx',
  'src/app/(app)/mi-equipo/page.tsx',
  'src/app/(app)/calendario/page.tsx',
];

describe('vistas de tareas usan la fecha RD', () => {
  it.each(FILES)('%s no calcula "hoy" en UTC', (path) => {
    const src = readFileSync(resolve(__dirname, '..', path), 'utf8');
    expect(src).not.toContain('toISOString().slice(0, 10)');
    expect(src).toMatch(/from '@\/lib\/date-utils'/);
  });

  it('kanban-board no define un isOverdue local', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src/components/tasks/kanban-board.tsx'), 'utf8');
    expect(src).not.toMatch(/function isOverdue\s*\(/);
    expect(src).toContain('isOverdue(task.dueDate, task.status)');
  });
});
