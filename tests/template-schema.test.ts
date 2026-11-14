import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import {
  TEMPLATE_NAME_MAX,
  TEMPLATE_TEXT_MAX,
  clampTemplateName,
  createSpaceTemplateSchema,
  createTaskTemplateSchema,
  updateSpaceTemplateSchema,
  updateTaskTemplateSchema,
} from '../src/lib/schemas/template';

const baseCreateSpace = { name: 'Cierre', periodicity: 'mensual', targetCycleDays: 10 };
const baseUpdateSpace = {};
const baseCreateTask = {
  taskName: 'Conciliar',
  order: 1,
  businessDayLimit: 3,
  companyId: crypto.randomUUID(),
};
const baseUpdateTask = {};

describe('límites de longitud de plantillas', () => {
  it('exporta las constantes de límite', () => {
    expect(TEMPLATE_NAME_MAX).toBe(200);
    expect(TEMPLATE_TEXT_MAX).toBe(5000);
  });

  // [etiqueta, campo, esquema, payload base válido, límite]
  const cases: [string, string, ZodType, Record<string, unknown>, number][] = [
    ['createSpaceTemplateSchema', 'name', createSpaceTemplateSchema, baseCreateSpace, TEMPLATE_NAME_MAX],
    ['updateSpaceTemplateSchema', 'name', updateSpaceTemplateSchema, baseUpdateSpace, TEMPLATE_NAME_MAX],
    ['createTaskTemplateSchema', 'taskName', createTaskTemplateSchema, baseCreateTask, TEMPLATE_NAME_MAX],
    ['createTaskTemplateSchema', 'instructions', createTaskTemplateSchema, baseCreateTask, TEMPLATE_TEXT_MAX],
    ['createTaskTemplateSchema', 'doneDefinition', createTaskTemplateSchema, baseCreateTask, TEMPLATE_TEXT_MAX],
    ['createTaskTemplateSchema', 'notApplicableReason', createTaskTemplateSchema, baseCreateTask, TEMPLATE_TEXT_MAX],
    ['updateTaskTemplateSchema', 'taskName', updateTaskTemplateSchema, baseUpdateTask, TEMPLATE_NAME_MAX],
    ['updateTaskTemplateSchema', 'instructions', updateTaskTemplateSchema, baseUpdateTask, TEMPLATE_TEXT_MAX],
    ['updateTaskTemplateSchema', 'doneDefinition', updateTaskTemplateSchema, baseUpdateTask, TEMPLATE_TEXT_MAX],
    ['updateTaskTemplateSchema', 'notApplicableReason', updateTaskTemplateSchema, baseUpdateTask, TEMPLATE_TEXT_MAX],
  ];

  it.each(cases)('%s.%s acepta exactamente el límite', (_name, field, schema, base, max) => {
    const result = schema.safeParse({ ...base, [field]: 'a'.repeat(max) });
    expect(result.success).toBe(true);
  });

  it.each(cases)('%s.%s rechaza el límite + 1 con mensaje en español', (_name, field, schema, base, max) => {
    const result = schema.safeParse({ ...base, [field]: 'a'.repeat(max + 1) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    const [issue] = result.error.issues;
    expect(issue.path).toEqual([field]);
    expect(issue.message).toContain(`no puede superar ${max} caracteres`);
  });
});

describe('textos opcionales de tareas de plantilla', () => {
  const textFields = ['instructions', 'doneDefinition', 'notApplicableReason'] as const;

  it.each(textFields)('createTaskTemplateSchema acepta %s null u omitido', field => {
    expect(createTaskTemplateSchema.safeParse({ ...baseCreateTask, [field]: null }).success).toBe(true);
    expect(createTaskTemplateSchema.safeParse(baseCreateTask).success).toBe(true);
  });

  it.each(textFields)('updateTaskTemplateSchema acepta %s null u omitido', field => {
    expect(updateTaskTemplateSchema.safeParse({ [field]: null }).success).toBe(true);
    expect(updateTaskTemplateSchema.safeParse({}).success).toBe(true);
  });

  it('mantiene los defaults de creación', () => {
    expect(createTaskTemplateSchema.parse(baseCreateTask)).toMatchObject({
      requiresApproval: false,
      requiresEvidence: false,
      applies: true,
    });
    expect(createSpaceTemplateSchema.parse(baseCreateSpace)).toMatchObject({ autoGenerate: false });
  });

  it('mantiene min(1) y sus mensajes', () => {
    const space = createSpaceTemplateSchema.safeParse({ ...baseCreateSpace, name: '' });
    expect(space.success).toBe(false);
    expect(space.error?.issues[0].message).toBe('Nombre requerido');
    const task = createTaskTemplateSchema.safeParse({ ...baseCreateTask, taskName: '' });
    expect(task.success).toBe(false);
    expect(task.error?.issues[0].message).toBe('Nombre de tarea requerido');
  });
});

describe('clampTemplateName', () => {
  it('recorta a TEMPLATE_NAME_MAX un nombre largo', () => {
    const result = clampTemplateName('a'.repeat(300));
    expect(result).toHaveLength(TEMPLATE_NAME_MAX);
    expect(result).toBe('a'.repeat(TEMPLATE_NAME_MAX));
  });

  it('deja intacto un nombre corto', () => {
    expect(clampTemplateName('Conciliar bancos')).toBe('Conciliar bancos');
  });

  it('aplica trim antes de recortar', () => {
    expect(clampTemplateName('  Conciliar  ')).toBe('Conciliar');
    expect(clampTemplateName(`   ${'b'.repeat(TEMPLATE_NAME_MAX)}   `)).toBe('b'.repeat(TEMPLATE_NAME_MAX));
    expect(clampTemplateName('   ')).toBe('');
  });
});
