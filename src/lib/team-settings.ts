// Ajustes globales del equipo: tabla team_settings, de una sola fila (id = 1).
// Por ahora sólo «Mostrar métricas por persona» (DECISIONES §22, PLAN-PRODUCTO §5).

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { teamSettings } from '@/lib/db/schema';

export const TEAM_SETTINGS_ID = 1;

export type TeamSettings = { showPersonMetrics: boolean };

/** Sin fila valen los valores por defecto: nada de lo que existía desaparece tras el despliegue. */
export const DEFAULT_TEAM_SETTINGS: TeamSettings = { showPersonMetrics: true };

export const PERSON_METRICS_DISABLED_MESSAGE =
  'Las métricas por persona están desactivadas por decisión del equipo. Un admin puede activarlas en Ajustes del equipo.';

type Executor = Pick<typeof db, 'select'>;

export async function getTeamSettings(executor: Executor = db): Promise<TeamSettings> {
  const [row] = await executor
    .select({ showPersonMetrics: teamSettings.showPersonMetrics })
    .from(teamSettings)
    .where(eq(teamSettings.id, TEAM_SETTINGS_ID))
    .limit(1);
  return row ? { showPersonMetrics: row.showPersonMetrics } : { ...DEFAULT_TEAM_SETTINGS };
}

/** Texto legible para audit_log. */
export function personMetricsAuditValue(enabled: boolean): string {
  return `Métricas por persona: ${enabled ? 'activadas' : 'desactivadas'}`;
}

/** Lanza un 403 (con httpStatus, lo respeta handleError) si el ajuste está apagado. */
export function assertPersonMetricsEnabled(settings: TeamSettings): void {
  if (!settings.showPersonMetrics) {
    throw Object.assign(new Error(PERSON_METRICS_DISABLED_MESSAGE), { httpStatus: 403 });
  }
}
