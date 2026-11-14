import { describe, it, expect } from 'vitest';
import {
  templateTaskLabel,
  describeTemplateChanges,
  describeTaskTemplateChanges,
} from '../src/lib/template-audit';

const template = {
  name: 'Cierre',
  periodicity: 'mensual',
  targetCycleDays: 10,
  autoGenerate: false,
  active: true,
};

const task = {
  taskName: 'Conciliar',
  order: 1,
  businessDayLimit: 3,
  requiresApproval: false,
  requiresEvidence: false,
  applies: true,
  instructions: null as string | null,
  doneDefinition: 'Cuadrado' as string | null,
  notApplicableReason: null as string | null,
  companyId: null as string | null,
  defaultResponsibleId: '6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b' as string | null,
  alternateId: null as string | null,
  reviewerId: null as string | null,
};

describe('templateTaskLabel', () => {
  it('une plantilla y tarea con ›', () => {
    expect(templateTaskLabel('Cierre', 'Conciliar')).toBe('Cierre › Conciliar');
  });
});

describe('describeTemplateChanges', () => {
  it('devuelve null si nada cambia', () => {
    expect(describeTemplateChanges(template, { name: 'Cierre', targetCycleDays: 10 })).toBeNull();
    expect(describeTemplateChanges(template, {})).toBeNull();
  });

  it('ignora las claves undefined', () => {
    expect(describeTemplateChanges(template, { name: undefined, targetCycleDays: 12 })).toEqual({
      previousValue: 'Cierre: Días de ciclo: 10',
      newValue: 'Cierre: Días de ciclo: 12',
    });
  });

  it('formatea booleanos como sí/no y separa varios campos con «; »', () => {
    expect(describeTemplateChanges(template, { autoGenerate: true, active: false, name: 'Cierre' })).toEqual({
      previousValue: 'Cierre: Generación automática: no; Activa: sí',
      newValue: 'Cierre: Generación automática: sí; Activa: no',
    });
  });

  it('usa el nombre actual como prefijo al renombrar', () => {
    expect(describeTemplateChanges(template, { name: 'Cierre mensual', periodicity: 'anual' })).toEqual({
      previousValue: 'Cierre: Nombre: Cierre; Periodicidad: mensual',
      newValue: 'Cierre: Nombre: Cierre mensual; Periodicidad: anual',
    });
  });

  it('no resuelve claves del prototipo', () => {
    const input = JSON.parse('{"__proto__": {"name": "x"}, "constructor": "y"}');
    expect(describeTemplateChanges(template, input)).toBeNull();
  });
});

describe('describeTaskTemplateChanges', () => {
  it('devuelve null si nada cambia', () => {
    expect(describeTaskTemplateChanges('Cierre', task, { taskName: 'Conciliar', order: 1 })).toBeNull();
  });

  it('usa «plantilla › tarea» como prefijo', () => {
    expect(describeTaskTemplateChanges('Cierre', task, { taskName: 'Conciliar bancos' })).toEqual({
      previousValue: 'Cierre › Conciliar: Nombre: Conciliar',
      newValue: 'Cierre › Conciliar: Nombre: Conciliar bancos',
    });
  });

  it('muestra asignado/sin asignar en lugar de UUID', () => {
    const otherId = '7a2d3c9f-4b5e-4f6a-9b0c-1d2e3f4a5b6c';
    const diff = describeTaskTemplateChanges('Cierre', task, {
      defaultResponsibleId: null,
      reviewerId: otherId,
    });
    expect(diff).toEqual({
      previousValue: 'Cierre › Conciliar: Responsable: asignado; Revisor: sin asignar',
      newValue: 'Cierre › Conciliar: Responsable: sin asignar; Revisor: asignado',
    });
    expect(diff!.previousValue).not.toContain(task.defaultResponsibleId!);
    expect(diff!.newValue).not.toContain(otherId);
  });

  it('cambiar de un responsable a otro sigue auditándose sin UUID', () => {
    const otherId = '7a2d3c9f-4b5e-4f6a-9b0c-1d2e3f4a5b6c';
    const diff = describeTaskTemplateChanges('Cierre', task, { defaultResponsibleId: otherId });
    expect(diff).toEqual({
      previousValue: 'Cierre › Conciliar: Responsable: asignado',
      newValue: 'Cierre › Conciliar: Responsable: asignado',
    });
  });

  it('muestra null o vacío como «vacío»', () => {
    expect(describeTaskTemplateChanges('Cierre', task, { instructions: 'Revisar', doneDefinition: '' })).toEqual({
      previousValue: 'Cierre › Conciliar: Instrucciones: vacío; Definición de hecho: Cuadrado',
      newValue: 'Cierre › Conciliar: Instrucciones: Revisar; Definición de hecho: vacío',
    });
  });

  it('formatea booleanos y números', () => {
    expect(describeTaskTemplateChanges('Cierre', task, {
      requiresApproval: true,
      applies: false,
      businessDayLimit: 5,
    })).toEqual({
      previousValue: 'Cierre › Conciliar: Días hábiles: 3; Requiere aprobación: no; Aplica: sí',
      newValue: 'Cierre › Conciliar: Días hábiles: 5; Requiere aprobación: sí; Aplica: no',
    });
  });

  it('nunca produce JSON', () => {
    const diff = describeTaskTemplateChanges('Cierre', task, { companyId: '7a2d3c9f-4b5e-4f6a-9b0c-1d2e3f4a5b6c' });
    expect(diff!.newValue).not.toMatch(/[{}"]/);
    expect(diff!.newValue).toBe('Cierre › Conciliar: Empresa: asignado');
  });
});
