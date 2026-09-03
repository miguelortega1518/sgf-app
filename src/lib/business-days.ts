export function addBusinessDays(
  anchorDate: string,
  businessDays: number,
  holidays: Set<string>,
): string {
  let date = new Date(anchorDate + 'T12:00:00');
  let count = 0;

  while (count < businessDays) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dateStr = formatISO(date);
    if (holidays.has(dateStr)) continue;

    count++;
  }

  return formatISO(date);
}

export function countBusinessDays(
  startDate: string,
  endDate: string,
  holidays: Set<string>,
): number {
  let date = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  let count = 0;

  while (date < end) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    if (holidays.has(formatISO(date))) continue;
    count++;
  }

  return count;
}

export function isBusinessDay(dateStr: string, holidays: Set<string>): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !holidays.has(dateStr);
}

function formatISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
