import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog, milestones, persons, spaceMembers, tasks } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { canCreateAndAssignTask } from '@/lib/permissions';
import { success, error, handleError } from '@/lib/api-utils';
import { assertValidUuid, computeProjectAccess, requireProjectAccess } from '@/lib/project-access';
import { checkRateLimit, recordFailure, formatWait } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  importCsvBodySchema,
  IMPORT_CSV_MAX_BYTES,
  IMPORT_CSV_MAX_BODY_BYTES,
  IMPORT_CSV_MAX_PER_WINDOW,
} from '@/lib/schemas/task-import';
import {
  analyzeCsvImport,
  resolveCsvImport,
  type CsvImportAnalysis,
  type CsvImportResult,
  type ImportIssue,
  type ImportMember,
  type ImportMilestone,
} from '@/lib/task-import';

type Executor = Pick<typeof db, 'select'>;
type ImportSpace = { id: string; ownerId: string; leaderId: string | null };

const BODY_TOO_LARGE =
  `La petición supera el tamaño máximo: el CSV admite hasta ${IMPORT_CSV_MAX_BYTES / (1024 * 1024)} MB`;

function errorsText(n: number): string {
  return `El CSV tiene ${n} ${n === 1 ? 'error' : 'errores'}; no se importó ninguna tarea`;
}

function importedAuditText(n: number): string {
  return `${n} ${n === 1 ? 'tarea importada' : 'tareas importadas'} desde CSV`;
}

/**
 * Carga en bloque (tres consultas, sin importar el número de filas) las personas y los hitos
 * citados en el CSV. La elegibilidad replica la política de validateTaskReferences: persona
 * activa, rol global distinto de observador y acceso de escritura al proyecto.
 */
async function loadImportContext(
  executor: Executor,
  space: ImportSpace,
  analysis: CsvImportAnalysis,
  defaultResponsibleId: string | undefined,
) {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const membersByEmail = new Map<string, ImportMember>();
  const milestonesByName = new Map<string, ImportMilestone[]>();
  if (!analysis.rows.length) {
    return { ctx: { membersByEmail, milestonesByName, defaultReviewerId: null }, errors, warnings };
  }

  const ids = [...new Set([defaultResponsibleId, space.leaderId].filter((v): v is string => !!v))];
  const personConditions: SQL[] = [];
  if (analysis.emails.length) personConditions.push(inArray(sql`lower(${persons.email})`, analysis.emails));
  if (ids.length) personConditions.push(inArray(persons.id, ids));
  const people = personConditions.length
    ? await executor
      .select({ id: persons.id, name: persons.name, email: persons.email, role: persons.role, active: persons.active })
      .from(persons)
      .where(or(...personConditions))
    : [];

  const memberships = people.length
    ? await executor
      .select({ personId: spaceMembers.personId, spaceRole: spaceMembers.spaceRole })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, space.id), inArray(spaceMembers.personId, people.map(p => p.id))))
    : [];
  const membershipByPerson = new Map(memberships.map(m => [m.personId, m]));

  const eligibleById = new Map<string, ImportMember>();
  for (const person of people) {
    const eligible = person.active
      && person.role !== 'observador'
      && computeProjectAccess(person, space.ownerId, membershipByPerson.get(person.id), 'write') === null;
    if (!eligible) continue;
    const member = { id: person.id, name: person.name, email: person.email };
    eligibleById.set(person.id, member);
    membersByEmail.set(person.email.toLowerCase(), member);
  }

  if (analysis.milestoneNames.length) {
    const rows = await executor
      .select({ id: milestones.id, name: milestones.name })
      .from(milestones)
      .where(and(eq(milestones.spaceId, space.id), inArray(milestones.name, analysis.milestoneNames)));
    for (const m of rows) milestonesByName.set(m.name, [...(milestonesByName.get(m.name) ?? []), m]);
  }

  let defaultResponsible: ImportMember | undefined;
  if (defaultResponsibleId) {
    defaultResponsible = eligibleById.get(defaultResponsibleId);
    if (!defaultResponsible) {
      errors.push({
        line: null,
        column: 'responsable',
        message: 'El responsable por defecto no es miembro del proyecto con permiso de escritura',
      });
    }
  }

  let defaultReviewerId: string | null = null;
  if (space.leaderId) {
    if (eligibleById.has(space.leaderId)) {
      defaultReviewerId = space.leaderId;
    } else {
      warnings.push({
        line: null,
        column: 'revisor',
        message: 'El líder del proyecto no tiene permiso de escritura: las tareas sin revisor quedarán sin revisor',
      });
    }
  }

  return { ctx: { membersByEmail, milestonesByName, defaultResponsible, defaultReviewerId }, errors, warnings };
}

async function evaluateImport(
  executor: Executor,
  space: ImportSpace,
  analysis: CsvImportAnalysis,
  defaultResponsibleId: string | undefined,
): Promise<CsvImportResult> {
  const loaded = await loadImportContext(executor, space, analysis, defaultResponsibleId);
  const result = resolveCsvImport(analysis, loaded.ctx);
  return {
    ...result,
    errors: [...loaded.errors, ...result.errors],
    warnings: [...loaded.warnings, ...result.warnings],
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    if (!canCreateAndAssignTask(session.role)) {
      return error('Sin permisos para crear tareas', 403);
    }
    const { id } = await params;
    assertValidUuid(id, 'ID de proyecto');

    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > IMPORT_CSV_MAX_BODY_BYTES) {
      return error(BODY_TOO_LARGE, 400);
    }
    const input = importCsvBodySchema.parse(await req.json());

    const space = await requireProjectAccess(session, id, 'write');
    if (space.status !== 'activo') {
      return error('Sólo se puede importar en un proyecto activo', 409);
    }

    // La vista previa no escribe ni cuenta para el rate limit.
    if (input.dryRun) {
      const preview = await evaluateImport(db, space, analyzeCsvImport(input.csv), input.defaultResponsibleId);
      return success(preview);
    }

    const rateKey = `import-csv:${session.id}`;
    const rate = await checkRateLimit(rateKey, IMPORT_CSV_MAX_PER_WINDOW);
    if (!rate.allowed) {
      const retryAfterMs = rate.retryAfterMs ?? 0;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      return NextResponse.json(
        { error: `Demasiadas importaciones seguidas. Vuelva a intentarlo en ${formatWait(retryAfterMs)}.`, retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
      );
    }

    const analysis = analyzeCsvImport(input.csv);

    // Todo o nada: la resolución y las inserciones van en la misma transacción.
    const outcome = await db.transaction(async tx => {
      const result = await evaluateImport(tx, space, analysis, input.defaultResponsibleId);
      if (result.errors.length || !result.rows.length) return { ok: false as const, result };

      const created = await tx.insert(tasks).values(result.rows.map(row => ({
        spaceId: id,
        title: row.title,
        description: row.description,
        responsibleId: row.responsible.id,
        reviewerId: row.reviewer?.id ?? null,
        creatorId: session.id,
        milestoneId: row.milestone?.id ?? null,
        dueDate: row.dueDate,
        dueDateOriginal: row.dueDate,
        priority: row.priority,
        kind: row.kind,
        estimate: row.estimate,
        labels: row.labels,
      }))).returning({ id: tasks.id, title: tasks.title });

      await tx.insert(auditLog).values(created.map(task => ({
        actorId: session.id,
        action: 'task_created',
        taskId: task.id,
        spaceId: id,
        newValue: task.title,
      })));

      await tx.insert(auditLog).values({
        actorId: session.id,
        action: 'tasks_imported',
        spaceId: id,
        newValue: importedAuditText(created.length),
      });

      return { ok: true as const, imported: created.length };
    });

    if (!outcome.ok) {
      const { errors, warnings, total } = outcome.result;
      return error(errorsText(errors.length), 400, { errors, warnings, total });
    }

    // Sin avisos de asignación: un alta masiva no debe inundar la bandeja del equipo.
    // Las tareas ya están creadas: si falla el registro del rate limit no se responde 500,
    // porque la persona reintentaría y duplicaría la importación.
    try {
      await recordFailure(rateKey);
    } catch (err) {
      logger.warn('import_csv_rate_limit_record_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return success({ imported: outcome.imported }, 201);
  } catch (err) {
    return handleError(err);
  }
}
