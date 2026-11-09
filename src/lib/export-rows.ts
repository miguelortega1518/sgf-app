// Conversión de filas de la base a filas de exporte y reporte (XLSX/PDF).
// Funciones puras: el vocabulario visible sale de src/lib/labels.ts.

import { STATUS_LABEL, PRIORITY_LABEL, SPACE_TYPE_LABEL, AREA_LABEL } from '@/lib/labels';
import { toDateRD } from '@/lib/date-utils';

type Nullable<T> = T | null | undefined;

// Etiqueta del valor; si no hay etiqueta, el valor crudo; si no hay valor, ''.
function labelOr(map: Record<string, string>, v: Nullable<string>): string {
  if (v === null || v === undefined) return '';
  return map[v] ?? v;
}

const statusLabel = (v: Nullable<string>) => labelOr(STATUS_LABEL as Record<string, string>, v);
const priorityLabel = (v: Nullable<string>) => labelOr(PRIORITY_LABEL, v);
const areaLabel = (v: Nullable<string>) => labelOr(AREA_LABEL, v);
const completedDate = (v: Nullable<Date | string>) => (v ? toDateRD(v) : '');

export interface TaskExportInput {
  spaceName: string;
  spaceType: string;
  companyName: Nullable<string>;
  taskTitle: string;
  responsibleName: string;
  reviewerName: Nullable<string>;
  status: string;
  priority: string;
  dueDate: Nullable<string>;
  dueDateOriginal: Nullable<string>;
  completedAt: Nullable<Date | string>;
  blockedByArea: Nullable<string>;
  delayReason: Nullable<string>;
}

// Las filas de salida son alias de tipo (no interfaces) para que sean asignables
// a Record<string, string> al calcular anchos de columna.
export type TaskExportRow = {
  'Proyecto': string;
  'Tipo': string;
  'Repositorio': string;
  'Tarea': string;
  'Responsable': string;
  'Revisor': string;
  'Estado': string;
  'Prioridad': string;
  'Fecha límite': string;
  'Fecha original': string;
  'Completada': string;
  'Bloqueada por': string;
  'Razón retraso': string;
}

export function taskExportRow(r: TaskExportInput): TaskExportRow {
  return {
    'Proyecto': r.spaceName,
    'Tipo': labelOr(SPACE_TYPE_LABEL, r.spaceType),
    'Repositorio': r.companyName ?? '',
    'Tarea': r.taskTitle,
    'Responsable': r.responsibleName,
    'Revisor': r.reviewerName ?? '',
    'Estado': statusLabel(r.status),
    'Prioridad': priorityLabel(r.priority),
    'Fecha límite': r.dueDate ?? '',
    'Fecha original': r.dueDateOriginal ?? '',
    'Completada': completedDate(r.completedAt),
    'Bloqueada por': areaLabel(r.blockedByArea),
    'Razón retraso': r.delayReason ?? '',
  };
}

export interface PersonaReportInput {
  spaceName: string;
  title: string;
  status: string;
  priority: string;
  companyName: Nullable<string>;
  reviewerName: Nullable<string>;
  dueDate: Nullable<string>;
  dueDateOriginal: Nullable<string>;
  completedAt: Nullable<Date | string>;
  blockedByArea: Nullable<string>;
}

export type PersonaReportRow = {
  'Proyecto': string;
  'Tarea': string;
  'Estado': string;
  'Prioridad': string;
  'Repositorio': string;
  'Revisor': string;
  'Fecha límite': string;
  'Fecha original': string;
  'Completada': string;
  'Bloqueada por': string;
}

export function personaReportRow(r: PersonaReportInput): PersonaReportRow {
  return {
    'Proyecto': r.spaceName,
    'Tarea': r.title,
    'Estado': statusLabel(r.status),
    'Prioridad': priorityLabel(r.priority),
    'Repositorio': r.companyName ?? '',
    'Revisor': r.reviewerName ?? '',
    'Fecha límite': r.dueDate ?? '',
    'Fecha original': r.dueDateOriginal ?? '',
    'Completada': completedDate(r.completedAt),
    'Bloqueada por': areaLabel(r.blockedByArea),
  };
}

export interface RepoReportInput {
  spaceName: string;
  title: string;
  responsibleName: string;
  reviewerName: Nullable<string>;
  status: string;
  priority: string;
  dueDate: Nullable<string>;
  completedAt: Nullable<Date | string>;
  blockedByArea: Nullable<string>;
}

export type RepoReportRow = {
  'Proyecto': string;
  'Tarea': string;
  'Responsable': string;
  'Revisor': string;
  'Estado': string;
  'Prioridad': string;
  'Fecha límite': string;
  'Completada': string;
  'Bloqueada por': string;
}

export function repoReportRow(r: RepoReportInput): RepoReportRow {
  return {
    'Proyecto': r.spaceName,
    'Tarea': r.title,
    'Responsable': r.responsibleName,
    'Revisor': r.reviewerName ?? '',
    'Estado': statusLabel(r.status),
    'Prioridad': priorityLabel(r.priority),
    'Fecha límite': r.dueDate ?? '',
    'Completada': completedDate(r.completedAt),
    'Bloqueada por': areaLabel(r.blockedByArea),
  };
}

export interface DueReportInput {
  spaceName: string;
  title: string;
  responsibleName: string;
  status: string;
  priority: string;
  companyName: Nullable<string>;
  dueDate: Nullable<string>;
  dueDateOriginal: Nullable<string>;
  blockedByArea: Nullable<string>;
}

export type DueReportRow = {
  'Estado vencimiento': string;
  'Proyecto': string;
  'Tarea': string;
  'Responsable': string;
  'Estado': string;
  'Prioridad': string;
  'Repositorio': string;
  'Fecha límite': string;
  'Fecha ajustada': string;
  'Bloqueada por': string;
}

/** Fila del reporte de vencimientos; `today` es la fecha RD YYYY-MM-DD. */
export function dueReportRow(r: DueReportInput, today: string): DueReportRow {
  const isOverdue = r.dueDateOriginal ? r.dueDateOriginal < today : false;
  const daysLeft = r.dueDateOriginal
    ? Math.ceil((new Date(r.dueDateOriginal).getTime() - new Date(today).getTime()) / 86400000)
    : null;
  return {
    'Estado vencimiento': isOverdue ? `VENCIDA (${Math.abs(daysLeft!)} días)` : `${daysLeft} días restantes`,
    'Proyecto': r.spaceName,
    'Tarea': r.title,
    'Responsable': r.responsibleName,
    'Estado': statusLabel(r.status),
    'Prioridad': priorityLabel(r.priority),
    'Repositorio': r.companyName ?? '',
    'Fecha límite': r.dueDateOriginal ?? '',
    'Fecha ajustada': r.dueDate !== r.dueDateOriginal ? (r.dueDate ?? '') : '',
    'Bloqueada por': areaLabel(r.blockedByArea),
  };
}
