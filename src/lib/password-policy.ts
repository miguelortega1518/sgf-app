import { z } from 'zod';

/**
 * Reglas mínimas para una contraseña nueva. Se usan igual en el servidor y en las pantallas, para que el aviso
 * aparezca antes de enviar. No se aplican a contraseñas que ya existen: solo al crear, cambiar o restablecer.
 */

export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt solo usa los primeros 72 bytes; lo que pase de ahí se ignoraría sin avisar. */
const MAX_PASSWORD_BYTES = 72;

export const PASSWORD_HINT = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Evita secuencias, repeticiones y tu correo.`;

// Contraseñas que aparecen primero en cualquier lista de ataque, más las que este proyecto usó alguna vez.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'contraseña', 'contrasena', 'contraseña1',
  'contrasena1', 'qwertyuiop', 'qwerty1234', 'qwerty12345', 'asdfghjkl', 'asdfghjkl1', '1q2w3e4r5t', 'zaq12wsxcde',
  'iloveyou12', 'admin12345', 'administrador', 'bienvenido', 'bienvenido1', 'bienvenido123', 'abc1234567',
  '1234567890', '0987654321', '12345678910', '1122334455', '1qaz2wsx3edc',
  'sgf2026!', 'sgf2026!!', 'forja2026', 'forja2026!', 'republicadominicana', 'santodomingo',
]);

function isSequence(p: string): boolean {
  const codes = [...p].map(c => c.codePointAt(0)!);
  const step = codes[1] - codes[0];
  if (Math.abs(step) !== 1) return false;
  return codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
}

/** Motivo por el que la contraseña no sirve, o `null` si cumple. */
export function passwordProblem(password: string, context: { email?: string } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'Es demasiado larga: usa como máximo 64 caracteres.';

  const lower = password.toLowerCase();
  if (new Set(lower).size <= 2 || isSequence(lower) || COMMON.has(lower)) {
    return 'Es demasiado fácil de adivinar. Usa una frase o una combinación menos predecible.';
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) return 'No debe contener tu correo.';

  return null;
}

/** Esquema de zod para una contraseña nueva (alta, cambio o restablecimiento). */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});
