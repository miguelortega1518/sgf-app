import { z } from 'zod';

// Sólo se validan los campos que usa el webhook; el resto del payload de GitHub se ignora.

const MAX_TEXT = 65536;
const MAX_LOGIN = 100;
const MAX_REQUESTED_REVIEWERS = 100;
const MAX_SHA = 100;
const MAX_URL = 500;
const MAX_CHECK_NAME = 255;
const MAX_CHECK_STATUS = 50;
const MAX_GITHUB_ID = Number.MAX_SAFE_INTEGER;

const action = z.string('Falta la acción del evento').max(100, 'La acción del evento no puede superar 100 caracteres');

function httpsUrl(what: string) {
  return z.string(`Falta la URL ${what}`)
    .max(MAX_URL, `La URL ${what} no puede superar ${MAX_URL} caracteres`)
    .url(`La URL ${what} no es válida`)
    .refine(u => u.startsWith('https://'), `La URL ${what} debe empezar por https://`);
}

/** `what` es el complemento completo: «del autor del PR», «del revisor pedido»… */
function login(what: string) {
  return z.object({
    login: z.string(`Falta el login ${what}`)
      .max(MAX_LOGIN, `El login ${what} no puede superar ${MAX_LOGIN} caracteres`),
  }, `Falta el login ${what}`);
}

function sha(what: string) {
  return z.string(`Falta el sha ${what}`)
    .min(1, `El sha ${what} no puede estar vacío`)
    .max(MAX_SHA, `El sha ${what} no puede superar ${MAX_SHA} caracteres`);
}

function githubId(what: string) {
  return z.number(`Falta el id ${what}`)
    .int(`El id ${what} debe ser un entero`)
    .positive(`El id ${what} debe ser positivo`)
    .max(MAX_GITHUB_ID, `El id ${what} es demasiado grande`);
}

function datetime(what: string) {
  return z.iso.datetime({ offset: true, error: `La fecha ${what} no es válida` }).nullable().optional();
}

// Status y conclusion son texto acotado, no enums: un valor desconocido cuenta como pendiente.
function checkText(what: string) {
  return z.string().max(MAX_CHECK_STATUS, `${what} no puede superar ${MAX_CHECK_STATUS} caracteres`).nullable().optional();
}

const requestedReviewers = z.array(login('del revisor pedido'), 'Los revisores pedidos deben ser una lista')
  .max(MAX_REQUESTED_REVIEWERS, `El PR no puede tener más de ${MAX_REQUESTED_REVIEWERS} revisores pedidos`)
  .default([]);

export const pullRequestEventSchema = z.object({
  action,
  requested_reviewer: login('del revisor pedido').optional(),
  pull_request: z.object({
    html_url: httpsUrl('del PR'),
    number: z.number('Falta el número del PR')
      .int('El número del PR debe ser un entero')
      .positive('El número del PR debe ser positivo')
      .max(1_000_000_000, 'El número del PR es demasiado grande'),
    state: z.enum(['open', 'closed'], 'El estado del PR debe ser open o closed'),
    title: z.string('Falta el título del PR').max(1000, 'El título del PR no puede superar 1000 caracteres'),
    body: z.string().max(MAX_TEXT, 'La descripción del PR no puede superar 65536 caracteres').nullable().optional(),
    draft: z.boolean('Falta el indicador de borrador del PR'),
    merged: z.boolean().nullable().optional(),
    created_at: datetime('de creación del PR'),
    updated_at: datetime('de actualización del PR'),
    merged_at: datetime('de fusión del PR'),
    closed_at: datetime('de cierre del PR'),
    user: login('del autor del PR'),
    requested_reviewers: requestedReviewers,
    head: z.object({
      ref: z.string('Falta la rama del PR').max(255, 'La rama del PR no puede superar 255 caracteres'),
      sha: sha('del PR'),
    }, 'Falta la rama del PR'),
  }, 'Faltan los datos del PR'),
});

export const pullRequestReviewEventSchema = z.object({
  action,
  review: z.object({
    user: login('del autor de la revisión'),
    state: z.string('Falta el estado de la revisión')
      .max(MAX_CHECK_STATUS, `El estado de la revisión no puede superar ${MAX_CHECK_STATUS} caracteres`),
    submitted_at: datetime('de la revisión'),
  }, 'Faltan los datos de la revisión'),
  pull_request: z.object({
    html_url: httpsUrl('del PR'),
    user: login('del autor del PR'),
    requested_reviewers: requestedReviewers,
  }, 'Faltan los datos del PR'),
});

const repository = z.object({
  html_url: httpsUrl('del repositorio'),
}, 'Faltan los datos del repositorio');

export const checkRunEventSchema = z.object({
  action,
  check_run: z.object({
    id: githubId('del check'),
    name: z.string('Falta el nombre del check')
      .max(MAX_CHECK_NAME, `El nombre del check no puede superar ${MAX_CHECK_NAME} caracteres`),
    head_sha: sha('del check'),
    status: z.string('Falta el estado del check')
      .max(MAX_CHECK_STATUS, `El estado del check no puede superar ${MAX_CHECK_STATUS} caracteres`),
    conclusion: checkText('El resultado del check'),
    check_suite: z.object({ id: githubId('de la suite') }, 'Falta la suite del check'),
  }, 'Faltan los datos del check'),
  repository,
});

export const checkSuiteEventSchema = z.object({
  action,
  check_suite: z.object({
    id: githubId('de la suite'),
    head_sha: sha('de la suite'),
    status: checkText('El estado de la suite'),
    conclusion: checkText('El resultado de la suite'),
  }, 'Faltan los datos de la suite'),
  repository,
});

export const pushEventSchema = z.object({
  ref: z.string('Falta la referencia del push').max(255, 'La referencia del push no puede superar 255 caracteres'),
  repository: z.object({
    default_branch: z.string('Falta la rama por defecto del repositorio')
      .max(255, 'La rama por defecto del repositorio no puede superar 255 caracteres'),
  }, 'Faltan los datos del repositorio'),
  commits: z.array(
    z.object({
      message: z.string('Falta el mensaje del commit').max(MAX_TEXT, 'El mensaje del commit no puede superar 65536 caracteres'),
    }),
    'Los commits deben ser una lista',
  ).max(2048, 'El push no puede tener más de 2048 commits').default([]),
});

export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;
export type PullRequestReviewEvent = z.infer<typeof pullRequestReviewEventSchema>;
export type CheckRunEvent = z.infer<typeof checkRunEventSchema>;
export type CheckSuiteEvent = z.infer<typeof checkSuiteEventSchema>;
export type PushEvent = z.infer<typeof pushEventSchema>;
