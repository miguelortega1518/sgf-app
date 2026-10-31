import { describe, it, expect } from 'vitest';
import {
  assertValidUuid,
  computeProjectAccess,
} from '../src/lib/project-access';

describe('assertValidUuid', () => {
  it('acepta UUIDs válidos', () => {
    expect(() => assertValidUuid('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    expect(() => assertValidUuid('00000000-0000-0000-0000-000000000000')).not.toThrow();
  });

  it('lanza 400 con texto vacío', () => {
    expect(() => assertValidUuid('')).toThrow();
    try {
      assertValidUuid('');
    } catch (e) {
      expect((e as Error & { httpStatus: number }).httpStatus).toBe(400);
    }
  });

  it('lanza 400 con ID malformado (previene PG 500)', () => {
    const bad = ["'; DROP TABLE tasks; --", 'abc', '123', 'not-a-uuid'];
    for (const id of bad) {
      expect(() => assertValidUuid(id)).toThrow();
      try {
        assertValidUuid(id);
      } catch (e) {
        expect((e as Error & { httpStatus: number }).httpStatus).toBe(400);
      }
    }
  });
});

describe('computeProjectAccess', () => {
  const adminSession = { id: 'u1', role: 'admin' as const };
  const memberSession = { id: 'u2', role: 'miembro' as const };
  const observerSession = { id: 'u3', role: 'observador' as const };
  const ownerId = 'owner-123';

  it('admin siempre tiene acceso', () => {
    expect(computeProjectAccess(adminSession, ownerId, undefined, 'read')).toBeNull();
    expect(computeProjectAccess(adminSession, ownerId, undefined, 'write')).toBeNull();
    expect(computeProjectAccess(adminSession, null, undefined, 'write')).toBeNull();
  });

  it('retorna 404 si el espacio no existe (ownerId null)', () => {
    const result = computeProjectAccess(memberSession, null, undefined, 'read');
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(404);
  });

  it('miembro con membresía puede leer', () => {
    const membership = { spaceRole: 'colaborador' as const };
    expect(computeProjectAccess(memberSession, ownerId, membership, 'read')).toBeNull();
  });

  it('dueño del espacio puede leer y escribir sin entrada en space_members', () => {
    const ownerSession = { id: ownerId, role: 'miembro' as const };
    expect(computeProjectAccess(ownerSession, ownerId, undefined, 'read')).toBeNull();
    expect(computeProjectAccess(ownerSession, ownerId, undefined, 'write')).toBeNull();
  });

  it('sin membresía y sin ser dueño → 403', () => {
    const result = computeProjectAccess(memberSession, ownerId, undefined, 'read');
    expect(result).not.toBeNull();
    expect(result!.httpStatus).toBe(403);
  });

  it('observador global puede leer pero no escribir', () => {
    const membership = { spaceRole: 'colaborador' as const };
    expect(computeProjectAccess(observerSession, ownerId, membership, 'read')).toBeNull();
    const writeResult = computeProjectAccess(observerSession, ownerId, membership, 'write');
    expect(writeResult).not.toBeNull();
    expect(writeResult!.httpStatus).toBe(403);
  });

  it('miembro con rol espacio=observador no puede escribir', () => {
    const membership = { spaceRole: 'observador' as const };
    expect(computeProjectAccess(memberSession, ownerId, membership, 'read')).toBeNull();
    const writeResult = computeProjectAccess(memberSession, ownerId, membership, 'write');
    expect(writeResult).not.toBeNull();
    expect(writeResult!.httpStatus).toBe(403);
  });

  it('dueño con rol de espacio observador queda en solo lectura', () => {
    const ownerSession = { id: ownerId, role: 'miembro' as const };
    const membership = { spaceRole: 'observador' as const };
    expect(computeProjectAccess(ownerSession, ownerId, membership, 'read')).toBeNull();
    expect(computeProjectAccess(ownerSession, ownerId, membership, 'write')?.httpStatus).toBe(403);
  });
});
