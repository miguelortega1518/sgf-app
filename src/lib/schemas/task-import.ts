import { z } from 'zod';
import { isValidIsoDate } from '../validation';
import {
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_TITLE_MAX,
  TASK_DESCRIPTION_MAX,
  TASK_ESTIMATE_MIN,
  TASK_ESTIMATE_MAX,
  TASK_LABELS_MAX,
  TASK_LABEL_MAX,
} from './task';

export {
  TASK_KINDS,
  TASK_PRIORITIES,
  TASK_TITLE_MAX,
  TASK_DESCRIPTION_MAX,
  TASK_ESTIMATE_MIN,
  TASK_ESTIMATE_MAX,
  TASK_LABELS_MAX,
  TASK_LABEL_MAX,
};

/** Tamaño máximo del CSV, medido en bytes UTF-8 (1 MB). */
export const IMPORT_CSV_MAX_BYTES = 1048576;
/** Filas de datos máximas por importación (sin contar la cabecera ni las filas vacías). */
export const IMPORT_CSV_MAX_ROWS = 1000;
/** Filas que pinta la vista previa. */
export const IMPORT_CSV_PREVIEW_ROWS = 50;
/**
 * Importaciones por persona en la ventana del rate limit (WINDOW_MS de rate-limit-policy.ts,
 * 15 minutos): unas 12 por hora.
 */
export const IMPORT_CSV_MAX_PER_WINDOW = 3;
/** Holgura del cuerpo JSON: las comillas y saltos de línea escapados inflan el CSV. */
export const IMPORT_CSV_MAX_BODY_BYTES = 2 * IMPORT_CSV_MAX_BYTES + 4096;

export const importCsvBodySchema = z.object({
  csv: z.string().min(1, 'El CSV está vacío'),
  dryRun: z.boolean({ error: 'dryRun debe ser verdadero o falso' }),
  defaultResponsibleId: z.string().uuid('Responsable por defecto inválido').optional(),
});

export type ImportCsvBody = z.infer<typeof importCsvBodySchema>;

// Mensajes completos por campo: se devuelven tal cual al usuario.
export const IMPORT_MESSAGES = {
  titleRequired: 'El título es obligatorio',
  titleTooLong: `El título no puede superar los ${TASK_TITLE_MAX} caracteres`,
  descriptionTooLong: `La descripción no puede superar los ${TASK_DESCRIPTION_MAX} caracteres`,
  dueDateInvalid: 'La fecha límite debe ser una fecha real con formato AAAA-MM-DD o DD/MM/AAAA',
  priorityInvalid: 'La prioridad debe ser crítica, alta, normal o baja (o critical, high, medium, low)',
  kindInvalid: `El tipo debe ser uno de: ${TASK_KINDS.join(', ')} (o story, task, improvement, debt)`,
  estimateInvalid: `La estimación debe ser un número entero entre ${TASK_ESTIMATE_MIN} y ${TASK_ESTIMATE_MAX}`,
  tooManyLabels: `No se admiten más de ${TASK_LABELS_MAX} etiquetas por tarea`,
  labelTooLong: `Cada etiqueta admite como máximo ${TASK_LABEL_MAX} caracteres`,
} as const;

/** Valida una fila ya normalizada (textos recortados, alias traducidos, fecha en ISO). */
export const importRowSchema = z.object({
  title: z.string()
    .min(1, IMPORT_MESSAGES.titleRequired)
    .max(TASK_TITLE_MAX, IMPORT_MESSAGES.titleTooLong),
  description: z.string().max(TASK_DESCRIPTION_MAX, IMPORT_MESSAGES.descriptionTooLong).nullable(),
  dueDate: z.string().refine(isValidIsoDate, IMPORT_MESSAGES.dueDateInvalid).nullable(),
  priority: z.enum(TASK_PRIORITIES, { error: IMPORT_MESSAGES.priorityInvalid }),
  kind: z.enum(TASK_KINDS, { error: IMPORT_MESSAGES.kindInvalid }),
  estimate: z.number({ error: IMPORT_MESSAGES.estimateInvalid })
    .int(IMPORT_MESSAGES.estimateInvalid)
    .min(TASK_ESTIMATE_MIN, IMPORT_MESSAGES.estimateInvalid)
    .max(TASK_ESTIMATE_MAX, IMPORT_MESSAGES.estimateInvalid)
    .nullable(),
  labels: z.array(z.string().max(TASK_LABEL_MAX, IMPORT_MESSAGES.labelTooLong))
    .max(TASK_LABELS_MAX, IMPORT_MESSAGES.tooManyLabels),
});

export type ImportRowFields = z.infer<typeof importRowSchema>;
