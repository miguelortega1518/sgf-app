import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  spaceTemplates, taskTemplates, templateDependencies,
  spaces, spaceMembers, tasks, taskDependencies, holidays,
} from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { generateCycleSchema } from '@/lib/schemas/template';
import { success, error, handleError } from '@/lib/api-utils';
import { addBusinessDays } from '@/lib/business-days';
import { eq, and, inArray } from 'drizzle-orm';

const PERIOD_LABELS: Record<string, string> = {
  mensual: 'Cierre',
  trimestral: 'Cierre trimestral',
  anual: 'Cierre anual',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function periodLabel(periodicity: string, period: string): string {
  const [year, month] = period.split('-');
  const prefix = PERIOD_LABELS[periodicity] || 'Cierre';
  return `${prefix} ${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('admin');
    const body = await req.json();
    const input = generateCycleSchema.parse(body);

    const [template] = await db
      .select()
      .from(spaceTemplates)
      .where(eq(spaceTemplates.id, input.spaceTemplateId))
      .limit(1);

    if (!template) return error('Plantilla no encontrada', 404);

    const existing = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          eq(spaces.spaceTemplateId, input.spaceTemplateId),
          eq(spaces.period, input.period),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return error(`Ya existe un ciclo para el período ${input.period}`, 409);
    }

    const tplTasks = await db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.spaceTemplateId, input.spaceTemplateId),
          eq(taskTemplates.active, true),
        ),
      );

    const taskIds = tplTasks.map(t => t.id);
    let tplDeps: { templateId: string; predecessorId: string }[] = [];
    if (taskIds.length > 0) {
      tplDeps = await db
        .select()
        .from(templateDependencies)
        .where(inArray(templateDependencies.templateId, taskIds));
    }

    const allHolidays = await db.select().from(holidays);
    const holidaySet = new Set(allHolidays.map(h => h.date));

    const spaceName = periodLabel(template.periodicity, input.period);
    const anchorDate = input.anchorDate;

    const maxDays = Math.max(...tplTasks.map(t => t.businessDayLimit), 0);
    const targetDate = addBusinessDays(anchorDate, maxDays, holidaySet);

    const result = await db.transaction(async (tx) => {
      const [space] = await tx.insert(spaces).values({
        name: spaceName,
        type: 'recurrente',
        spaceTemplateId: input.spaceTemplateId,
        period: input.period,
        anchorDate,
        objective: `${spaceName} — generado desde plantilla "${template.name}"`,
        ownerId: input.ownerId,
        status: 'borrador',
        targetDate,
        openDate: anchorDate,
        templateSnapshot: {
          templateId: template.id,
          templateName: template.name,
          generatedAt: new Date().toISOString(),
          taskCount: tplTasks.filter(t => t.applies).length,
        },
      }).returning();

      const responsibleIds = new Set<string>();
      responsibleIds.add(input.ownerId);

      const templateIdToTaskId = new Map<string, string>();

      for (const tt of tplTasks) {
        if (!tt.applies) continue;

        const dueDate = addBusinessDays(anchorDate, tt.businessDayLimit, holidaySet);
        const responsibleId = tt.defaultResponsibleId || input.ownerId;
        responsibleIds.add(responsibleId);

        const [task] = await tx.insert(tasks).values({
          spaceId: space.id,
          templateId: tt.id,
          companyId: tt.companyId,
          title: tt.taskName,
          responsibleId,
          reviewerId: tt.reviewerId ?? null,
          creatorId: session.id,
          dueDate,
          dueDateOriginal: dueDate,
          requiresApproval: tt.requiresApproval,
          requiresEvidence: tt.requiresEvidence,
          doneDefinition: tt.doneDefinition,
          instructions: tt.instructions,
        }).returning();

        templateIdToTaskId.set(tt.id, task.id);
      }

      for (const dep of tplDeps) {
        const taskId = templateIdToTaskId.get(dep.templateId);
        const predecessorId = templateIdToTaskId.get(dep.predecessorId);
        if (taskId && predecessorId) {
          await tx.insert(taskDependencies).values({ taskId, predecessorId });
        }
      }

      const memberValues = Array.from(responsibleIds).map(personId => ({
        spaceId: space.id,
        personId,
        spaceRole: personId === input.ownerId ? 'dueño' as const : 'colaborador' as const,
      }));

      if (memberValues.length > 0) {
        await tx.insert(spaceMembers).values(memberValues);
      }

      return {
        space,
        tasksGenerated: templateIdToTaskId.size,
        dependenciesCopied: tplDeps.filter(d =>
          templateIdToTaskId.has(d.templateId) && templateIdToTaskId.has(d.predecessorId)
        ).length,
      };
    });

    return success(result, 201);
  } catch (err) {
    return handleError(err);
  }
}
