// Historial de estados de una tarea a partir de las filas de audit_log con
// action='status_changed'. Funciones puras: sin BD ni React. La carga de los
// eventos está en src/lib/status-history-query.ts.

import { STATUS_ORDER, type TaskStatus } from '@/lib/labels';

export type StatusEvent = { taskId: string; previousValue: string | null; newValue: string | null; at: Date };

/** Tramo en un estado. `to = null` es el tramo abierto (el estado actual). */
export type StatusSegment = { status: TaskStatus; from: Date; to: Date | null };

const VALID_STATUS = new Set<string>(STATUS_ORDER);

function isStatus(v: string | null): v is TaskStatus {
  return v !== null && VALID_STATUS.has(v);
}

/**
 * Construye los tramos de estado en orden cronológico. Nunca lanza:
 * - ordena los eventos por fecha (orden estable si empatan);
 * - ignora los `newValue` nulos o desconocidos y los que repiten el estado vigente;
 * - un evento anterior a `createdAt` cuenta como ocurrido en `createdAt`;
 * - no emite tramos de duración cero (en el mismo instante prevalece el último cambio);
 * - si `previousValue` no cuadra con el estado vigente (hueco), confía en `newValue`.
 */
export function buildStatusHistory(task: { createdAt: Date }, events: StatusEvent[]): StatusSegment[] {
  const createdMs = task.createdAt.getTime();
  // Array.prototype.sort es estable: los empates conservan el orden de entrada.
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());

  const segments: StatusSegment[] = [];
  let current: TaskStatus = 'no_iniciada';
  let segStart = task.createdAt;

  for (const e of sorted) {
    if (!isStatus(e.newValue) || e.newValue === current) continue;
    const atMs = Math.max(e.at.getTime(), createdMs);
    if (atMs > segStart.getTime()) {
      const at = new Date(atMs);
      pushMerged(segments, { status: current, from: segStart, to: at });
      segStart = at;
    }
    current = e.newValue;
  }
  pushMerged(segments, { status: current, from: segStart, to: null });
  return segments;
}

// Al descartar un tramo de duración cero pueden quedar dos tramos seguidos con
// el mismo estado (p. ej. en_proceso → bloqueada → en_proceso en el mismo instante):
// se fusionan en uno.
function pushMerged(segments: StatusSegment[], seg: StatusSegment) {
  const last = segments.at(-1);
  if (last && last.status === seg.status) {
    last.to = seg.to;
    return;
  }
  segments.push(seg);
}

/**
 * Inicio del trabajo: el `from` del primer tramo en `en_proceso` o `en_revision`
 * (cubre el salto directo a revisión). En las reaperturas se mantiene el PRIMER
 * inicio, así que el ciclo de una tarea reabierta incluye el tiempo que pasó en
 * `completada` entre medias. Es deliberado: mide cuánto tardó en quedar hecha.
 */
export function startedAt(history: StatusSegment[]): Date | null {
  const seg = history.find(s => s.status === 'en_proceso' || s.status === 'en_revision');
  return seg ? seg.from : null;
}

/** Milisegundos acumulados por estado. El tramo abierto se cierra en `now`. */
export function timeInStatus(history: StatusSegment[], now: Date): Partial<Record<TaskStatus, number>> {
  const out: Partial<Record<TaskStatus, number>> = {};
  for (const s of history) {
    const end = (s.to ?? now).getTime();
    const ms = Math.max(0, end - s.from.getTime());
    out[s.status] = (out[s.status] ?? 0) + ms;
  }
  return out;
}
