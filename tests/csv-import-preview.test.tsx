import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CsvImportPreview,
  canConfirmImport,
  importedTasksText,
  issueText,
  type CsvImportPreviewData,
} from '../src/components/tasks/csv-import-preview';
import type { ResolvedImportRow } from '../src/lib/task-import';
import { IMPORT_CSV_PREVIEW_ROWS } from '../src/lib/schemas/task-import';
import { KIND_LABEL, PRIORITY_LABEL } from '../src/lib/labels';

function row(i: number, overrides: Partial<ResolvedImportRow> = {}): ResolvedImportRow {
  return {
    line: i + 1,
    title: `Tarea ${i}`,
    description: null,
    responsible: { id: `r${i}`, name: 'Ana Pérez', email: 'ana@ejemplo.com' },
    reviewer: null,
    dueDate: null,
    priority: 'normal',
    kind: 'feature',
    estimate: null,
    labels: [],
    milestone: null,
    ...overrides,
  };
}

function preview(overrides: Partial<CsvImportPreviewData> = {}): CsvImportPreviewData {
  return { rows: [row(1)], errors: [], warnings: [], total: 1, ...overrides };
}

function render(data: CsvImportPreviewData) {
  return renderToStaticMarkup(createElement(CsvImportPreview, { preview: data }));
}

describe('CsvImportPreview', () => {
  it('con 60 filas pinta las primeras 50 y el contador', () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(i + 1));
    const html = render(preview({ rows, total: 60 }));
    expect(IMPORT_CSV_PREVIEW_ROWS).toBe(50);
    expect(html).toContain('Tarea 50<');
    expect(html).not.toContain('Tarea 51<');
    expect((html.match(/<tr/g) ?? []).length).toBe(51);
    expect(html).toContain('Mostrando 50 de 60 filas');
  });

  it('sin más de 50 filas no muestra el contador', () => {
    const html = render(preview());
    expect(html).not.toContain('Mostrando');
  });

  it('pinta todos los campos de la fila con las etiquetas de labels.ts', () => {
    const html = render(preview({
      rows: [row(1, {
        title: 'Login con SSO',
        reviewer: { id: 'x', name: 'Lía Líder' },
        dueDate: '2026-03-15',
        priority: 'critica',
        kind: 'deuda',
        estimate: 5,
        labels: ['api', 'web'],
        milestone: { id: 'm', name: 'Beta' },
      })],
    }));
    expect(html).toContain('Login con SSO');
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('Lía Líder');
    expect(html).toContain('2026-03-15');
    expect(html).toContain(PRIORITY_LABEL.critica);
    expect(html).toContain(KIND_LABEL.deuda);
    expect(html).toContain('>5<');
    expect(html).toContain('api, web');
    expect(html).toContain('Beta');
  });

  it('lista los errores y, aparte, los avisos', () => {
    const html = render(preview({
      rows: [],
      errors: [{ line: 3, column: 'responsable', message: 'zoe@x.com no es miembro del proyecto con permiso de escritura' }],
      warnings: [{ line: 1, column: null, message: 'La columna «color» no se reconoce y se ignora' }],
      total: 2,
    }));
    expect(html).toContain('Línea 3 · responsable: zoe@x.com no es miembro del proyecto con permiso de escritura');
    expect(html).toContain('Línea 1: La columna «color» no se reconoce y se ignora');
    const errorsAt = html.indexOf('Línea 3');
    const warningsAt = html.indexOf('Línea 1:');
    expect(errorsAt).toBeGreaterThan(-1);
    expect(warningsAt).toBeGreaterThan(-1);
    expect(html).toMatch(/aria-labelledby="csv-import-errors"/);
    expect(html).toMatch(/aria-labelledby="csv-import-warnings"/);
  });

  it('issueText compone línea y columna cuando las hay', () => {
    expect(issueText({ line: 3, column: 'responsable', message: 'm' })).toBe('Línea 3 · responsable: m');
    expect(issueText({ line: 1, column: null, message: 'm' })).toBe('Línea 1: m');
    expect(issueText({ line: null, column: 'responsable', message: 'm' })).toBe('responsable: m');
    expect(issueText({ line: null, column: null, message: 'm' })).toBe('m');
  });
});

describe('canConfirmImport', () => {
  it('es false sin vista previa, con errores o con total 0', () => {
    expect(canConfirmImport(null)).toBe(false);
    expect(canConfirmImport(preview({ errors: [{ line: 2, column: 'titulo', message: 'x' }] }))).toBe(false);
    expect(canConfirmImport(preview({ rows: [], total: 0 }))).toBe(false);
  });

  it('es true sin errores y con filas, aunque haya avisos', () => {
    expect(canConfirmImport(preview())).toBe(true);
    expect(canConfirmImport(preview({ warnings: [{ line: 1, column: null, message: 'x' }] }))).toBe(true);
  });
});

describe('importedTasksText', () => {
  it('concuerda singular y plural', () => {
    expect(importedTasksText(1)).toBe('1 tarea importada');
    expect(importedTasksText(5)).toBe('5 tareas importadas');
    expect(importedTasksText(0)).toBe('0 tareas importadas');
  });
});
