import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function success<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
    console.error(err);
    return error('Error interno', 500);
  }
  return error('Error desconocido', 500);
}
