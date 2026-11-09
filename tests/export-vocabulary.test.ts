import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

const ROOT = resolve(__dirname, '..');

// Ruta relativa a la raíz del repo, siempre con '/'.
function toRepoPath(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

// Recorre un directorio de forma recursiva y devuelve las rutas de los .ts/.tsx.
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Guarda de regresión estática: los exportes y reportes usan el vocabulario de
// src/lib/labels.ts (vía src/lib/export-rows.ts), no mapas locales ni términos antiguos.
const files = [
  ...listSourceFiles(resolve(ROOT, 'src/app/api/export')),
  ...listSourceFiles(resolve(ROOT, 'src/app/api/reports')),
];

function offenders(test: (src: string) => boolean): string[] {
  return files.filter((file) => test(readFileSync(file, 'utf8'))).map(toRepoPath);
}

describe('vocabulario de exportes y reportes', () => {
  it('encuentra archivos que revisar', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no definen STATUS_LABELS ni PRIORITY_LABELS locales', () => {
    expect(offenders((src) => /STATUS_LABELS|PRIORITY_LABELS/.test(src))).toEqual([]);
  });

  it('no usan "Espacio" ni "Empresa"', () => {
    expect(offenders((src) => src.includes('Espacio'))).toEqual([]);
    expect(offenders((src) => src.includes('Empresa'))).toEqual([]);
  });

  it('no mencionan SGF', () => {
    expect(offenders((src) => /sgf/i.test(src))).toEqual([]);
  });

  it('el PDF de /api/export no usa data.indexOf y usa APP_NAME', () => {
    const src = readFileSync(resolve(ROOT, 'src/app/api/export/route.ts'), 'utf8');
    expect(src).not.toContain('data.indexOf');
    expect(src).toContain('APP_NAME');
  });
});
