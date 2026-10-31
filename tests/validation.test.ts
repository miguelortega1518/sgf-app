import { describe, it, expect } from 'vitest';
import {
  isValidIsoDate,
  isHttpUrl,
  assertNonEmpty,
} from '../src/lib/validation';

describe('isValidIsoDate', () => {
  it('acepta fechas ISO válidas', () => {
    expect(isValidIsoDate('2024-01-15')).toBe(true);
    expect(isValidIsoDate('2000-02-29')).toBe(true); // bisiesto
    expect(isValidIsoDate('2026-12-31')).toBe(true);
  });

  it('rechaza fechas con día/mes inválido', () => {
    expect(isValidIsoDate('2024-13-01')).toBe(false); // mes 13
    expect(isValidIsoDate('2024-01-32')).toBe(false); // día 32
    expect(isValidIsoDate('2023-02-29')).toBe(false); // 2023 no es bisiesto
  });

  it('rechaza texto con formato incorrecto', () => {
    expect(isValidIsoDate('01-15-2024')).toBe(false);
    expect(isValidIsoDate('2024/01/15')).toBe(false);
    expect(isValidIsoDate('hoy')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it('acepta URLs HTTP y HTTPS', () => {
    expect(isHttpUrl('https://example.com/evidence')).toBe(true);
    expect(isHttpUrl('http://intranet/file')).toBe(true);
    expect(isHttpUrl('https://github.com/org/repo/pull/123')).toBe(true);
  });

  it('rechaza URLs no HTTP', () => {
    expect(isHttpUrl('ftp://server/file')).toBe(false);
    expect(isHttpUrl('file:///local/path')).toBe(false);
    expect(isHttpUrl('nombre-de-archivo.pdf')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('assertNonEmpty', () => {
  it('acepta textos con contenido', () => {
    expect(() => assertNonEmpty('Título válido')).not.toThrow();
    expect(() => assertNonEmpty('a')).not.toThrow();
  });

  it('rechaza textos vacíos o solo espacios', () => {
    expect(() => assertNonEmpty('')).toThrow();
    expect(() => assertNonEmpty('   ')).toThrow();
    expect(() => assertNonEmpty('\t\n')).toThrow();
  });
});
