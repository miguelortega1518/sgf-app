import ExcelJS from 'exceljs';

/**
 * Lectura y escritura de Excel (.xlsx) en un solo lugar. Sustituye a `xlsx` (SheetJS 0.18), que tiene
 * vulnerabilidades sin parche en npm. Imita lo que usábamos de esa librería: `json_to_sheet` (los encabezados
 * son las claves de las filas, en orden de aparición) y `sheet_to_json` con `defval: ''`.
 */

export type CellValue = string | number | boolean | Date | null | undefined;
export type SheetSpec = { name: string; rows: Record<string, CellValue>[] };
export type ReadSheet = { name: string; rows: Record<string, unknown>[] };

/** Límite de tamaño para archivos subidos: un .xlsx comprimido de más de esto no es una plantilla razonable. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class InvalidSpreadsheetError extends Error {}

function headersOf(rows: Record<string, CellValue>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
}

function displayLength(value: CellValue): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return 10;
  return String(value).length;
}

/** Libro con una hoja por elemento; columnas ajustadas al texto más largo (como hacían los reportes). */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    const headers = headersOf(sheet.rows);
    worksheet.columns = headers.map(header => ({
      header,
      key: header,
      width: Math.max(header.length, ...sheet.rows.map(r => displayLength(r[header]))) + 2,
    }));
    for (const row of sheet.rows) {
      worksheet.addRow(Object.fromEntries(headers.map(h => [h, row[h] ?? null])));
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function plainValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return value;
  if ('richText' in value) return value.richText.map(part => part.text).join('');
  if ('result' in value) return plainValue(value.result as ExcelJS.CellValue);
  if ('text' in value) return value.text;
  if ('error' in value) return '';
  return String(value);
}

/**
 * Cada hoja como lista de objetos: la primera fila con datos son los encabezados, las celdas vacías valen ''
 * y las filas vacías se omiten. Lanza `InvalidSpreadsheetError` si el archivo no es un .xlsx legible.
 */
export async function readWorkbook(data: Uint8Array): Promise<ReadSheet[]> {
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidSpreadsheetError('El archivo supera el tamaño máximo de 5 MB.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  } catch {
    throw new InvalidSpreadsheetError('El archivo no es un Excel válido. Guárdelo como .xlsx e inténtelo de nuevo.');
  }

  return workbook.worksheets.map(worksheet => {
    let headers: Map<number, string> | null = null;
    const rows: Record<string, unknown>[] = [];

    worksheet.eachRow({ includeEmpty: false }, row => {
      if (!headers) {
        headers = new Map();
        const used = new Map<string, number>();
        row.eachCell({ includeEmpty: false }, (cell, col) => {
          const base = String(plainValue(cell.value)).trim();
          if (!base) return;
          const n = used.get(base) ?? 0;
          used.set(base, n + 1);
          headers!.set(col, n === 0 ? base : `${base}_${n}`);
        });
        return;
      }
      const record: Record<string, unknown> = {};
      let hasValue = false;
      for (const [col, header] of headers) {
        const value = plainValue(row.getCell(col).value);
        if (value !== '') hasValue = true;
        record[header] = value;
      }
      if (hasValue) rows.push(record);
    });

    return { name: worksheet.name, rows };
  });
}
