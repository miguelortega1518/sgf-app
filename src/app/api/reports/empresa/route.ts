import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks, spaces, persons, companies } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { handleError, error } from '@/lib/api-utils';
import { todayRD } from '@/lib/date-utils';
import { eq, and, asc, count, sql } from 'drizzle-orm';
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
    const companyId = req.nextUrl.searchParams.get('companyId');
    const format = req.nextUrl.searchParams.get('format') || 'xlsx';

    const today = todayRD();

    if (companyId) {
      const [company] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!company) return error('Empresa no encontrada', 404);

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
          responsibleName: persons.name,
          reviewerName: reviewer.name,
          blockedByArea: tasks.blockedByArea,
        })
        .from(tasks)
        .innerJoin(spaces, eq(tasks.spaceId, spaces.id))
        .innerJoin(persons, eq(tasks.responsibleId, persons.id))
        .leftJoin(reviewer, eq(tasks.reviewerId, reviewer.id))
        .where(and(eq(tasks.companyId, companyId), eq(tasks.archived, false)))
        .orderBy(asc(spaces.name), asc(tasks.dueDate));

      const completed = rows.filter(r => r.status === 'completada');
      const pending = rows.filter(r => r.status !== 'completada');
      const overdue = pending.filter(r => r.dueDateOriginal && r.dueDateOriginal < today);

      const completionRate = rows.length > 0
        ? Math.round((completed.length / rows.length) * 100)
        : 0;

      const data = rows.map(r => ({
        'Espacio': r.spaceName,
        'Tarea': r.title,
        'Responsable': r.responsibleName,
        'Revisor': r.reviewerName || '',
        'Estado': STATUS_LABELS[r.status] || r.status,
        'Prioridad': PRIORITY_LABELS[r.priority] || r.priority,
        'Fecha límite': r.dueDate || '',
        'Completada': r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : '',
        'Bloqueada por': r.blockedByArea || '',
      }));

      const filename = `reporte-${company.name.replace(/\s+/g, '-').toLowerCase()}-${today}`;

      if (format === 'pdf') {
        const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));

        doc.fontSize(16).text(`Reporte por Empresa — ${company.name}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#666').text(`Generado: ${today}`, { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(10).fillColor('#111');
        doc.text(`Total: ${rows.length}  |  Completadas: ${completed.length}  |  Pendientes: ${pending.length}  |  Vencidas: ${overdue.length}  |  Cumplimiento: ${completionRate}%`);
        doc.moveDown(1);

        const cols = ['Espacio', 'Tarea', 'Responsable', 'Estado', 'Prioridad', 'Fecha límite'];
        const colW = [110, 190, 100, 70, 60, 80];
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
          const vals = [row['Espacio'], row['Tarea'], row['Responsable'], row['Estado'], row['Prioridad'], row['Fecha límite']];
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
        { 'Métrica': 'Empresa', 'Valor': company.name },
        { 'Métrica': 'Total tareas', 'Valor': String(rows.length) },
        { 'Métrica': 'Completadas', 'Valor': String(completed.length) },
        { 'Métrica': 'Pendientes', 'Valor': String(pending.length) },
        { 'Métrica': 'Vencidas', 'Valor': String(overdue.length) },
        { 'Métrica': 'Cumplimiento', 'Valor': `${completionRate}%` },
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
    }

    const summary = await db
      .select({
        companyId: tasks.companyId,
        companyName: companies.name,
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completada' THEN 1 END`),
        overdue: count(sql`CASE WHEN ${tasks.dueDateOriginal} < ${today} AND ${tasks.status} != 'completada' THEN 1 END`),
        blocked: count(sql`CASE WHEN ${tasks.status} = 'bloqueada' THEN 1 END`),
      })
      .from(tasks)
      .innerJoin(companies, eq(tasks.companyId, companies.id))
      .where(eq(tasks.archived, false))
      .groupBy(tasks.companyId, companies.name)
      .orderBy(asc(companies.name));

    const data = summary.map(r => ({
      'Empresa': r.companyName,
      'Total tareas': r.total,
      'Completadas': r.completed,
      'Pendientes': r.total - r.completed,
      'Vencidas': r.overdue,
      'Bloqueadas': r.blocked,
      'Cumplimiento': r.total > 0 ? `${Math.round((r.completed / r.total) * 100)}%` : '—',
    }));

    const filename = `reporte-empresas-${today}`;

    if (format === 'pdf') {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));

      doc.fontSize(16).text('Reporte por Empresa — Resumen General', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text(`Generado: ${today}  |  ${summary.length} empresas`, { align: 'center' });
      doc.moveDown(1);

      const cols = ['Empresa', 'Total', 'Completadas', 'Pendientes', 'Vencidas', 'Bloqueadas', 'Cumplimiento'];
      const colW = [160, 60, 80, 70, 60, 70, 80];
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
        const vals = [row['Empresa'], String(row['Total tareas']), String(row['Completadas']), String(row['Pendientes']), String(row['Vencidas']), String(row['Bloqueadas']), row['Cumplimiento']];
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
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(r => String((r as Record<string, string | number>)[key] ?? '').length)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, 'Empresas');

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
