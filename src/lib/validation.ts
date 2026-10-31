/** Funciones de validación puras reutilizables en routes y tests. */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Verifica que la cadena sea una fecha ISO 8601 calendárica real (no solo el formato). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  // Confirma que día/mes no desbordaron (ej. "2024-13-01" → Date.parse avanza al mes siguiente)
  return d.toISOString().slice(0, 10) === value;
}

/** Verifica que la URL empiece por http:// o https://. */
export function isHttpUrl(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname; } catch { return false; }
}

/**
 * Lanza un error 400 si la cadena está vacía o es solo espacios en blanco.
 * Se usa para validar nombres de tareas/proyectos antes de persistir.
 */
export function assertNonEmpty(value: string, label = 'El campo'): void {
  if (!value.trim()) {
    const err = new Error(`${label} no puede estar vacío`);
    Object.assign(err, { httpStatus: 400 });
    throw err;
  }
}

/** Verifica si un error de base de datos corresponde a una violación de unicidad (código 23505). */
export function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; cause?: unknown };
  if (e.code === '23505') return true;
  if (e.cause) return isUniqueConstraintViolation(e.cause);
  return false;
}
