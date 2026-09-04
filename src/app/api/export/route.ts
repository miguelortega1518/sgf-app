import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/api-utils';
import { eq, asc } from 'drizzle-orm';
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
    await requireRole('admin');
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';

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

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));

      doc.fontSize(16).text('Reporte de Tareas - SGF', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(
        `Generado: ${new Date().toISOString().slice(0, 10)}  |  Total: ${data.length} tareas`,
        { align: 'center' },
      );
      doc.moveDown(1);

      const cols = ['Espacio', 'Tarea', 'Responsable', 'Estado', 'Prioridad', 'Fecha límite'];
      const colW = [120, 180, 100, 70, 60, 80];
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
      for (const row of data) {
        if (y > 560) { doc.addPage(); y = 40; }
        const vals = [row['Espacio'], row['Tarea'], row['Responsable'], row['Estado'], row['Prioridad'], row['Fecha límite']];
        const even = data.indexOf(row) % 2 === 0;
        if (even) {
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
      const pdfBuf = Buffer.concat(chunks);

      return new Response(pdfBuf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="sgf-tareas-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(r => String((r as Record<string, string>)[key] || '').length)) + 2,
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
