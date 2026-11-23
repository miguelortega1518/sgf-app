import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  shareLinkPath,
} from '../src/lib/share-links';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('generateShareToken', () => {
  it('devuelve un token base64url de 43 caracteres y su SHA-256 en hex', () => {
    const { token, tokenHash } = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(sha256(token));
    expect(tokenHash).not.toBe(token);
  });

  it('dos llamadas dan tokens distintos', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe('hashShareToken', () => {
  it('es el SHA-256 hex del token', () => {
    expect(hashShareToken('abc')).toBe(sha256('abc'));
  });
});

describe('isWellFormedShareToken', () => {
  const valid = 'A'.repeat(20) + '_-' + 'z9'.repeat(10) + 'x';

  it('acepta 43 caracteres base64url', () => {
    expect(valid).toHaveLength(43);
    expect(isWellFormedShareToken(valid)).toBe(true);
    expect(isWellFormedShareToken(generateShareToken().token)).toBe(true);
  });

  it('rechaza vacío, longitudes distintas y caracteres fuera de base64url', () => {
    expect(isWellFormedShareToken('')).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(42))).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(44))).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(42) + '/')).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(42) + '+')).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(42) + '.')).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(42) + '=')).toBe(false);
  });
});

describe('shareLinkPath', () => {
  it('es /compartido/<token>', () => {
    expect(shareLinkPath('abc')).toBe('/compartido/abc');
  });
});
