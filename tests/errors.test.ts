import { describe, it, expect } from 'vitest';
import { classifyError, redact, newErrorId } from '../src/lib/errors';

const withCause = (message: string, cause: unknown) => Object.assign(new Error(message), { cause });
const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('classifyError', () => {
  it('ve a través del envoltorio de Drizzle: una caída de conexión no es un error interno cualquiera', () => {
    const err = withCause(
      'Failed query: select "id" from "persons" where "email" = $1 params: ana@empresa.com',
      pgError('getaddrinfo ENOTFOUND dpg-xyz-a', 'ENOTFOUND'),
    );
    const info = classifyError(err);
    expect(info.kind).toBe('db_unavailable');
    expect(info.code).toBe('ENOTFOUND');
    expect(info.detail).toBe('getaddrinfo ENOTFOUND dpg-xyz-a');
  });

  it('reconoce una columna inexistente como esquema desfasado (el fallo del deploy sin migrar)', () => {
    const info = classifyError(withCause('Failed query', pgError('column "number" does not exist', '42703')));
    expect(info.kind).toBe('schema_mismatch');
    expect(info.code).toBe('42703');
  });

  it('reconoce tabla inexistente y valor de enum inválido', () => {
    expect(classifyError(withCause('x', pgError('relation "tasks" does not exist', '42P01'))).kind).toBe('schema_mismatch');
    expect(classifyError(withCause('x', pgError('invalid input value for enum task_kind: "chore"', '22P02'))).kind).toBe('schema_mismatch');
  });

  it('no confunde un 22P02 que no es de enum', () => {
    expect(classifyError(pgError('invalid input syntax for type uuid: "abc"', '22P02')).kind).toBe('unknown');
  });

  it.each(['28P01', '3D000', '57P03', '53300', 'ECONNREFUSED', 'CONNECT_TIMEOUT'])('trata %s como base no disponible', (code) => {
    expect(classifyError(pgError('boom', code)).kind).toBe('db_unavailable');
  });

  it('mira dentro de un AggregateError (Node al probar varias direcciones)', () => {
    const agg = Object.assign(new Error(''), { errors: [pgError('connect ECONNREFUSED 10.0.0.1:5432', 'ECONNREFUSED')] });
    expect(classifyError(agg).kind).toBe('db_unavailable');
  });

  it('deja como desconocido lo que no se reconoce y no revienta con valores raros', () => {
    expect(classifyError(new Error('algo raro')).kind).toBe('unknown');
    expect(classifyError('texto').kind).toBe('unknown');
    expect(classifyError(undefined).kind).toBe('unknown');
  });
});

describe('redact', () => {
  it('quita los parámetros de la consulta, que pueden traer correos o hashes', () => {
    expect(redact('Failed query: update "persons" set "password_hash" = $1 params: $2b$12$abcdef')).toBe(
      'Failed query: update "persons" set "password_hash" = $1',
    );
  });
  it('recorta mensajes largos', () => {
    expect(redact('x'.repeat(1000))).toHaveLength(300);
  });
});

describe('newErrorId', () => {
  it('genera referencias cortas y distintas', () => {
    const a = newErrorId();
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(newErrorId()).not.toBe(a);
  });
});
