import type { ReactNode } from 'react';
import { AREA_LABEL } from '@/lib/labels';
import type { SprintSummary, SprintSummaryCount } from '@/lib/sprint-summary';

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function tally(c: SprintSummaryCount): string {
  return `${countLabel(c.tasks, 'tarea', 'tareas')} · ${countLabel(c.points, 'punto', 'puntos')}`;
}

/** Días del ciclo con su unidad: «1 día hábil», «3,5 días». */
function daysLabel(n: number, business: boolean): string {
  const value = String(n).replace('.', ',');
  if (business) return `${value} ${n === 1 ? 'día hábil' : 'días hábiles'}`;
  return `${value} ${n === 1 ? 'día' : 'días'}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 py-0.5">
      <dt className="font-medium text-[var(--text-secondary)]">{label}</dt>
      <dd className="text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

/**
 * Retrospectiva automática de un sprint cerrado (sprints.summary, versión 1).
 * Presentación pura. Con summary null: sprint cerrado antes de que existiera.
 */
export function SprintSummaryView({ summary }: { summary: SprintSummary | null }) {
  if (!summary) {
    return (
      <p className="py-2 text-xs text-[var(--text-muted)]">
        Sin resumen: este sprint se cerró antes de la retrospectiva automática
      </p>
    );
  }

  const { cycleTime } = summary;
  const business = cycleTime.unit === 'business';
  const carried = summary.carriedOver;

  return (
    <dl className="py-2 text-xs">
      <Row label="Comprometido">{tally(summary.committed)}</Row>
      <Row label="Completado">{tally(summary.completed)}</Row>
      <Row label="Arrastrado">
        {carried.tasks > 0 ? `${tally(carried)} → ${carried.to.name}` : tally(carried)}
      </Row>
      <Row label="Añadido a mitad de sprint">{tally(summary.addedMidSprint)}</Row>
      <Row label="Bloqueos por área">
        {summary.blockersByArea.length === 0
          ? 'Ninguno al cierre'
          : (
            <ul className="flex flex-wrap gap-x-3">
              {summary.blockersByArea.map(b => (
                <li key={b.area}>{`${AREA_LABEL[b.area] ?? b.area}: ${countLabel(b.count, 'tarea', 'tareas')}`}</li>
              ))}
            </ul>
          )}
      </Row>
      <Row label="Tiempo de ciclo">
        {cycleTime.count === 0 || cycleTime.median === null || cycleTime.p85 === null
          ? 'Sin tareas completadas'
          : [
            `Mediana ${daysLabel(cycleTime.median, business)} · p85 ${daysLabel(cycleTime.p85, business)}`,
            countLabel(cycleTime.count, 'tarea completada', 'tareas completadas'),
            ...(cycleTime.withoutStart > 0 ? [`${cycleTime.withoutStart} sin fecha de inicio`] : []),
          ].join(' · ')}
      </Row>
    </dl>
  );
}
