import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, newPasswordSchema, passwordProblem } from '@/lib/password-policy';

describe('passwordProblem', () => {
  it('acepta una frase razonable', () => {
    expect(passwordProblem('caballo correcto grapa')).toBeNull();
    expect(passwordProblem('Cierre-Mensual-87')).toBeNull();
  });

  it(`exige al menos ${MIN_PASSWORD_LENGTH} caracteres`, () => {
    expect(passwordProblem('12345678')).toMatch(/al menos/);
    expect(passwordProblem('Abc!12345')).toMatch(/al menos/);
  });

  it('rechaza secuencias, repeticiones y contraseñas comunes', () => {
    expect(passwordProblem('1234567890')).toMatch(/fácil/);
    expect(passwordProblem('9876543210')).toMatch(/fácil/);
    expect(passwordProblem('abcdefghijk')).toMatch(/fácil/);
    expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/fácil/);
    expect(passwordProblem('ababababab')).toMatch(/fácil/);
    expect(passwordProblem('Contraseña1')).toMatch(/fácil/);
    expect(passwordProblem('SGF2026!!')).not.toBeNull();
  });

  it('rechaza contraseñas que contienen el correo de la persona', () => {
    expect(passwordProblem('mortega-2026-xyz', { email: 'mortega@grupoblb.do' })).toMatch(/correo/);
    expect(passwordProblem('mortega-2026-xyz')).toBeNull();
  });

  it('rechaza lo que bcrypt truncaría sin avisar (más de 72 bytes)', () => {
    expect(passwordProblem('ñ'.repeat(37) + 'abc')).toMatch(/larga/);
    expect(passwordProblem('x1y2z3'.repeat(12))).toBeNull();
  });
});

describe('newPasswordSchema', () => {
  it('convierte el motivo en un error de validación legible', () => {
    const result = newPasswordSchema.safeParse('corta');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/al menos/);
  });
});
