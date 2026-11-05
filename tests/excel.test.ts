import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, readWorkbook, InvalidSpreadsheetError, MAX_UPLOAD_BYTES } from '@/lib/excel';

describe('buildWorkbook / readWorkbook', () => {
  it('ida y vuelta: hojas, orden, encabezados y valores', async () => {
    const buf = await buildWorkbook([
      { name: 'Resumen', rows: [{ 'Métrica': 'Total', 'Valor': '3' }] },
      { name: 'Tareas', rows: [{ Actividad: 'Conciliación', Duracion: 2 }, { Actividad: 'Nómina', Duracion: 3 }] },
    ]);
    const sheets = await readWorkbook(buf);

    expect(sheets.map(s => s.name)).toEqual(['Resumen', 'Tareas']);
    expect(sheets[0].rows).toEqual([{ 'Métrica': 'Total', 'Valor': '3' }]);
    expect(sheets[1].rows).toEqual([
      { Actividad: 'Conciliación', Duracion: 2 },
      { Actividad: 'Nómina', Duracion: 3 },
    ]);
  });

  it('los encabezados son la unión de claves en orden de aparición, y lo que falta queda vacío', async () => {
    const buf = await buildWorkbook([{ name: 'Hoja', rows: [{ a: 1 }, { b: 'x', a: 2 }] }]);
    const [sheet] = await readWorkbook(buf);
    expect(sheet.rows).toEqual([{ a: 1, b: '' }, { a: 2, b: 'x' }]);
  });

  it('una hoja sin filas se lee vacía', async () => {
    const [sheet] = await readWorkbook(await buildWorkbook([{ name: 'Vacía', rows: [] }]));
    expect(sheet).toEqual({ name: 'Vacía', rows: [] });
  });

  it('omite filas vacías, aplana texto enriquecido y fórmulas, y renombra encabezados repetidos', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('BLUEAGRO');
    ws.addRow(['Actividad', 'Estado', 'Estado']);
    ws.addRow([{ richText: [{ text: 'Conci' }, { text: 'liación' }] }, 'x', 'y']);
    ws.addRow([]);
    ws.addRow(['Total', { formula: '1+1', result: 2 }, null]);
    const [sheet] = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(sheet.rows).toEqual([
      { Actividad: 'Conciliación', Estado: 'x', Estado_1: 'y' },
      { Actividad: 'Total', Estado: 2, Estado_1: '' },
    ]);
  });

  it('rechaza un archivo que no es .xlsx con un error comprensible', async () => {
    await expect(readWorkbook(Buffer.from('esto no es un excel'))).rejects.toBeInstanceOf(InvalidSpreadsheetError);
  });

  it('rechaza archivos por encima del límite sin intentar leerlos', async () => {
    await expect(readWorkbook(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow('5 MB');
  });
});
