import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { accessibleSpaceIds } from '@/lib/project-access';
import { handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { APP_NAME } from '@/lib/labels';
import { taskExportRow } from '@/lib/export-rows';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';
    const today = todayRD();

    const reviewer = alias(persons, 'reviewer');

    const allowedSpaceIds = await accessibleSpaceIds(session);
    let taskFilter;
    if (allowedSpaceIds === null) {
      taskFilter = eq(tasks.archived, false);
    } else {
      taskFilter = allowedSpaceIds.length > 0
        ? and(eq(tasks.archived, false), inArray(tasks.spaceId, allowedSpaceIds))
        : and(eq(tasks.archived, false), eq(tasks.spaceId, '00000000-0000-0000-0000-000000000000'));
    }

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
      .where(taskFilter)
      .orderBy(asc(spaces.name), asc(tasks.dueDate));

    const data = rows.map(taskExportRow);
    const filename = `${APP_NAME.toLowerCase()}-tareas-${today}`;

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));

      doc.fontSize(16).text(`Reporte de tareas - ${APP_NAME}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(
        `Generado: ${today}  |  Total: ${data.length} tareas`,
        { align: 'center' },
      );
      doc.moveDown(1);

      const cols = ['Proyecto', 'Tarea', 'Responsable', 'Estado', 'Prioridad', 'Fecha límite'];
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
      for (let idx = 0; idx < data.length; idx++) {
        if (y > 560) { doc.addPage(); y = 40; }
        const row = data[idx];
        const vals = [row['Proyecto'], row['Tarea'], row['Responsable'], row['Estado'], row['Prioridad'], row['Fecha límite']];
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
      const pdfBuf = Buffer.concat(chunks);

      return new Response(pdfBuf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
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
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
