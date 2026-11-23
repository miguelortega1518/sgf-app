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

/**
 * ¿El evento es una salida de `sprint`? Espejo de isEntryInto: con ids, por
 * `reason.from`; en los eventos heredados sin ids, por `previousValue` igual al nombre.
 */
export function isExitFrom(event: SprintChangeEvent, sprint: { id: string; name: string }): boolean {
  const ids = parseSprintChangeReason(event.reason);
  if (ids) return ids.from === sprint.id;
  return event.previousValue === sprint.name;
}

/** Intervalo de pertenencia a un sprint: `from` null = desde siempre; `to` null = abierto. */
export type MembershipInterval = { from: Date | null; to: Date | null };

/**
 * Intervalos en los que la tarea perteneció a `sprint`, en orden cronológico.
 * - Los eventos se ordenan por `at` (orden estable si empatan).
 * - Antes del primer evento la tarea estaba dentro si ese evento es una salida;
 *   sin eventos, se usa `currentlyIn`.
 * - Tras cada evento, está dentro si el evento es una entrada en el sprint.
 * - Si el estado final no coincide con `currentlyIn` (datos heredados), se confía
 *   en `currentlyIn` desde el `at` del último evento.
 * No emite intervalos vacíos. Nunca lanza.
 */
export function sprintMembership(
  events: SprintChangeEvent[], sprint: { id: string; name: string }, currentlyIn: boolean,
): MembershipInterval[] {
  // Array.prototype.sort es estable: los empates conservan el orden de entrada.
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (sorted.length === 0) return currentlyIn ? [{ from: null, to: null }] : [];

  const out: MembershipInterval[] = [];
  const push = (from: Date | null, to: Date | null) => {
    if (from && to && to.getTime() <= from.getTime()) return;
    out.push({ from, to });
  };

  let inside = isExitFrom(sorted[0], sprint);
  let since: Date | null = null;
  for (const e of sorted) {
    const next = isEntryInto(e, sprint);
    if (inside && !next) push(since, e.at);
    if (!inside && next) since = e.at;
    inside = next;
  }

  const lastAt = sorted[sorted.length - 1].at;
  if (inside && currentlyIn) push(since, null);
  else if (inside && !currentlyIn) push(since, lastAt);
  else if (!inside && currentlyIn) push(lastAt, null);
  return out;
}

/** ¿`at` cae dentro de algún intervalo? `from` inclusivo, `to` exclusivo. */
export function isInSprintAt(intervals: MembershipInterval[], at: Date): boolean {
  const ms = at.getTime();
  return intervals.some(i => (i.from === null || i.from.getTime() <= ms) && (i.to === null || ms < i.to.getTime()));
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
