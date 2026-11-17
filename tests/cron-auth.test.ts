import { describe, expect, it } from 'vitest';
import { verifyCronAuthorization } from '../src/lib/cron-auth';

const SECRET = 'secreto-del-cron-0123456789';

describe('verifyCronAuthorization', () => {
  it('acepta el token correcto', () => {
    expect(verifyCronAuthorization(SECRET, `Bearer ${SECRET}`)).toBe(true);
  });

  it('rechaza si el secreto es undefined o vacío', () => {
    expect(verifyCronAuthorization(undefined, `Bearer ${SECRET}`)).toBe(false);
    expect(verifyCronAuthorization('', 'Bearer ')).toBe(false);
    expect(verifyCronAuthorization('', 'Bearer x')).toBe(false);
  });

  it('rechaza si falta la cabecera', () => {
    expect(verifyCronAuthorization(SECRET, null)).toBe(false);
    expect(verifyCronAuthorization(SECRET, '')).toBe(false);
  });

  it('rechaza otros esquemas o formas', () => {
    expect(verifyCronAuthorization(SECRET, `Basic ${SECRET}`)).toBe(false);
    expect(verifyCronAuthorization(SECRET, 'Bearer')).toBe(false);
    expect(verifyCronAuthorization(SECRET, 'Bearer ')).toBe(false);
    expect(verifyCronAuthorization(SECRET, `bearer ${SECRET}`)).toBe(false);
    expect(verifyCronAuthorization(SECRET, `Bearer  ${SECRET}`)).toBe(false);
    expect(verifyCronAuthorization(SECRET, ` Bearer ${SECRET}`)).toBe(false);
    expect(verifyCronAuthorization(SECRET, `Bearer ${SECRET} extra`)).toBe(false);
    expect(verifyCronAuthorization(SECRET, `${SECRET}`)).toBe(false);
  });

  it('rechaza un token incorrecto de igual o distinta longitud', () => {
    const sameLength = SECRET.slice(0, -1) + (SECRET.endsWith('9') ? '8' : '9');
    expect(verifyCronAuthorization(SECRET, `Bearer ${sameLength}`)).toBe(false);
    expect(verifyCronAuthorization(SECRET, 'Bearer corto')).toBe(false);
    expect(verifyCronAuthorization(SECRET, `Bearer ${SECRET}${SECRET}`)).toBe(false);
  });

  it('no lanza con entradas raras', () => {
    const weird: unknown[] = [undefined, null, 42, {}, [], 'Bearer \u0000', 'Bearer ' + 'x'.repeat(100_000)];
    for (const header of weird) {
      expect(() => verifyCronAuthorization(SECRET, header as string | null)).not.toThrow();
      expect(verifyCronAuthorization(SECRET, header as string | null)).toBe(false);
    }
    expect(() => verifyCronAuthorization(123 as unknown as string, 'Bearer 123')).not.toThrow();
  });
});
