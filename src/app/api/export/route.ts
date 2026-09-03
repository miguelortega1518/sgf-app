import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/api-utils';
import { eq, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import * as XLSX from 'xlsx';

const STATUS_LABELS: Record<string, string> = {
  no_iniciada: 'No iniciada',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
};

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  normal: 'Normal',
  baja: 'Baja',
};

export async function GET() {
  try {
    await requireRole('admin');

    const reviewer = alias(persons, 'reviewer');

    const rows = await db
      .select({
        taskTitle: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        dueDateOriginal: tasks.dueDateOriginal,
        completedAt: tasks.completedAt,
        spaceName: spaces.name,
        spaceType: spaces.type,
        responsibleName: persons.name,
        reviewerName: reviewer.name,
        companyName: companies.name,
        blockedByArea: tasks.blockedByArea,
        delayReason: tasks.delayReason,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .leftJoin(reviewer, eq(tasks.reviewerId, reviewer.id))
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .where(eq(tasks.archived, false))
      .orderBy(asc(spaces.name), asc(tasks.dueDate));

    const data = rows.map(r => ({
      'Espacio': r.spaceName,
      'Tipo': r.spaceType,
      'Empresa': r.companyName || '',
      'Tarea': r.taskTitle,
      'Responsable': r.responsibleName,
      'Revisor': r.reviewerName || '',
      'Estado': STATUS_LABELS[r.status] || r.status,
      'Prioridad': PRIORITY_LABELS[r.priority] || r.priority,
      'Fecha límite': r.dueDate || '',
      'Fecha original': r.dueDateOriginal || '',
      'Completada': r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : '',
      'Bloqueada por': r.blockedByArea || '',
      'Razón retraso': r.delayReason || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(r => String((r as Record<string, string>)[key] || '').length)).toString().length + 2,
    }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="sgf-tareas-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
