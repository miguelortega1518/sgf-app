import { describe, expect, it } from 'vitest';
import { redactTaskAuditForRole } from '../src/lib/audit-redaction';
import { COMMENT_MODERATED_REASON } from '../src/lib/labels';

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

type ChainEntry = {
  id: string;
  action: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  timestamp?: Date | string | null;
  actorName?: string;
};

function deletedChain(): ChainEntry[] {
  return [
    { id: 'E1', action: 'comment_edited', previousValue: 'c0', newValue: 'c1', reason: null, timestamp: '2026-11-12T07:00:00Z', actorName: 'Ana' },
    { id: 'E2', action: 'comment_edited', previousValue: 'c1', newValue: 'c2', reason: null, timestamp: '2026-11-12T08:00:00Z', actorName: 'Ana' },
    { id: 'D', action: 'comment_deleted', previousValue: 'c2', newValue: null, reason: null, timestamp: '2026-11-12T09:00:00Z', actorName: 'Ana' },
  ];
}

function moderatedChain(): ChainEntry[] {
  return [
    { id: 'E1', action: 'comment_edited', previousValue: 'c0', newValue: 'c1', reason: null, timestamp: '2026-11-12T07:00:00Z', actorName: 'Ana' },
    { id: 'E2', action: 'comment_edited', previousValue: 'c1', newValue: 'c2', reason: null, timestamp: '2026-11-12T08:00:00Z', actorName: 'Ana' },
    { id: 'M', action: 'comment_edited', previousValue: 'c2', newValue: '[moderado]', reason: COMMENT_MODERATED_REASON, timestamp: '2026-11-12T09:00:00Z', actorName: 'Admin' },
    { id: 'E3', action: 'comment_edited', previousValue: '[moderado]', newValue: 'c3', reason: null, timestamp: '2026-11-12T10:00:00Z', actorName: 'Ana' },
  ];
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((e) => [e.id, e]));
}

function expectRedacted(entry: { previousValue: unknown; newValue: unknown; redacted: boolean }) {
  expect(entry.previousValue).toBeNull();
  expect(entry.newValue).toBeNull();
  expect(entry.redacted).toBe(true);
}

describe('redactTaskAuditForRole: ediciones del autor encadenadas a un borrado o moderación', () => {
  it.each(['miembro', 'observador', 'superuser'])('%s no ve ningún texto de la cadena borrada (C0→C1→C2→borrado)', (role) => {
    const out = redactTaskAuditForRole(deletedChain(), role);
    out.forEach(expectRedacted);
    const json = JSON.stringify(out);
    for (const text of ['c0', 'c1', 'c2']) expect(json).not.toContain(text);
    expect(out.map((e) => e.id)).toEqual(['E1', 'E2', 'D']);
    expect(out.map((e) => e.actorName)).toEqual(['Ana', 'Ana', 'Ana']);
  });

  it('la cadena terminada en edición moderada se redacta, pero la edición posterior a la moderación queda intacta', () => {
    const input = moderatedChain();
    const out = byId(redactTaskAuditForRole(input, 'miembro'));
    expectRedacted(out.E1);
    expectRedacted(out.E2);
    expectRedacted(out.M);
    expect(out.M.reason).toBe(COMMENT_MODERATED_REASON);
    expect(out.E3).toEqual({ ...input[3], redacted: false });
  });

  it('admin recibe toda la cadena intacta', () => {
    for (const input of [deletedChain(), moderatedChain()]) {
      expect(redactTaskAuditForRole(input, 'admin')).toEqual(input.map((e) => ({ ...e, redacted: false })));
    }
  });

  it('una edición de un comentario vivo, mezclada con una cadena borrada, queda intacta', () => {
    const live: ChainEntry = { id: 'L', action: 'comment_edited', previousValue: 'x', newValue: 'y', reason: null, timestamp: '2026-11-12T08:30:00Z', actorName: 'Luis' };
    const input = [...deletedChain(), live];
    const out = byId(redactTaskAuditForRole(input, 'miembro'));
    expect(out.L).toEqual({ ...live, redacted: false });
    expectRedacted(out.E1);
    expectRedacted(out.E2);
  });

  it('una edición con newValue del ancla pero posterior al ancla no se redacta', () => {
    const input: ChainEntry[] = [
      { id: 'D', action: 'comment_deleted', previousValue: 'c2', newValue: null, reason: null, timestamp: '2026-11-12T09:00:00Z' },
      { id: 'P', action: 'comment_edited', previousValue: 'otro', newValue: 'c2', reason: null, timestamp: '2026-11-12T09:00:01Z' },
    ];
    const out = byId(redactTaskAuditForRole(input, 'miembro'));
    expect(out.P).toEqual({ ...input[1], redacted: false });
  });

  it('con el mismo timestamp que el ancla se redacta', () => {
    const input: ChainEntry[] = [
      { id: 'D', action: 'comment_deleted', previousValue: 'c2', newValue: null, reason: null, timestamp: '2026-11-12T09:00:00Z' },
      { id: 'S', action: 'comment_edited', previousValue: 'otro', newValue: 'c2', reason: null, timestamp: '2026-11-12T09:00:00Z' },
    ];
    expectRedacted(byId(redactTaskAuditForRole(input, 'miembro')).S);
  });

  it.each([
    ['sin timestamp en la edición', undefined, '2026-11-12T09:00:00Z'],
    ['timestamp null en la edición', null, '2026-11-12T09:00:00Z'],
    ['timestamp inválido en la edición', 'no-es-fecha', '2026-11-12T09:00:00Z'],
    ['sin timestamp en el ancla', '2026-11-12T10:00:00Z', undefined],
  ])('%s: se redacta (falla en cerrado)', (_label, editTs, anchorTs) => {
    const input: ChainEntry[] = [
      { id: 'D', action: 'comment_deleted', previousValue: 'c2', newValue: null, reason: null, timestamp: anchorTs },
      { id: 'X', action: 'comment_edited', previousValue: 'c1', newValue: 'c2', reason: null, timestamp: editTs },
    ];
    expectRedacted(byId(redactTaskAuditForRole(input, 'miembro')).X);
  });

  it('funciona igual con timestamps Date y con la entrada en orden asc o desc', () => {
    const asDates = deletedChain().map((e) => ({ ...e, timestamp: new Date(e.timestamp as string) }));
    const live: ChainEntry = { id: 'L', action: 'comment_edited', previousValue: 'x', newValue: 'y', reason: null, timestamp: new Date('2026-11-12T08:30:00Z') };
    const asc = [...asDates, live];
    const desc = [...asc].reverse();
    const outAsc = byId(redactTaskAuditForRole(asc, 'miembro'));
    const outDesc = byId(redactTaskAuditForRole(desc, 'miembro'));
    expect(outDesc).toEqual(outAsc);
    for (const id of ['E1', 'E2', 'D']) expectRedacted(outAsc[id]);
    expect(outAsc.L.redacted).toBe(false);
    const outStringDesc = byId(redactTaskAuditForRole([...deletedChain()].reverse(), 'miembro'));
    for (const id of ['E1', 'E2', 'D']) expectRedacted(outStringDesc[id]);
  });

  it('termina con ciclos de texto y ediciones sin cambio, y los redacta', () => {
    const input: ChainEntry[] = [
      { id: 'AB', action: 'comment_edited', previousValue: 'A', newValue: 'B', reason: null, timestamp: '2026-11-12T07:00:00Z' },
      { id: 'BA', action: 'comment_edited', previousValue: 'B', newValue: 'A', reason: null, timestamp: '2026-11-12T08:00:00Z' },
      { id: 'AA', action: 'comment_edited', previousValue: 'A', newValue: 'A', reason: null, timestamp: '2026-11-12T08:30:00Z' },
      { id: 'D', action: 'comment_deleted', previousValue: 'A', newValue: null, reason: null, timestamp: '2026-11-12T09:00:00Z' },
    ];
    const out = redactTaskAuditForRole(input, 'miembro');
    out.forEach(expectRedacted);
  });

  it('un ancla con previousValue null no redacta ediciones con newValue null', () => {
    const input: ChainEntry[] = [
      { id: 'N', action: 'comment_edited', previousValue: 'algo', newValue: null, reason: null, timestamp: '2026-11-12T07:00:00Z' },
      { id: 'D', action: 'comment_deleted', previousValue: null, newValue: null, reason: null, timestamp: '2026-11-12T09:00:00Z' },
    ];
    const out = byId(redactTaskAuditForRole(input, 'miembro'));
    expect(out.N).toEqual({ ...input[0], redacted: false });
    expect(out.D.redacted).toBe(true);
  });

  it('no muta la entrada de la cadena', () => {
    for (const input of [deletedChain(), moderatedChain()]) {
      const snapshot = structuredClone(input);
      redactTaskAuditForRole(input, 'miembro');
      expect(input).toEqual(snapshot);
    }
  });
});
