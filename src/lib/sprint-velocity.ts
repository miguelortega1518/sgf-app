// Velocidad por sprint cerrado y su tendencia (media móvil). Función pura: los
// totales completados salen de GET /api/spaces/[id]/sprints (`completed`).
//
// Excepción explícita a «mediana y p85, no promedios» (DECISIONES.md §18 y §21):
// la media móvil suaviza totales por sprint, no duraciones de tareas.

export type VelocitySprintInput = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  completed: { tasks: number; points: number };
};

export type VelocitySprint = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  tasks: number;
  points: number;
  /** Media móvil; null en el primer sprint del historial. */
  avgTasks: number | null;
  avgPoints: number | null;
};

export type SprintVelocity = {
  /** Hacen falta al menos 2 sprints cerrados para hablar de tendencia. */
  enoughData: boolean;
  unit: 'points' | 'tasks';
  sprints: VelocitySprint[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function movingAverage(values: number[], i: number, window: number): number | null {
  if (i === 0) return null;
  const from = Math.max(0, i - (window - 1));
  const slice = values.slice(from, i + 1);
  return round1(slice.reduce((s, v) => s + v, 0) / slice.length);
}

/**
 * Ordena cronológicamente (endDate y luego startDate), calcula la media móvil de
 * hasta `window` sprints sobre TODO el historial y se queda con los últimos
 * `limit`: la primera barra mostrada puede promediar sprints más antiguos.
 */
export function buildSprintVelocity(
  closedSprints: VelocitySprintInput[],
  { limit = 6, window = 3 }: { limit?: number; window?: number } = {},
): SprintVelocity {
  // Fechas 'YYYY-MM-DD': la comparación de cadenas vale.
  const ordered = [...closedSprints].sort((a, b) =>
    a.endDate.localeCompare(b.endDate) || a.startDate.localeCompare(b.startDate));
  const tasks = ordered.map(s => s.completed.tasks);
  const points = ordered.map(s => s.completed.points);

  const all: VelocitySprint[] = ordered.map((s, i) => ({
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    tasks: tasks[i],
    points: points[i],
    avgTasks: movingAverage(tasks, i, window),
    avgPoints: movingAverage(points, i, window),
  }));

  const shown = all.slice(Math.max(0, all.length - limit));
  return {
    enoughData: ordered.length >= 2,
    unit: shown.some(s => s.points > 0) ? 'points' : 'tasks',
    sprints: shown,
  };
}
