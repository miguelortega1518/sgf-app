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

const RD_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: RD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Fecha de calendario YYYY-MM-DD en hora RD para un instante dado, sin
// depender de la TZ del proceso. Se monta a partir de las partes para no
// confiar en el formato exacto que devuelve format().
export function toDateRD(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = RD_DATE_FORMAT.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// todayRD() + `days` días, con aritmética de fecha pura en UTC (independiente
// de la hora y de la TZ del proceso). Acepta valores negativos.
export function addDaysRD(days: number): string {
  const [y, m, d] = todayRD().split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, '0');
  const day = String(target.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Texto relativo de una fecha límite (YYYY-MM-DD) respecto a `today` (por
// defecto el día actual en RD): "Hoy", "Mañana", "en N días", "Ayer" o
// "hace N días". La diferencia se calcula con aritmética de calendario pura
// en UTC, igual que addDaysRD, así que no depende de la hora ni de la TZ.
export function relativeDueRD(dueDate: string, today: string = todayRD()): string {
  const [dy, dm, dd] = dueDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return diff > 0 ? `en ${diff} días` : `hace ${-diff} días`;
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
