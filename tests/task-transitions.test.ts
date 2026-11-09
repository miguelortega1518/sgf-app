import { describe, it, expect, vi, afterEach } from 'vitest';

// applyStatusTransition importa db y audit: se mockean para no tocar una BD real.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));

import { validateStatusTransition, applyStatusTransition } from '../src/lib/task-transitions';

const makeTask = (overrides: Partial<Parameters<typeof validateStatusTransition>[0]['task']> = {}) => ({
  status: 'no_iniciada' as const,
  requiresApproval: false,
  requiresEvidence: false,
  reviewerId: null,
  responsibleId: 'user-1',
  ...overrides,
});

const adminSession = { id: 'admin-1', role: 'admin' as const };
const memberSession = { id: 'user-1', role: 'miembro' as const };
const observerSession = { id: 'obs-1', role: 'observador' as const };

describe('validateStatusTransition', () => {
  it('observador nunca puede cambiar estado', () => {
    const result = validateStatusTransition({
      session: observerSession,
      task: makeTask(),
      spaceStatus: 'activo',
      newStatus: 'en_proceso',
      input: { status: 'en_proceso' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(403);
  });

  it('proyecto cerrado bloquea mutaciones', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask(),
      spaceStatus: 'cerrado',
      newStatus: 'en_proceso',
      input: { status: 'en_proceso' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(409);
  });

  it('estado repetido es no-op (null = permitir sin error)', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask({ status: 'en_proceso' }),
      spaceStatus: 'activo',
      newStatus: 'en_proceso',
      input: { status: 'en_proceso' },
      evidenceCount: 0,
    });
    expect(result).toBeNull();
  });

  it('bloqueada requiere blockedByArea', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask(),
      spaceStatus: 'activo',
      newStatus: 'bloqueada',
      input: { status: 'bloqueada' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(400);
  });

  it('bloqueada con área "otro" requiere texto', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask(),
      spaceStatus: 'activo',
      newStatus: 'bloqueada',
      input: { status: 'bloqueada', blockedByArea: 'otro' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(400);
  });

  it('bloqueada válida pasa', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask(),
      spaceStatus: 'activo',
      newStatus: 'bloqueada',
      input: { status: 'bloqueada', blockedByArea: 'qa' },
      evidenceCount: 0,
    });
    expect(result).toBeNull();
  });

  it('completar tarea con requiresEvidence sin evidencia falla', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask({ requiresEvidence: true }),
      spaceStatus: 'activo',
      newStatus: 'completada',
      input: { status: 'completada' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(400);
  });

  it('completar tarea con requiresEvidence y evidencia pasa', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask({ requiresEvidence: true }),
      spaceStatus: 'activo',
      newStatus: 'completada',
      input: { status: 'completada' },
      evidenceCount: 1,
    });
    expect(result).toBeNull();
  });

  it('aprobar tarea (requiresApproval) requiere estar en_revision', () => {
    const result = validateStatusTransition({
      session: adminSession,
      task: makeTask({ requiresApproval: true, status: 'en_proceso' }),
      spaceStatus: 'activo',
      newStatus: 'completada',
      input: { status: 'completada' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(400);
  });

  it('solo revisor o admin puede aprobar tarea con requiresApproval', () => {
    const nonReviewer = { id: 'other-user', role: 'miembro' as const };
    const result = validateStatusTransition({
      session: nonReviewer,
      task: makeTask({ requiresApproval: true, status: 'en_revision', reviewerId: 'reviewer-1' }),
      spaceStatus: 'activo',
      newStatus: 'completada',
      input: { status: 'completada' },
      evidenceCount: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(403);
  });

  it('revisor asignado puede aprobar tarea', () => {
    const reviewer = { id: 'reviewer-1', role: 'miembro' as const };
    const result = validateStatusTransition({
      session: reviewer,
      task: makeTask({ requiresApproval: true, status: 'en_revision', reviewerId: 'reviewer-1' }),
      spaceStatus: 'activo',
      newStatus: 'completada',
      input: { status: 'completada' },
      evidenceCount: 0,
    });
    expect(result).toBeNull();
  });

  it('admin puede aprobar aunque no sea revisor', () => {
    const result = validateStatusTransition({
      session: adminSession,
      task: makeTask({ requiresApproval: true, status: 'en_revision', reviewerId: 'reviewer-1' }),
      spaceStatus: 'activo',
      newStatus: 'completada',
      input: { status: 'completada' },
      evidenceCount: 0,
    });
    expect(result).toBeNull();
  });

  it('transición válida sin requisitos especiales pasa', () => {
    const result = validateStatusTransition({
      session: memberSession,
      task: makeTask({ status: 'no_iniciada' }),
      spaceStatus: 'activo',
      newStatus: 'en_proceso',
      input: { status: 'en_proceso' },
      evidenceCount: 0,
    });
    expect(result).toBeNull();
  });
});

describe('applyStatusTransition — blockedSince en hora RD', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a las 21:30 RD guarda blockedSince con la fecha RD, no la UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T01:30:00Z'));

    const task = {
      id: 'task-1',
      title: 'Tarea',
      status: 'en_proceso',
      requiresApproval: false,
      requiresEvidence: false,
      reviewerId: null,
      responsibleId: 'user-1',
    };

    const set = vi.fn(() => ({
      where: () => ({ returning: () => Promise.resolve([task]) }),
    }));
    const tx = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      update: () => ({ set }),
      insert: vi.fn(),
    };

    await applyStatusTransition(
      tx as never,
      memberSession,
      task as never,
      { status: 'activo' },
      { status: 'bloqueada', blockedByArea: 'cliente' },
    );

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ blockedSince: '2026-03-09' }));
  });
});
