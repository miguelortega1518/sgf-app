import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';
import { classifyError, newErrorId } from './errors';

export function success<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    const messages = err.issues.map((e: { message: string }) => e.message).join(', ');
    return error(messages, 400);
  }
  if (err instanceof Error) {
    if (err.message === 'UNAUTHORIZED') {
      return error('No autorizado', 401);
    }
    if (err.message === 'FORBIDDEN') {
      return error('Sin permisos', 403);
    }
    if (err.message === 'PASSWORD_CHANGE_REQUIRED') {
      return error('Debe cambiar su contraseña para continuar', 403, { code: 'PASSWORD_CHANGE_REQUIRED' });
    }
  }

  const errorId = newErrorId();
  const info = classifyError(err);
  const event =
    info.kind === 'db_unavailable' ? 'db_unavailable' : info.kind === 'schema_mismatch' ? 'schema_mismatch' : 'unhandled_api_error';
  logger.error(event, {
    errorId,
    code: info.code,
    detail: info.detail,
    stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
  });

  if (info.kind === 'db_unavailable') {
    return error(`No hay conexión con la base de datos. Intente de nuevo en unos minutos (ref. ${errorId}).`, 503, { errorId });
  }
  if (info.kind === 'schema_mismatch') {
    return error(`La base de datos no está al día con esta versión de la aplicación (ref. ${errorId}). Avise al administrador.`, 500, { errorId });
  }
  return error(`Error interno (ref. ${errorId})`, 500, { errorId });
}
