// Historial de pertenencia de las tareas a sprints a partir de audit_log con
// action='task_sprint_changed'. Funciones puras: sin BD ni React. La carga de
// los eventos está en src/lib/sprint-history-query.ts.
//
// Desde la Fase 2 (3/8), `reason` guarda los ids `{"from","to"}` (previousValue y
// newValue siguen siendo nombres legibles). Los eventos anteriores no tienen ids y
// se reconocen por el nombre del sprint.

export type SprintChangeEvent = {
  taskId: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  at: Date;
};

export type SprintChangeReason = { from: string | null; to: string | null };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `reason` de un task_sprint_changed: ids del sprint de origen y destino (null = backlog). */
export function sprintChangeReason(from: string | null, to: string | null): string {
  return JSON.stringify({ from, to });
}

function isIdOrNull(v: unknown): v is string | null {
  return v === null || (typeof v === 'string' && UUID_REGEX.test(v));
}

/**
 * Lee el `reason` de un task_sprint_changed. Devuelve null si no es el JSON de ids
 * (texto libre, JSON inválido, array, claves ausentes o heredadas, valores no uuid).
 */
export function parseSprintChangeReason(reason: string | null | undefined): SprintChangeReason | null {
  if (!reason) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reason);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!Object.hasOwn(parsed, 'from') || !Object.hasOwn(parsed, 'to')) return null;
  const { from, to } = parsed as Record<string, unknown>;
  if (!isIdOrNull(from) || !isIdOrNull(to)) return null;
  return { from, to };
}

/**
 * ¿El evento es una entrada en `sprint`? Con ids, por `reason.to`; en los eventos
 * heredados sin ids, por `newValue` igual al nombre del sprint.
 */
export function isEntryInto(event: SprintChangeEvent, sprint: { id: string; name: string }): boolean {
  const ids = parseSprintChangeReason(event.reason);
  if (ids) return ids.to === sprint.id;
  return event.newValue === sprint.name;
}

/** Instante de la última entrada de la tarea en `sprint`, o null si no hay ninguna. */
export function lastEntryInto(events: SprintChangeEvent[], sprint: { id: string; name: string }): Date | null {
  let last: Date | null = null;
  for (const e of events) {
    if (!isEntryInto(e, sprint)) continue;
    if (!last || e.at.getTime() > last.getTime()) last = e.at;
  }
  return last;
}
