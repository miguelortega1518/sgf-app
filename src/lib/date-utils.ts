const RD_TIMEZONE = 'America/Santo_Domingo';

export function todayRD(): string {
  const now = new Date();
  const rdDate = new Date(now.toLocaleString('en-US', { timeZone: RD_TIMEZONE }));
  const year = rdDate.getFullYear();
  const month = String(rdDate.getMonth() + 1).padStart(2, '0');
  const day = String(rdDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
