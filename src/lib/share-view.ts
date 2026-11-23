/**
 * Vista pública de sólo lectura de un proyecto (/compartido/[token]). Función pura, sin BD:
 * construye un DTO con una lista blanca explícita de campos, en lenguaje para no técnicos.
 * Nunca copia objetos de entrada: así no se filtran personas, correos, comentarios, número
 * FOR-, PR, rama, descripción ni el texto libre del bloqueo aunque vengan en la entrada.
 */

import { formatShortDateRD } from '@/lib/date-utils';
import type { BacktestResult, Forecast, ProjectForecast } from '@/lib/forecast';
import {
  HEALTH_LABEL,
  healthLabel,
  PUBLIC_BLOCK_AREA_LABEL,
  PUBLIC_MILESTONE_STATUS_LABEL,
  PUBLIC_STATUS_LABEL,
  SPACE_STATUS_PUBLIC_LABEL,
  STATUS_ORDER,
  type HealthCode,
  type PublicMilestoneStatus,
  type TaskStatus,
} from '@/lib/labels';

export const NO_TASKS_LABEL = 'Sin tareas todavía';

export type SharedViewSpace = {
  name: string;
  objective: string | null;
  declaredHealth: string | null;
  status: string;
};

export type SharedViewMilestone = {
  id: string;
  name: string;
  targetDate: string;
  completed: boolean;
  order: number;
  createdAt: Date | string;
};

export type SharedViewTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  blockedByArea: string | null;
  milestoneId: string | null;
  sprintId: string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  archived: boolean;
};

export type SharedProjectView = {
  name: string;
  objective: string | null;
  health: { code: HealthCode | null; label: string };
  status: { code: string; label: string };
  /** Hoy en RD ('YYYY-MM-DD'): decide si las fechas llevan año. */
  today: string;
  totalTasks: number;
  completedTasks: number;
  /** null si no hay tareas: nunca 100 % sin trabajo. */
  percentComplete: number | null;
  progressLabel: string;
  statusCounts: { status: TaskStatus; label: string; count: number }[];
  milestones: {
    name: string;
    targetDate: string;
    status: PublicMilestoneStatus;
    statusLabel: string;
    taskCount: number;
    openTasks: number;
    /** null en los hitos cumplidos. */
    forecast: Forecast | null;
  }[];
  activeSprint: { taskCount: number; openTasks: number; forecast: Forecast } | null;
  backtest: BacktestResult;
  risks: { title: string; reasons: string[] }[];
};

export type BuildSharedProjectViewInput = {
  space: SharedViewSpace;
  milestones: SharedViewMilestone[];
  tasks: SharedViewTask[];
  forecast: ProjectForecast;
  today: string;
};

function milestoneStatus(m: SharedViewMilestone, today: string): PublicMilestoneStatus {
  if (m.completed) return 'cumplido';
  if (m.targetDate < today) return 'atrasado';
  return 'en_curso';
}

function blockedReason(area: string | null): string {
  return area && Object.hasOwn(PUBLIC_BLOCK_AREA_LABEL, area)
    ? `Bloqueado por ${PUBLIC_BLOCK_AREA_LABEL[area]}`
    : 'Bloqueado';
}

function riskReasons(t: SharedViewTask, today: string): string[] {
  const reasons: string[] = [];
  if (t.status === 'bloqueada') reasons.push(blockedReason(t.blockedByArea));
  if (t.dueDate && t.dueDate < today) reasons.push(`Vencida desde el ${formatShortDateRD(t.dueDate, today)}`);
  return reasons;
}

function countTasks(tasks: SharedViewTask[]) {
  return { taskCount: tasks.length, openTasks: tasks.filter(t => t.status !== 'completada').length };
}

export function buildSharedProjectView({
  space, milestones, tasks, forecast, today,
}: BuildSharedProjectViewInput): SharedProjectView {
  const live = tasks.filter(t => !t.archived);
  const completed = live.filter(t => t.status === 'completada').length;
  const percentComplete = live.length ? Math.round((completed / live.length) * 100) : null;

  const health = space.declaredHealth && Object.hasOwn(HEALTH_LABEL, space.declaredHealth)
    ? space.declaredHealth as HealthCode
    : null;
  const spaceStatus = String(space.status);

  const forecastByMilestone = new Map(forecast.milestones.map(m => [m.id, m.forecast]));

  const risks = live
    .filter(t => t.status !== 'completada')
    .map(t => ({ task: t, reasons: riskReasons(t, today) }))
    .filter(r => r.reasons.length > 0)
    .sort((a, b) => (a.task.dueDate ?? '9999-12-31').localeCompare(b.task.dueDate ?? '9999-12-31')
      || a.task.title.localeCompare(b.task.title, 'es'))
    .map(r => ({ title: r.task.title, reasons: r.reasons }));

  const active = forecast.activeSprint;

  return {
    name: space.name,
    objective: space.objective ?? null,
    health: { code: health, label: healthLabel(health) },
    status: {
      code: spaceStatus,
      label: Object.hasOwn(SPACE_STATUS_PUBLIC_LABEL, spaceStatus)
        ? SPACE_STATUS_PUBLIC_LABEL[spaceStatus as keyof typeof SPACE_STATUS_PUBLIC_LABEL]
        : '',
    },
    today,
    totalTasks: live.length,
    completedTasks: completed,
    percentComplete,
    progressLabel: percentComplete === null ? NO_TASKS_LABEL : `${percentComplete} % completado`,
    statusCounts: STATUS_ORDER.map(status => ({
      status,
      label: PUBLIC_STATUS_LABEL[status],
      count: live.filter(t => t.status === status).length,
    })),
    milestones: [...milestones]
      .sort((a, b) => a.order - b.order)
      .map(m => {
        const status = milestoneStatus(m, today);
        return {
          name: m.name,
          targetDate: m.targetDate,
          status,
          statusLabel: PUBLIC_MILESTONE_STATUS_LABEL[status],
          ...countTasks(live.filter(t => t.milestoneId === m.id)),
          forecast: m.completed ? null : forecastByMilestone.get(m.id) ?? null,
        };
      }),
    activeSprint: active
      ? { ...countTasks(live.filter(t => t.sprintId === active.id)), forecast: active.forecast }
      : null,
    backtest: {
      hits: forecast.backtest.hits,
      total: forecast.backtest.total,
      enough: forecast.backtest.enough,
    },
    risks,
  };
}
