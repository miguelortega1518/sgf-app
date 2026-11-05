import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { z } from 'zod';
import { success, error, handleError } from '../src/lib/api-utils';
import { logger } from '../src/lib/logger';

async function read(res: Response) {
  return { status: res.status, body: await res.json() };
}

const withCause = (message: string, cause: unknown) => Object.assign(new Error(message), { cause });
const withStatus = (message: string, httpStatus: number) => Object.assign(new Error(message), { httpStatus });
const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });

let errorSpy: MockInstance<typeof logger.error>;

beforeEach(() => {
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('success', () => {
  it('responde 200 por defecto con el cuerpo tal cual', async () => {
    const { status, body } = await read(success({ a: 1 }));
    expect(status).toBe(200);
    expect(body).toEqual({ a: 1 });
  });

  it('acepta un estado personalizado', async () => {
    const { status, body } = await read(success({ id: 'x' }, 201));
    expect(status).toBe(201);
    expect(body).toEqual({ id: 'x' });
  });
});

describe('error', () => {
  it('responde 400 por defecto con { error }', async () => {
    const { status, body } = await read(error('msg'));
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'msg' });
  });

  it('usa el estado indicado y mezcla los campos extra en el cuerpo', async () => {
    const { status, body } = await read(error('msg', 404, { code: 'X' }));
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'msg', code: 'X' });
  });
});

describe('handleError', () => {
  describe('errores controlados (no se registran)', () => {
    it('responde 400 «JSON inválido» ante un SyntaxError', async () => {
      const { status, body } = await read(handleError(new SyntaxError('Unexpected token')));
      expect(status).toBe(400);
      expect(body).toEqual({ error: 'JSON inválido' });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('responde 409 ante una violación de unicidad (23505) directa', async () => {
      const { status, body } = await read(handleError(pgError('duplicate key value', '23505')));
      expect(status).toBe(409);
      expect(body).toEqual({ error: 'Ya existe un registro con esos datos' });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('responde 409 ante un 23505 anidado en cause (envoltorio de Drizzle)', async () => {
      const { status, body } = await read(handleError(withCause('Failed query', { code: '23505' })));
      expect(status).toBe(409);
      expect(body).toEqual({ error: 'Ya existe un registro con esos datos' });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('responde 400 con los mensajes de un ZodError unidos por comas', async () => {
      const schema = z.object({
        name: z.string().min(1, 'El nombre es obligatorio'),
        email: z.email('Correo inválido'),
      });
      const result = schema.safeParse({ name: '', email: 'x' });
      expect(result.success).toBe(false);
      if (result.success) return;
      const { status, body } = await read(handleError(result.error));
      expect(status).toBe(400);
      expect(body).toEqual({ error: 'El nombre es obligatorio, Correo inválido' });
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('errores con httpStatus', () => {
    it.each([
      [404, 'Proyecto no encontrado'],
      [400, 'Transición no permitida'],
      [503, 'Servicio no disponible'],
    ])('usa el httpStatus %i y el mensaje del error', async (httpStatus, message) => {
      const { status, body } = await read(handleError(withStatus(message, httpStatus)));
      expect(status).toBe(httpStatus);
      expect(body).toEqual({ error: message });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('ignora un httpStatus fuera de 4xx/5xx (302) y responde 500 genérico sin el mensaje original', async () => {
      const { status, body } = await read(handleError(withStatus('Redirigir a /secreto', 302)));
      expect(status).toBe(500);
      expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
      expect(body.error).toBe(`Error interno (ref. ${body.errorId})`);
      expect(JSON.stringify(body)).not.toContain('secreto');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('unhandled_api_error', expect.objectContaining({ errorId: body.errorId }));
    });
  });

  describe('autenticación y permisos', () => {
    it.each([
      ['UNAUTHORIZED', 401, { error: 'No autorizado' }],
      ['FORBIDDEN', 403, { error: 'Sin permisos' }],
      [
        'PASSWORD_CHANGE_REQUIRED',
        403,
        { error: 'Debe cambiar su contraseña para continuar', code: 'PASSWORD_CHANGE_REQUIRED' },
      ],
    ])('traduce %s a %i', async (message, expectedStatus, expectedBody) => {
      const { status, body } = await read(handleError(new Error(message)));
      expect(status).toBe(expectedStatus);
      expect(body).toEqual(expectedBody);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('errores no controlados', () => {
    it('responde 500 con una referencia y sin filtrar el mensaje interno', async () => {
      const err = new Error('Failed query: select password_hash params: ana@empresa.com');
      const { status, body } = await read(handleError(err));
      expect(status).toBe(500);
      expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
      expect(body.error).toBe(`Error interno (ref. ${body.errorId})`);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('ana@empresa.com');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('unhandled_api_error', expect.objectContaining({ errorId: body.errorId }));
    });

    it('no revienta con un valor lanzado que no es Error', async () => {
      const { status, body } = await read(handleError('boom'));
      expect(status).toBe(500);
      expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
      expect(body.error).toBe(`Error interno (ref. ${body.errorId})`);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('unhandled_api_error', expect.objectContaining({ errorId: body.errorId }));
    });

    it.each([
      ['ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.1:5432'],
      ['ENOTFOUND', 'getaddrinfo ENOTFOUND dpg-xyz-a'],
    ])('responde 503 cuando la base no está disponible (%s)', async (code, message) => {
      const { status, body } = await read(handleError(withCause('Failed query', pgError(message, code))));
      expect(status).toBe(503);
      expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
      expect(body.error.startsWith('No hay conexión con la base de datos')).toBe(true);
      expect(body.error).toContain(`(ref. ${body.errorId})`);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('db_unavailable', expect.objectContaining({ errorId: body.errorId }));
    });

    it('responde 500 con aviso de esquema desactualizado ante una columna inexistente', async () => {
      const err = withCause('Failed query', pgError('column "number" does not exist', '42703'));
      const { status, body } = await read(handleError(err));
      expect(status).toBe(500);
      expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
      expect(body.error.startsWith('La base de datos no está al día')).toBe(true);
      expect(body.error).toContain(`(ref. ${body.errorId})`);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('schema_mismatch', expect.objectContaining({ errorId: body.errorId }));
    });
  });
});
