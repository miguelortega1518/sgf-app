import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { teamSettings } from '@/lib/db/schema';
import { requireRole, requireSession } from '@/lib/auth';
import { success, handleError } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { teamSettingsSchema } from '@/lib/schemas/team-settings';
import {
  DEFAULT_TEAM_SETTINGS, TEAM_SETTINGS_ID, getTeamSettings, personMetricsAuditValue,
} from '@/lib/team-settings';

/** Ajustes del equipo. Los puede leer cualquier rol (la interfaz los necesita para ocultar vistas). */
export async function GET() {
  try {
    await requireSession();
    return success(await getTeamSettings());
  } catch (err) {
    return handleError(err);
  }
}

/** Cambia los ajustes del equipo. Sólo un admin; cada cambio queda en la auditoría (DECISIONES §22). */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole('admin');
    const input = teamSettingsSchema.parse(await req.json());

    const saved = await db.transaction(async tx => {
      const [current] = await tx
        .select({ showPersonMetrics: teamSettings.showPersonMetrics })
        .from(teamSettings)
        .where(eq(teamSettings.id, TEAM_SETTINGS_ID))
        .limit(1)
        .for('update');
      const previous = current?.showPersonMetrics ?? DEFAULT_TEAM_SETTINGS.showPersonMetrics;
      if (previous === input.showPersonMetrics) return { showPersonMetrics: previous };

      const now = new Date();
      await tx
        .insert(teamSettings)
        .values({ id: TEAM_SETTINGS_ID, showPersonMetrics: input.showPersonMetrics, updatedBy: session.id, updatedAt: now })
        .onConflictDoUpdate({
          target: teamSettings.id,
          set: { showPersonMetrics: input.showPersonMetrics, updatedBy: session.id, updatedAt: now },
        });

      // Ajuste global: auditoría sin taskId ni spaceId.
      await logAudit({
        actorId: session.id,
        action: 'person_metrics_setting_changed',
        previousValue: personMetricsAuditValue(previous),
        newValue: personMetricsAuditValue(input.showPersonMetrics),
      }, tx);

      return { showPersonMetrics: input.showPersonMetrics };
    });

    return success(saved);
  } catch (err) {
    return handleError(err);
  }
}
