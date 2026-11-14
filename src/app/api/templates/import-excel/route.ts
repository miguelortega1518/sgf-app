import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { spaceTemplates, taskTemplates, companies, persons } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { success, error, handleError } from '@/lib/api-utils';
import {
  clampTemplateName,
  IMPORT_EXCEL_MAX_BYTES,
  IMPORT_EXCEL_MAX_ROWS,
  IMPORT_EXCEL_MAX_SHEETS,
} from '@/lib/schemas/template';
import * as XLSX from 'xlsx';

/** Holgura para las cabeceras y separadores multipart al comprobar Content-Length. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
/** Máximo de una columna integer de Postgres. */
const PG_INT_MAX = 2_147_483_647;

const DEFAULT_TEMPLATE_NAME = 'Cierre mensual (importado)';
const DEFAULT_TARGET_CYCLE_DAYS = 10;

const FILE_TOO_LARGE = 'El archivo supera el tamaño máximo de 5 MB';
const INVALID_CYCLE_DAYS = 'Días de ciclo inválidos';

type TaskRow = Omit<typeof taskTemplates.$inferInsert, 'spaceTemplateId'>;

function parseTargetCycleDays(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === '') return DEFAULT_TARGET_CYCLE_DAYS;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= PG_INT_MAX ? value : null;
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('admin');

    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > IMPORT_EXCEL_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return error(FILE_TOO_LARGE, 400);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return error('Formulario inválido', 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) return error('Archivo requerido', 400);
    if (file.size > IMPORT_EXCEL_MAX_BYTES) return error(FILE_TOO_LARGE, 400);

    const rawName = formData.get('templateName');
    if (rawName !== null && typeof rawName !== 'string') {
      return error('Nombre de plantilla inválido', 400);
    }
    const templateName = clampTemplateName(rawName ?? '') || DEFAULT_TEMPLATE_NAME;

    const targetCycleDays = parseTargetCycleDays(formData.get('targetCycleDays'));
    if (targetCycleDays === null) return error(INVALID_CYCLE_DAYS, 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: IMPORT_EXCEL_MAX_ROWS + 2 });
    } catch {
      return error('Archivo Excel inválido', 400);
    }

    if (workbook.SheetNames.length > IMPORT_EXCEL_MAX_SHEETS) {
      return error(`El archivo tiene demasiadas hojas (máximo ${IMPORT_EXCEL_MAX_SHEETS})`, 400);
    }

    // Análisis previo: se leen todas las hojas y se acota el total de filas antes de tocar la BD.
    const sheets: { sheetName: string; rows: Record<string, unknown>[] }[] = [];
    let totalRows = 0;
    for (const sheetName of workbook.SheetNames) {
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      totalRows += rows.length;
      if (totalRows > IMPORT_EXCEL_MAX_ROWS) {
        return error(`El archivo supera el máximo de ${IMPORT_EXCEL_MAX_ROWS} filas`, 400);
      }
      sheets.push({ sheetName, rows });
    }

    const allCompanies = await db.select().from(companies);
    const allPersons = await db.select().from(persons);

    let globalOrder = 1;
    const taskRows: TaskRow[] = [];
    const skippedSheets: string[] = [];

    for (const { sheetName, rows } of sheets) {
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
        const taskName = clampTemplateName(String(
          row['Actividad'] || row['ACTIVIDAD'] || row['Tarea'] || row['TAREA'] ||
          row['actividad'] || row['tarea'] || Object.values(row)[0] || ''
        ));

        if (!taskName) continue;

        const statusVal = String(
          row['Estado'] || row['ESTADO'] || row['status'] || ''
        ).trim().toLowerCase();
        if (statusVal === 'x' || statusVal === 'no aplica') {
          taskRows.push({
            taskName,
            companyId: company.id,
            order: globalOrder++,
            businessDayLimit: 1,
            applies: false,
            notApplicableReason: 'Marcada como N/A en importación',
          });
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

        taskRows.push({
          taskName,
          companyId: company.id,
          order: globalOrder++,
          businessDayLimit,
          defaultResponsibleId,
        });
      }
    }

    // Escritura: plantilla y todas sus tareas en una sola transacción.
    const template = await db.transaction(async tx => {
      const [created] = await tx.insert(spaceTemplates).values({
        name: templateName,
        periodicity: 'mensual',
        targetCycleDays,
      }).returning();

      if (taskRows.length > 0) {
        await tx.insert(taskTemplates).values(
          taskRows.map(r => ({ ...r, spaceTemplateId: created.id })),
        );
      }

      return created;
    });

    return success({
      template,
      tasksImported: taskRows.length,
      sheetsProcessed: workbook.SheetNames.length - skippedSheets.length,
      skippedSheets,
    }, 201);
  } catch (err) {
    return handleError(err);
  }
}
