import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyGithubSignature,
  extractTaskNumber,
  extractClosingTaskNumbers,
  classifyPullRequest,
  targetStatusFor,
  summarizeOutcome,
  type GithubTrigger,
} from '../src/lib/github-webhook';

const SECRET = 'secreto-de-prueba';

function sign(body: Buffer, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  const body = Buffer.from(JSON.stringify({ hola: 'mundo', acento: 'á' }));

  it('acepta una firma correcta', () => {
    expect(verifyGithubSignature(SECRET, body, sign(body))).toBe(true);
  });

  it('rechaza si cambia un byte del cuerpo', () => {
    const altered = Buffer.from(body);
    altered[2] = altered[2] ^ 1;
    expect(verifyGithubSignature(SECRET, altered, sign(body))).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    expect(verifyGithubSignature(SECRET, body, sign(body, 'otro'))).toBe(false);
  });

  it.each([
    ['ausente', null],
    ['vacía', ''],
    ['sin prefijo sha256=', createHmac('sha256', SECRET).update(body).digest('hex')],
    ['con prefijo sha1=', `sha1=${createHmac('sha256', SECRET).update(body).digest('hex')}`],
    ['con hex corto', 'sha256=abcdef'],
    ['con hex largo', `${sign(body)}00`],
    ['con caracteres no hex', `sha256=${'z'.repeat(64)}`],
  ])('rechaza una cabecera %s sin lanzar', (_name, header) => {
    expect(() => verifyGithubSignature(SECRET, body, header)).not.toThrow();
    expect(verifyGithubSignature(SECRET, body, header)).toBe(false);
  });

  it.each([[undefined], ['']])('rechaza con secreto %j', (secret) => {
    expect(verifyGithubSignature(secret, body, sign(body, ''))).toBe(false);
  });

  it('acepta el hex en mayúsculas', () => {
    expect(verifyGithubSignature(SECRET, body, sign(body).toUpperCase().replace('SHA256=', 'sha256='))).toBe(true);
  });
});

describe('extractTaskNumber', () => {
  it.each([
    ['feat/FOR-12-filtros', 12],
    ['for-12', 12],
    ['FOR-1', 1],
    ['fix: FOR-999999999 al final', 999999999],
  ])('%s → %s', (text, expected) => {
    expect(extractTaskNumber(text)).toBe(expected);
  });

  it('la rama gana al título y el título al cuerpo', () => {
    expect(extractTaskNumber('feat/FOR-1-x', 'FOR-2 título', 'FOR-3 cuerpo')).toBe(1);
    expect(extractTaskNumber('feat/sin-clave', 'FOR-2 título', 'FOR-3 cuerpo')).toBe(2);
    expect(extractTaskNumber('feat/sin-clave', 'Título', 'Cierra FOR-3')).toBe(3);
  });

  it('acepta textos nulos o indefinidos', () => {
    expect(extractTaskNumber(null, undefined, 'FOR-4')).toBe(4);
  });

  it.each([
    ['sin clave'],
    ['FOR-1234567890'],
    ['XFOR-12'],
    ['FOR-'],
    ['FOR12'],
  ])('%s → null', (text) => {
    expect(extractTaskNumber(text)).toBeNull();
  });

  it('sin textos → null', () => {
    expect(extractTaskNumber()).toBeNull();
  });
});

describe('extractClosingTaskNumbers', () => {
  it('detecta Closes, Fixes y Resolves sin distinguir mayúsculas', () => {
    expect(extractClosingTaskNumbers(['Closes FOR-12', 'fixes for-7', 'RESOLVES FOR-3'])).toEqual([12, 7, 3]);
  });

  it('ignora otras palabras', () => {
    expect(extractClosingTaskNumbers(['Refs FOR-12', 'FOR-13 sin verbo', 'Close FOR-14'])).toEqual([]);
  });

  it('deduplica y respeta el orden de aparición', () => {
    expect(extractClosingTaskNumbers(['Fixes FOR-2 y closes FOR-1', 'Resolves FOR-2'])).toEqual([2, 1]);
  });

  it('respeta el máximo de 50 claves', () => {
    const messages = Array.from({ length: 80 }, (_, i) => `Closes FOR-${i + 1}`);
    const result = extractClosingTaskNumbers(messages);
    expect(result).toHaveLength(50);
    expect(result[0]).toBe(1);
    expect(result[49]).toBe(50);
  });

  it('admite un máximo distinto', () => {
    expect(extractClosingTaskNumbers(['Closes FOR-1, closes FOR-2, closes FOR-3'], 2)).toEqual([1, 2]);
  });

  it('no acepta claves de 10 dígitos', () => {
    expect(extractClosingTaskNumbers(['Closes FOR-1234567890'])).toEqual([]);
  });
});

describe('classifyPullRequest', () => {
  it.each([
    ['opened', false, false, 'pr_ready'],
    ['reopened', false, false, 'pr_ready'],
    ['ready_for_review', false, false, 'pr_ready'],
    ['opened', true, false, 'pr_draft'],
    ['reopened', true, false, 'pr_draft'],
    ['closed', false, true, 'pr_merged'],
    ['closed', false, false, 'pr_closed'],
    ['closed', false, null, 'pr_closed'],
    ['synchronize', false, false, null],
    ['edited', false, false, null],
    ['labeled', false, false, null],
  ] as const)('%s (draft=%s, merged=%s) → %s', (action, draft, merged, expected) => {
    expect(classifyPullRequest(action, { draft, merged })).toBe(expected);
  });
});

type Status = 'no_iniciada' | 'en_proceso' | 'en_revision' | 'completada' | 'bloqueada';

function task(status: Status, extra: { requiresApproval?: boolean; requiresEvidence?: boolean } = {}) {
  return { status, requiresApproval: false, requiresEvidence: false, ...extra };
}

describe('targetStatusFor', () => {
  it.each([
    ['pr_ready', task('en_proceso'), 'en_revision'],
    ['pr_ready', task('no_iniciada'), 'en_revision'],
    ['pr_ready', task('en_revision'), null],
    ['pr_draft', task('en_proceso'), null],
    ['pr_merged', task('en_revision'), 'completada'],
    ['pr_merged', task('en_proceso'), 'completada'],
    ['pr_merged', task('en_proceso', { requiresApproval: true }), 'en_revision'],
    ['pr_merged', task('en_revision', { requiresApproval: true }), null],
    ['pr_merged', task('en_proceso', { requiresEvidence: true }), 'en_revision'],
    ['pr_merged', task('en_revision', { requiresEvidence: true }), null],
    ['pr_closed', task('en_revision'), 'en_proceso'],
    ['pr_closed', task('no_iniciada'), null],
    ['pr_closed', task('en_proceso'), null],
    ['pr_closed', task('bloqueada'), null],
    ['push_closes', task('en_revision'), 'completada'],
    ['push_closes', task('en_proceso', { requiresApproval: true }), 'en_revision'],
    ['push_closes', task('en_revision', { requiresEvidence: true }), null],
  ] as const)('%s con %j → %s', (trigger, t, expected) => {
    expect(targetStatusFor(trigger, t)).toBe(expected);
  });

  it.each(['pr_ready', 'pr_draft', 'pr_merged', 'pr_closed', 'push_closes'] as GithubTrigger[])(
    '%s nunca mueve una tarea completada',
    (trigger) => {
      expect(targetStatusFor(trigger, task('completada'))).toBeNull();
      expect(targetStatusFor(trigger, task('completada', { requiresApproval: true }))).toBeNull();
    },
  );
});

describe('summarizeOutcome', () => {
  it('resume cada tarea', () => {
    expect(summarizeOutcome([
      { taskNumber: 12, outcome: 'aplicado' },
      { taskNumber: 13, outcome: 'sin_tarea' },
    ])).toBe('FOR-12: aplicado, FOR-13: sin_tarea');
  });

  it('trunca a 500 caracteres', () => {
    const results = Array.from({ length: 50 }, (_, i) => ({ taskNumber: 100000000 + i, outcome: 'sin_cambios' as const }));
    const summary = summarizeOutcome(results);
    expect(summary.length).toBe(500);
    expect(summary.startsWith('FOR-100000000: sin_cambios')).toBe(true);
  });

  it('sin resultados devuelve cadena vacía', () => {
    expect(summarizeOutcome([])).toBe('');
  });
});
