import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates, companies, persons } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import { eq, ilike } from 'drizzle-orm';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const templateName = (formData.get('templateName') as string) || 'Cierre mensual (importado)';
    const targetCycleDays = parseInt(formData.get('targetCycleDays') as string) || 10;

    if (!file) return error('Archivo requerido', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const allCompanies = await db.select().from(companies);
    const allPersons = await db.select().from(persons);

    const [template] = await db.insert(spaceTemplates).values({
      name: templateName,
      periodicity: 'mensual',
      targetCycleDays,
    }).returning();

    let globalOrder = 1;
    let totalTasks = 0;
    const skippedSheets: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        skippedSheets.push(sheetName);
        continue;
      }

      const company = allCompanies.find(c =>
        c.name.toLowerCase().includes(sheetName.toLowerCase()) ||
        sheetName.toLowerCase().includes(c.name.toLowerCase())
      );

      if (!company) {
        skippedSheets.push(sheetName);
        continue;
      }

      for (const row of rows) {
        const taskName = String(
          row['Actividad'] || row['ACTIVIDAD'] || row['Tarea'] || row['TAREA'] ||
          row['actividad'] || row['tarea'] || Object.values(row)[0] || ''
        ).trim();

        if (!taskName || taskName === '') continue;

        const statusVal = String(
          row['Estado'] || row['ESTADO'] || row['status'] || ''
        ).trim().toLowerCase();
        if (statusVal === 'x' || statusVal === 'no aplica') {
          await db.insert(taskTemplates).values({
            spaceTemplateId: template.id,
            taskName,
            companyId: company.id,
            order: globalOrder++,
            businessDayLimit: 1,
            applies: false,
            notApplicableReason: 'Marcada como N/A en importación',
          });
          totalTasks++;
          continue;
        }

        const durationRaw = row['Duracion'] || row['DURACION'] || row['Duración'] ||
          row['duracion'] || row['duración'] || row['Días'] || row['dias'] || '';
        let businessDayLimit = parseInt(String(durationRaw)) || 5;
        if (businessDayLimit > 30) businessDayLimit = 30;

        const responsibleName = String(
          row['Responsable'] || row['RESPONSABLE'] || row['responsable'] || ''
        ).trim();

        let defaultResponsibleId: string | null = null;
        if (responsibleName) {
          const person = allPersons.find(p =>
            p.name.toLowerCase().includes(responsibleName.toLowerCase()) ||
            responsibleName.toLowerCase().includes(p.name.split(' ')[0].toLowerCase())
          );
          if (person) defaultResponsibleId = person.id;
        }

        await db.insert(taskTemplates).values({
          spaceTemplateId: template.id,
          taskName,
          companyId: company.id,
          order: globalOrder++,
          businessDayLimit,
          defaultResponsibleId,
        });
        totalTasks++;
      }
    }

    return success({
      template,
      tasksImported: totalTasks,
      sheetsProcessed: workbook.SheetNames.length - skippedSheets.length,
      skippedSheets,
    }, 201);
  } catch (err) {
    return handleError(err);
  }
}
