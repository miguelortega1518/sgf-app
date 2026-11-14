import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';

// Regresión de seguridad: xlsx < 0.19.3 tiene contaminación de prototipo
// (CVE-2023-30533) y xlsx < 0.20.2 un ReDoS (CVE-2024-22363). Las versiones
// corregidas sólo se publican en el CDN oficial de SheetJS, no en npm.
const MIN_VERSION: [number, number, number] = [0, 20, 2];

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`Versión de xlsx no reconocida: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

describe('dependencia xlsx', () => {
  it('compara versiones numéricamente, no como texto', () => {
    expect(compareVersions(parseVersion('0.20.10'), MIN_VERSION)).toBeGreaterThan(0);
    expect(compareVersions(parseVersion('0.18.5'), MIN_VERSION)).toBeLessThan(0);
    expect(compareVersions(parseVersion('0.20.2'), MIN_VERSION)).toBe(0);
  });

  it('la versión de xlsx en tiempo de ejecución es ≥ 0.20.2', () => {
    expect(typeof XLSX.version).toBe('string');
    expect(compareVersions(parseVersion(XLSX.version), MIN_VERSION)).toBeGreaterThanOrEqual(0);
  });

  it('package.json toma xlsx del CDN de SheetJS', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const spec = pkg.dependencies.xlsx;
    expect(spec.startsWith('https://cdn.sheetjs.com/')).toBe(true);
    const fromUrl = /\/xlsx-(\d+\.\d+\.\d+)\/xlsx-\1\.tgz$/.exec(spec);
    expect(fromUrl).not.toBeNull();
    expect(compareVersions(parseVersion(fromUrl?.[1] ?? ''), MIN_VERSION)).toBeGreaterThanOrEqual(0);
  });
});
