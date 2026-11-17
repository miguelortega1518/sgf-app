import { describe, expect, it } from 'vitest';
import {
  IMMEDIATE_EMAIL_TYPES,
  formatEmailPreferences,
  shouldSendImmediateEmail,
} from '../src/lib/notification-email-policy';

describe('IMMEDIATE_EMAIL_TYPES', () => {
  it('son exactamente asignación, revisión asignada, a revisión y bloqueo', () => {
    expect([...IMMEDIATE_EMAIL_TYPES]).toEqual(['task_assigned', 'review_assigned', 'task_review', 'task_blocked']);
  });
});

describe('shouldSendImmediateEmail', () => {
  it.each([
    ['task_assigned', true, true],
    ['review_assigned', true, true],
    ['task_review', true, true],
    ['task_blocked', true, true],
    ['task_completed', true, false],
    ['tipo_futuro', true, false],
    ['foo', true, false],
    ['task_assigned', false, false],
    ['review_assigned', false, false],
    ['task_review', false, false],
    ['task_blocked', false, false],
    ['task_completed', false, false],
    ['tipo_futuro', false, false],
  ])('%s con emailImmediate=%s → %s', (type, emailImmediate, expected) => {
    expect(shouldSendImmediateEmail({ type, emailImmediate })).toBe(expected);
  });
});

describe('formatEmailPreferences', () => {
  it.each([
    [{ emailImmediate: true, emailDigest: true }, 'Avisos inmediatos: sí · Resumen diario: sí'],
    [{ emailImmediate: false, emailDigest: true }, 'Avisos inmediatos: no · Resumen diario: sí'],
    [{ emailImmediate: true, emailDigest: false }, 'Avisos inmediatos: sí · Resumen diario: no'],
    [{ emailImmediate: false, emailDigest: false }, 'Avisos inmediatos: no · Resumen diario: no'],
  ])('%o → %s', (prefs, expected) => {
    expect(formatEmailPreferences(prefs)).toBe(expected);
  });
});
