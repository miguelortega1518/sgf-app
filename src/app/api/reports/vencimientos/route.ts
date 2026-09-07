import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { handleError } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, ne, lte, asc, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const STATUS_LABELS: Record<string, string> = {
  no_iniciada: 'No iniciada',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
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
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';
    const days = parseInt(req.nextUrl.searchParams.get('days') || '7', 10);

    const today = todayRD();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    const rows = await db
      .select({
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        dueDateOriginal: tasks.dueDateOriginal,
        createdAt: tasks.createdAt,
        spaceName: spaces.name,
        responsibleName: persons.name,
        companyName: companies.name,
        blockedByArea: tasks.blockedByArea,
      })
      .from(tasks)
      .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
      .innerJoin(persons, eq(tasks.responsibleId, persons.id))
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .where(and(
        eq(tasks.archived, false),
        ne(tasks.status, 'completada'),
        lte(tasks.dueDateOriginal, futureDateStr),
      ))
      .orderBy(asc(tasks.dueDateOriginal));

    const overdue = rows.filter(r => r.dueDateOriginal && r.dueDateOriginal < today);
    const upcoming = rows.filter(r => r.dueDateOriginal && r.dueDateOriginal >= today);

    const data = rows.map(r => {
      const isOverdue = r.dueDateOriginal ? r.dueDateOriginal < today : false;
      const daysLeft = r.dueDateOriginal
        ? Math.ceil((new Date(r.dueDateOriginal).getTime() - new Date(today).getTime()) / 86400000)
        : null;
      return {
        'Estado vencimiento': isOverdue ? `VENCIDA (${Math.abs(daysLeft!)} días)` : `${daysLeft} días restantes`,
        'Espacio': r.spaceName,
        'Tarea': r.title,
        'Responsable': r.responsibleName,
        'Estado': STATUS_LABELS[r.status] || r.status,
        'Prioridad': PRIORITY_LABELS[r.priority] || r.priority,
        'Empresa': r.companyName || '',
        'Fecha límite': r.dueDateOriginal || '',
        'Fecha ajustada': r.dueDate !== r.dueDateOriginal ? (r.dueDate || '') : '',
        'Bloqueada por': r.blockedByArea || '',
      };
    });

    const filename = `reporte-vencimientos-${today}`;

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));

      doc.fontSize(16).text('Reporte de Vencimientos', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(
        `Generado: ${today}  |  Período: vencidas + próximos ${days} días`,
        { align: 'center' },
      );
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor('#111');
      doc.text(`Vencidas: ${overdue.length}  |  Próximas a vencer: ${upcoming.length}  |  Total: ${rows.length}`);
      doc.moveDown(1);

      const cols = ['Vencimiento', 'Espacio', 'Tarea', 'Responsable', 'Estado', 'Fecha límite'];
      const colW = [100, 100, 170, 90, 70, 80];
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
        const vals = [row['Estado vencimiento'], row['Espacio'], row['Tarea'], row['Responsable'], row['Estado'], row['Fecha límite']];
        const isOverdueRow = row['Estado vencimiento'].startsWith('VENCIDA');
        if (isOverdueRow) {
          doc.rect(startX, y, colW.reduce((a, b) => a + b, 0), 14).fill('#fef2f2');
        } else if (idx % 2 === 0) {
          doc.rect(startX, y, colW.reduce((a, b) => a + b, 0), 14).fill('#f9fafb');
        }
        doc.fillColor(isOverdueRow ? '#991b1b' : '#111').fontSize(7);
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
      { 'Métrica': 'Fecha del reporte', 'Valor': today },
      { 'Métrica': 'Ventana', 'Valor': `Vencidas + próximos ${days} días` },
      { 'Métrica': 'Tareas vencidas', 'Valor': String(overdue.length) },
      { 'Métrica': 'Próximas a vencer', 'Valor': String(upcoming.length) },
      { 'Métrica': 'Total', 'Valor': String(rows.length) },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(r => String((r as Record<string, string>)[key] || '').length)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Vencimientos');

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
