const RD_TIMEZONE = 'America/Santo_Domingo';

// Formatea una fecha como YYYY-MM-DD según la fecha local (nunca UTC).
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayRD(): string {
  const now = new Date();
  const rdDate = new Date(now.toLocaleString('en-US', { timeZone: RD_TIMEZONE }));
  return toLocalDateString(rdDate);
}

// Último día del mes anterior a `ref`, en fecha local. El día 0 de un mes es el
// último día del mes anterior; el constructor gestiona el cambio de año.
export function lastDayOfPreviousMonth(ref: Date = new Date()): string {
  return toLocalDateString(new Date(ref.getFullYear(), ref.getMonth(), 0));
}

export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'completada') return false;
  return dueDate < todayRD();
}

export function formatDateRD(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function toTimestampRD(date: Date): string {
  return date.toLocaleString('es-DO', {
    timeZone: RD_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0;
  const today = todayRD();
  if (dueDate >= today) return 0;
  const due = new Date(dueDate + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}
