import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { handleError, error } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

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

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const personId = req.nextUrl.searchParams.get('personId');
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';

    if (!personId) return error('personId es requerido', 400);

    const [person] = await db
      .select({ id: persons.id, name: persons.name, email: persons.email })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);

    if (!person) return error('Persona no encontrada', 404);

    const today = todayRD();
    const reviewer = alias(persons, 'reviewer');

    const rows = await db
      .select({
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        dueDateOriginal: tasks.dueDateOriginal,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        spaceName: spaces.name,
        companyName: companies.name,
        reviewerName: reviewer.name,
        blockedByArea: tasks.blockedByArea,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .leftJoin(reviewer, eq(tasks.reviewerId, reviewer.id))
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .where(and(eq(tasks.responsibleId, personId), eq(tasks.archived, false)))
      .orderBy(asc(tasks.dueDate));

    const completed = rows.filter(r => r.status === 'completada');
    const pending = rows.filter(r => r.status !== 'completada');
    const overdue = pending.filter(r => r.dueDateOriginal && r.dueDateOriginal < today);

    let avgDays = 0;
    const withTime = completed.filter(r => r.completedAt && r.createdAt);
    if (withTime.length > 0) {
      const totalDays = withTime.reduce((sum, r) => {
        return sum + Math.ceil(
          (new Date(r.completedAt!).getTime() - new Date(r.createdAt!).getTime()) / 86400000
        );
      }, 0);
      avgDays = Math.round(totalDays / withTime.length);
    }

    let onTimeCount = 0;
    const completedWithDue = completed.filter(r => r.completedAt && r.dueDateOriginal);
    for (const r of completedWithDue) {
      const completedDate = new Date(r.completedAt!).toISOString().slice(0, 10);
      if (completedDate <= r.dueDateOriginal!) onTimeCount++;
    }
    const onTimeRate = completedWithDue.length > 0
      ? Math.round((onTimeCount / completedWithDue.length) * 100)
      : 100;

    const data = rows.map(r => ({
      'Espacio': r.spaceName,
      'Tarea': r.title,
      'Estado': STATUS_LABELS[r.status] || r.status,
      'Prioridad': PRIORITY_LABELS[r.priority] || r.priority,
      'Empresa': r.companyName || '',
      'Revisor': r.reviewerName || '',
      'Fecha límite': r.dueDate || '',
      'Fecha original': r.dueDateOriginal || '',
      'Completada': r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : '',
      'Bloqueada por': r.blockedByArea || '',
    }));

    const filename = `reporte-${person.name.replace(/\s+/g, '-').toLowerCase()}-${today}`;

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));

      doc.fontSize(16).text(`Reporte de Tareas — ${person.name}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(
        `${person.email}  |  Generado: ${today}`,
        { align: 'center' },
      );
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor('#111');
      doc.text(`Total: ${rows.length}  |  Completadas: ${completed.length}  |  Pendientes: ${pending.length}  |  Vencidas: ${overdue.length}`);
      doc.text(`Cumplimiento a tiempo: ${onTimeRate}%  |  Promedio resolución: ${avgDays} días`);
      doc.moveDown(1);

      const cols = ['Espacio', 'Tarea', 'Estado', 'Prioridad', 'Fecha límite', 'Completada'];
      const colW = [110, 190, 70, 60, 80, 80];
      const startX = 40;
      let y = doc.y;

      doc.fontSize(8).fillColor('#fff');
      cols.forEach((col, i) => {
        const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(x, y, colW[i], 16).fill('#374151');
        doc.fillColor('#fff').text(col, x + 4, y + 4, { width: colW[i] - 8 });
      });
      y += 16;

      doc.fillColor('#111');
      for (let idx = 0; idx < data.length; idx++) {
        if (y > 560) { doc.addPage(); y = 40; }
        const row = data[idx];
        const vals = [row['Espacio'], row['Tarea'], row['Estado'], row['Prioridad'], row['Fecha límite'], row['Completada']];
        if (idx % 2 === 0) {
          doc.rect(startX, y, colW.reduce((a, b) => a + b, 0), 14).fill('#f9fafb');
        }
        doc.fillColor('#111').fontSize(7);
        vals.forEach((val, i) => {
          const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
          doc.text(String(val || ''), x + 4, y + 3, { width: colW[i] - 8, height: 12, ellipsis: true });
        });
        y += 14;
      }

      doc.end();
      await new Promise<void>(resolve => doc.on('end', resolve));

      return new Response(Buffer.concat(chunks), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        },
      });
    }

    const wb = XLSX.utils.book_new();

    const summaryData = [
      { 'Métrica': 'Persona', 'Valor': person.name },
      { 'Métrica': 'Email', 'Valor': person.email },
      { 'Métrica': 'Total tareas', 'Valor': String(rows.length) },
      { 'Métrica': 'Completadas', 'Valor': String(completed.length) },
      { 'Métrica': 'Pendientes', 'Valor': String(pending.length) },
      { 'Métrica': 'Vencidas', 'Valor': String(overdue.length) },
      { 'Métrica': 'Cumplimiento a tiempo', 'Valor': `${onTimeRate}%` },
      { 'Métrica': 'Promedio resolución', 'Valor': `${avgDays} días` },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(r => String((r as Record<string, string>)[key] || '').length)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Tareas');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
