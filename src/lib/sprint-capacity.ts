// Capacidad en puntos por persona y sprint (tabla sprint_capacity). Funciones
// puras: la ruta GET /api/spaces/[id]/sprints carga los datos en bloque y aquí
// se calcula el valor por defecto, lo asignado y la sobrecarga.
//
// La capacidad por defecto es la MEDIA de puntos completados en los 3 últimos
// sprints cerrados en los que la persona participó (DECISIONES.md): es sólo un
// valor inicial editable, no una métrica.

import type { SprintSummary } from '@/lib/sprint-summary';

export const SPRINT_CAPACITY_MAX = 999;
/** Sprints cerrados que se promedian para la capacidad por defecto. */
export const CAPACITY_HISTORY_SPRINTS = 3;

export type PersonSprintResult = { participated: boolean; completedPoints: number };

/** Datos de un sprint cerrado para la capacidad por defecto. */
export type ClosedSprintCapacity = {
  endDate: string;
  byPerson: Map<string, PersonSprintResult>;
};

/**
 * Media (Math.round) de los puntos completados por la persona en los 3 sprints
 * cerrados más recientes (por endDate) en los que participó. Sin ninguno → null.
 */
export function defaultCapacity(personId: string, closedSprints: ClosedSprintCapacity[]): number | null {
  const recent = closedSprints
    .filter(s => s.byPerson.get(personId)?.participated)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, CAPACITY_HISTORY_SPRINTS);
  if (recent.length === 0) return null;
  const total = recent.reduce((sum, s) => sum + (s.byPerson.get(personId)?.completedPoints ?? 0), 0);
  return Math.round(total / recent.length);
}

/**
 * Sprints cerrados antes de la retrospectiva automática (summary null): participa
 * quien tiene alguna tarea en el sprint; sus puntos son los de sus tareas completadas.
 */
export function capacityFromLegacyTasks(
  tasks: { responsibleId: string; status: string; estimate: number | null }[],
): Map<string, PersonSprintResult> {
  const out = new Map<string, PersonSprintResult>();
  for (const t of tasks) {
    const row = out.get(t.responsibleId) ?? { participated: true, completedPoints: 0 };
    if (t.status === 'completada') row.completedPoints += t.estimate ?? 0;
    out.set(t.responsibleId, row);
  }
  return out;
}

/** Sprints cerrados con retrospectiva: los datos salen de `summary.byPerson`. */
export function capacityFromSummary(summary: Pick<SprintSummary, 'byPerson'>): Map<string, PersonSprintResult> {
  const out = new Map<string, PersonSprintResult>();
  if (!Array.isArray(summary?.byPerson)) return out;
  for (const p of summary.byPerson) {
    out.set(p.personId, { participated: true, completedPoints: Number(p.completedPoints) || 0 });
  }
  return out;
}

export type CapacityRow = {
  personId: string;
  name: string;
  /** Capacidad en puntos; null = vacía («Sin datos»). */
  points: number | null;
  /** true si `points` es el valor por defecto (no hay fila en sprint_capacity). */
  isDefault: boolean;
  /** Suma de estimate (null = 0) de sus tareas no archivadas del sprint. */
  assigned: number;
  overloaded: boolean;
};

export type CapacityRowsInput = {
  /** Miembros del proyecto; los observadores se excluyen. */
  members: { personId: string; name: string; spaceRole: string }[];
  /** Valores guardados en sprint_capacity para este sprint. */
  saved: Map<string, number>;
  /** Capacidad por defecto por persona (null = sin datos). */
  defaults: Map<string, number | null>;
  /** Tareas no archivadas del sprint. */
  sprintTasks: { responsibleId: string; responsibleName: string; estimate: number | null }[];
};

/** Puntos por encima de la capacidad (0 si no hay sobrecarga o la capacidad está vacía). */
export function overloadPoints(row: { points: number | null; assigned: number }): number {
  return row.points !== null && row.assigned > row.points ? row.assigned - row.points : 0;
}

/**
 * Filas de la tabla de capacidad de un sprint: los miembros no observadores más
 * los responsables de tareas del sprint, ordenados por nombre.
 */
export function buildCapacityRows({ members, saved, defaults, sprintTasks }: CapacityRowsInput): CapacityRow[] {
  const people = new Map<string, string>();
  for (const m of members) {
    if (m.spaceRole !== 'observador') people.set(m.personId, m.name);
  }
  const assigned = new Map<string, number>();
  for (const t of sprintTasks) {
    if (!people.has(t.responsibleId)) people.set(t.responsibleId, t.responsibleName);
    assigned.set(t.responsibleId, (assigned.get(t.responsibleId) ?? 0) + (t.estimate ?? 0));
  }

  return [...people.entries()]
    .map(([personId, name]) => {
      const isDefault = !saved.has(personId);
      const points = isDefault ? (defaults.get(personId) ?? null) : saved.get(personId)!;
      const row = { personId, name, points, isDefault, assigned: assigned.get(personId) ?? 0 };
      return { ...row, overloaded: overloadPoints(row) > 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function pointsLabel(n: number): string {
  return `${n} ${n === 1 ? 'punto' : 'puntos'}`;
}

/** Valor legible de sprint_capacity_changed: 'Sprint 3 · Ana: 8 puntos' o '…: por defecto'. */
export function capacityAuditValue(sprintName: string, personName: string, points: number | null): string {
  return `${sprintName} · ${personName}: ${points === null ? 'por defecto' : pointsLabel(points)}`;
}
