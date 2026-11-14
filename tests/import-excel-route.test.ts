import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Chain = Record<string, ReturnType<typeof vi.fn>>;

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
  tx: {} as Record<string, unknown>,
}));
mocks.tx.insert = mocks.txInsert;

vi.mock('@/lib/auth', () => ({
  requireRole: mocks.requireRole,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/db/schema', () => ({
  spaceTemplates: { __table: 'spaceTemplates', id: 'id', name: 'name' },
  taskTemplates: { __table: 'taskTemplates', id: 'id', spaceTemplateId: 'spaceTemplateId' },
  companies: { __table: 'companies', id: 'companies.id', name: 'companies.name' },
  persons: { __table: 'persons', id: 'persons.id', name: 'persons.name' },
}));
vi.mock('xlsx', async importOriginal => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, read: vi.fn(actual.read) };
});

import * as XLSX from 'xlsx';
import { POST } from '../src/app/api/templates/import-excel/route';
import { logger } from '../src/lib/logger';
import {
  IMPORT_EXCEL_MAX_BYTES,
  IMPORT_EXCEL_MAX_ROWS,
  IMPORT_EXCEL_MAX_SHEETS,
} from '../src/lib/schemas/template';

const readMock = XLSX.read as unknown as ReturnType<typeof vi.fn>;

const adminId = crypto.randomUUID();
const templateId = crypto.randomUUID();
const companyA = { id: crypto.randomUUID(), name: 'Empresa Alfa S.A.' };
const personJuan = { id: crypto.randomUUID(), name: 'Juan Pérez' };

const URL = 'http://localhost/api/templates/import-excel';

function buildExcel(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function excelFile(sheets: Record<string, Record<string, unknown>[]>) {
  return new File([new Uint8Array(buildExcel(sheets))], 'cierre.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function formRequest(fields: Record<string, string | File>) {
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) formData.append(k, v);
  return new NextRequest(URL, { method: 'POST', body: formData });
}

function rowsOf(n: number, prefix = 'Tarea') {
  return Array.from({ length: n }, (_, i) => ({ Actividad: `${prefix} ${i + 1}` }));
}

const simpleExcel = () => excelFile({ 'Empresa Alfa': [{ Actividad: 'Conciliar' }] });

function expectNoDbCalls() {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.txInsert).not.toHaveBeenCalled();
}

async function expect400(response: Response, message: string) {
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: message });
}

function mockReads() {
  mocks.select.mockImplementation(() => ({
    from: vi.fn((table: { __table: string }) =>
      Promise.resolve(table.__table === 'companies' ? [companyA] : [personJuan]),
    ),
  }));
}

function mockInserts() {
  const valuesCalls: { table: string; values: unknown }[] = [];
  mocks.txInsert.mockImplementation((table: { __table: string }) => {
    const chain: Chain = {};
    let values: unknown;
    chain.values = vi.fn((v: unknown) => {
      values = v;
      valuesCalls.push({ table: table.__table, values: v });
      return chain;
    });
    chain.returning = vi.fn(() => chain);
    (chain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => {
      const result = table.__table === 'spaceTemplates'
        ? [{ id: templateId, ...(values as object) }]
        : [];
      return Promise.resolve(result).then(resolve, reject);
    };
    return chain;
  });
  return valuesCalls;
}

describe('POST /api/templates/import-excel', () => {
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.requireRole.mockResolvedValue({ id: adminId, role: 'admin' });
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mocks.tx));
    mockReads();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exporta los límites de importación', () => {
    expect(IMPORT_EXCEL_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(IMPORT_EXCEL_MAX_SHEETS).toBe(50);
    expect(IMPORT_EXCEL_MAX_ROWS).toBe(2000);
  });

  describe('autorización', () => {
    it('sin sesión responde 401 sin tocar la BD', async () => {
      mocks.requireRole.mockRejectedValue(new Error('UNAUTHORIZED'));

      const response = await POST(formRequest({ file: simpleExcel() }));

      expect(response.status).toBe(401);
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('sin rol admin responde 403 sin tocar la BD', async () => {
      mocks.requireRole.mockRejectedValue(new Error('FORBIDDEN'));

      const response = await POST(formRequest({ file: simpleExcel() }));

      expect(response.status).toBe(403);
      expect(mocks.requireRole).toHaveBeenCalledWith('admin');
      expectNoDbCalls();
    });
  });

  describe('validación del formulario', () => {
    it('templateName como File devuelve 400, no 500', async () => {
      const response = await POST(formRequest({
        file: simpleExcel(),
        templateName: new File(['x'], 'nombre.txt'),
      }));

      await expect400(response, 'Nombre de plantilla inválido');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('targetCycleDays como File devuelve 400', async () => {
      const response = await POST(formRequest({
        file: simpleExcel(),
        targetCycleDays: new File(['10'], 'dias.txt'),
      }));

      await expect400(response, 'Días de ciclo inválidos');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each(['abc', '0', '-5', '1.5'])('targetCycleDays "%s" devuelve 400', async value => {
      const response = await POST(formRequest({ file: simpleExcel(), targetCycleDays: value }));

      await expect400(response, 'Días de ciclo inválidos');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('file como string devuelve 400 Archivo requerido', async () => {
      const response = await POST(formRequest({ file: 'no soy un archivo' }));

      await expect400(response, 'Archivo requerido');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('sin file devuelve 400 Archivo requerido', async () => {
      const response = await POST(formRequest({ templateName: 'Cierre' }));

      await expect400(response, 'Archivo requerido');
      expectNoDbCalls();
    });

    it('body que no es multipart devuelve 400 Formulario inválido', async () => {
      const response = await POST(new NextRequest(URL, {
        method: 'POST',
        body: 'hola',
        headers: { 'Content-Type': 'text/plain' },
      }));

      await expect400(response, 'Formulario inválido');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('multipart mal formado devuelve 400 Formulario inválido', async () => {
      const response = await POST(new NextRequest(URL, {
        method: 'POST',
        body: 'basura sin boundary',
        headers: { 'Content-Type': 'multipart/form-data; boundary=xyz' },
      }));

      await expect400(response, 'Formulario inválido');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe('límites de tamaño', () => {
    it('Content-Length mayor que el límite devuelve 400 sin parsear formData', async () => {
      const req = new NextRequest(URL, {
        method: 'POST',
        body: 'pequeño',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=xyz',
          'Content-Length': String(IMPORT_EXCEL_MAX_BYTES + 64 * 1024 + 1),
        },
      });
      const formDataSpy = vi.spyOn(req, 'formData');

      const response = await POST(req);

      await expect400(response, 'El archivo supera el tamaño máximo de 5 MB');
      expect(formDataSpy).not.toHaveBeenCalled();
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('archivo de IMPORT_EXCEL_MAX_BYTES + 1 bytes devuelve 400 sin llamar a XLSX.read', async () => {
      const big = new File([new Uint8Array(IMPORT_EXCEL_MAX_BYTES + 1)], 'grande.xlsx');
      const arrayBufferSpy = vi.spyOn(File.prototype, 'arrayBuffer');

      const response = await POST(formRequest({ file: big }));

      await expect400(response, 'El archivo supera el tamaño máximo de 5 MB');
      expect(readMock).not.toHaveBeenCalled();
      expect(arrayBufferSpy).not.toHaveBeenCalled();
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe('contenido del Excel', () => {
    it('archivo que no es Excel válido devuelve 400 Archivo Excel inválido', async () => {
      readMock.mockImplementationOnce(() => {
        throw new Error('bad');
      });

      const response = await POST(formRequest({ file: new File(['\u0000\u0001'], 'roto.xlsx') }));

      await expect400(response, 'Archivo Excel inválido');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('llama a XLSX.read acotando las filas con sheetRows', async () => {
      mockInserts();

      await POST(formRequest({ file: simpleExcel() }));

      expect(readMock).toHaveBeenCalledTimes(1);
      expect(readMock.mock.calls[0][1]).toMatchObject({
        type: 'buffer',
        sheetRows: IMPORT_EXCEL_MAX_ROWS + 2,
      });
    });

    it('libro con IMPORT_EXCEL_MAX_SHEETS + 1 hojas devuelve 400', async () => {
      const sheets: Record<string, Record<string, unknown>[]> = {};
      for (let i = 1; i <= IMPORT_EXCEL_MAX_SHEETS + 1; i++) sheets[`Hoja ${i}`] = [{ Actividad: 'A' }];

      const response = await POST(formRequest({ file: excelFile(sheets) }));

      await expect400(response, 'El archivo tiene demasiadas hojas (máximo 50)');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('Excel con IMPORT_EXCEL_MAX_ROWS + 1 filas en una hoja devuelve 400 y no inserta nada', async () => {
      const response = await POST(formRequest({
        file: excelFile({ 'Empresa Alfa': rowsOf(IMPORT_EXCEL_MAX_ROWS + 1) }),
      }));

      await expect400(response, 'El archivo supera el máximo de 2000 filas');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('Excel con el total de filas repartido entre dos hojas por encima del límite devuelve 400', async () => {
      const half = IMPORT_EXCEL_MAX_ROWS / 2;
      const response = await POST(formRequest({
        file: excelFile({
          'Empresa Alfa': rowsOf(half, 'A'),
          'Otra': rowsOf(half + 1, 'B'),
        }),
      }));

      await expect400(response, 'El archivo supera el máximo de 2000 filas');
      expectNoDbCalls();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('acepta exactamente IMPORT_EXCEL_MAX_ROWS filas', async () => {
      const valuesCalls = mockInserts();

      const response = await POST(formRequest({
        file: excelFile({ 'Empresa Alfa': rowsOf(IMPORT_EXCEL_MAX_ROWS) }),
      }));

      expect(response.status).toBe(201);
      expect((await response.json()).tasksImported).toBe(IMPORT_EXCEL_MAX_ROWS);
      const taskCall = valuesCalls.find(c => c.table === 'taskTemplates');
      expect(taskCall?.values).toHaveLength(IMPORT_EXCEL_MAX_ROWS);
    });
  });

  describe('importación válida', () => {
    it('importa dentro de una sola transacción y responde 201 con la misma forma', async () => {
      const valuesCalls = mockInserts();

      const response = await POST(formRequest({
        file: excelFile({
          'Empresa Alfa': [
            { Actividad: 'Conciliar bancos', Duracion: 40, Responsable: 'Juan', Estado: '' },
            { Actividad: 'Revisar nómina', Duracion: 3, Responsable: '', Estado: 'x' },
            { Actividad: 'Cerrar libro', Duracion: '', Responsable: 'Desconocido', Estado: 'No Aplica' },
            { Actividad: 'Declarar IVA', Duracion: 2, Responsable: '', Estado: '' },
          ],
          'Sin empresa': [{ Actividad: 'Ignorada' }],
        }),
        templateName: '  Cierre de prueba  ',
        targetCycleDays: '12',
      }));

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(['sheetsProcessed', 'skippedSheets', 'tasksImported', 'template']);
      expect(body).toEqual({
        template: { id: templateId, name: 'Cierre de prueba', periodicity: 'mensual', targetCycleDays: 12 },
        tasksImported: 4,
        sheetsProcessed: 1,
        skippedSheets: ['Sin empresa'],
      });

      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.txInsert).toHaveBeenCalledTimes(2);
      expect(valuesCalls[0]).toEqual({
        table: 'spaceTemplates',
        values: { name: 'Cierre de prueba', periodicity: 'mensual', targetCycleDays: 12 },
      });
      expect(valuesCalls[1]).toEqual({
        table: 'taskTemplates',
        values: [
          {
            spaceTemplateId: templateId,
            taskName: 'Conciliar bancos',
            companyId: companyA.id,
            order: 1,
            businessDayLimit: 30,
            defaultResponsibleId: personJuan.id,
          },
          {
            spaceTemplateId: templateId,
            taskName: 'Revisar nómina',
            companyId: companyA.id,
            order: 2,
            businessDayLimit: 1,
            applies: false,
            notApplicableReason: 'Marcada como N/A en importación',
          },
          {
            spaceTemplateId: templateId,
            taskName: 'Cerrar libro',
            companyId: companyA.id,
            order: 3,
            businessDayLimit: 1,
            applies: false,
            notApplicableReason: 'Marcada como N/A en importación',
          },
          {
            spaceTemplateId: templateId,
            taskName: 'Declarar IVA',
            companyId: companyA.id,
            order: 4,
            businessDayLimit: 2,
            defaultResponsibleId: null,
          },
        ],
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('sin templateName ni targetCycleDays usa los valores por defecto', async () => {
      const valuesCalls = mockInserts();

      const response = await POST(formRequest({ file: simpleExcel() }));

      expect(response.status).toBe(201);
      expect(valuesCalls[0]).toEqual({
        table: 'spaceTemplates',
        values: { name: 'Cierre mensual (importado)', periodicity: 'mensual', targetCycleDays: 10 },
      });
      const tasks = valuesCalls[1].values as { businessDayLimit: number }[];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].businessDayLimit).toBe(5);
    });

    it('templateName en blanco y targetCycleDays vacío usan los valores por defecto', async () => {
      const valuesCalls = mockInserts();

      const response = await POST(formRequest({ file: simpleExcel(), templateName: '   ', targetCycleDays: '' }));

      expect(response.status).toBe(201);
      expect(valuesCalls[0].values).toEqual({
        name: 'Cierre mensual (importado)',
        periodicity: 'mensual',
        targetCycleDays: 10,
      });
    });

    it('si ninguna hoja empareja crea la plantilla sin insertar tareas', async () => {
      const valuesCalls = mockInserts();

      const response = await POST(formRequest({ file: excelFile({ 'Otra cosa': [{ Actividad: 'A' }] }) }));

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        tasksImported: 0,
        sheetsProcessed: 0,
        skippedSheets: ['Otra cosa'],
      });
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.txInsert).toHaveBeenCalledTimes(1);
      expect(valuesCalls.map(c => c.table)).toEqual(['spaceTemplates']);
    });
  });
});
