import { describe, expect, it } from 'vitest';
import { redactTaskAuditForRole } from '../src/lib/audit-redaction';

type Entry = {
  id: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  timestamp: string;
  actorName: string;
};

function entries(): Entry[] {
  return [
    { id: '1', action: 'comment_deleted', previousValue: 'texto borrado', newValue: null, reason: null, timestamp: '2026-11-12T10:00:00Z', actorName: 'Ana' },
    { id: '2', action: 'comment_deleted', previousValue: 'texto moderado', newValue: null, reason: 'Moderado por admin', timestamp: '2026-11-12T09:00:00Z', actorName: 'Admin' },
    { id: '3', action: 'comment_edited', previousValue: 'antes mod', newValue: 'después mod', reason: 'Moderado por admin', timestamp: '2026-11-12T08:00:00Z', actorName: 'Admin' },
    { id: '4', action: 'comment_edited', previousValue: 'antes autor', newValue: 'después autor', reason: null, timestamp: '2026-11-12T07:00:00Z', actorName: 'Ana' },
    { id: '5', action: 'status_changed', previousValue: 'en_proceso', newValue: 'completada', reason: null, timestamp: '2026-11-12T06:00:00Z', actorName: 'Ana' },
    { id: '6', action: 'due_date_changed', previousValue: '2026-11-01', newValue: '2026-11-10', reason: 'otro', timestamp: '2026-11-12T05:00:00Z', actorName: 'Luis' },
  ];
}

describe('redactTaskAuditForRole', () => {
  it('admin recibe todo intacto con redacted:false', () => {
    const input = entries();
    const out = redactTaskAuditForRole(input, 'admin');
    expect(out).toEqual(input.map((e) => ({ ...e, redacted: false })));
  });

  it.each(['miembro', 'observador'])('%s recibe los comentarios borrados y moderados sin texto', (role) => {
    const out = redactTaskAuditForRole(entries(), role);
    for (const i of [0, 1, 2]) {
      expect(out[i].previousValue).toBeNull();
      expect(out[i].newValue).toBeNull();
      expect(out[i].redacted).toBe(true);
    }
  });

  it.each(['miembro', 'observador'])('%s recibe intactas la edición del autor y otras acciones', (role) => {
    const input = entries();
    const out = redactTaskAuditForRole(input, role);
    for (const i of [3, 4, 5]) {
      expect(out[i]).toEqual({ ...input[i], redacted: false });
    }
  });

  it.each(['', 'superuser', 'Admin'])('un rol desconocido (%j) redacta: falla en cerrado', (role) => {
    const out = redactTaskAuditForRole(entries(), role);
    expect(out.slice(0, 3).every((e) => e.redacted && e.previousValue === null && e.newValue === null)).toBe(true);
    expect(out.slice(3).every((e) => !e.redacted)).toBe(true);
  });

  it('un comment_edited con otro reason no se redacta', () => {
    const [out] = redactTaskAuditForRole(
      [{ action: 'comment_edited', previousValue: 'a', newValue: 'b', reason: 'Moderado' }],
      'miembro',
    );
    expect(out).toEqual({ action: 'comment_edited', previousValue: 'a', newValue: 'b', reason: 'Moderado', redacted: false });
  });

  it('no muta la entrada', () => {
    const input = entries();
    const snapshot = structuredClone(input);
    const out = redactTaskAuditForRole(input, 'miembro');
    expect(input).toEqual(snapshot);
    expect(out[0]).not.toBe(input[0]);
    const outAdmin = redactTaskAuditForRole(input, 'admin');
    expect(input).toEqual(snapshot);
    expect(outAdmin[0]).not.toBe(input[0]);
  });

  it('conserva orden, reason, action, id, timestamp y actorName', () => {
    const input = entries();
    const out = redactTaskAuditForRole(input, 'observador');
    expect(out.map((e) => e.id)).toEqual(input.map((e) => e.id));
    out.forEach((e, i) => {
      expect(e.action).toBe(input[i].action);
      expect(e.reason).toBe(input[i].reason);
      expect(e.timestamp).toBe(input[i].timestamp);
      expect(e.actorName).toBe(input[i].actorName);
    });
  });

  it('una lista vacía devuelve una lista vacía', () => {
    expect(redactTaskAuditForRole([], 'miembro')).toEqual([]);
  });
});
