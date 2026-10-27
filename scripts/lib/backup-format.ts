/** Piezas comunes del respaldo y la restauración. Sin acceso a base de datos, para poder probarlas solas. */
import type postgres from 'postgres';

/** Tablas que no se respaldan: contadores de intentos de login, que no deben revivir al restaurar. */
export const EXCLUDED_TABLES = ['rate_limits'];

/**
 * Fechas y horas como texto, tal cual las da Postgres. Así no se pierden microsegundos ni cambia el día
 * por la zona horaria de quien ejecuta el script.
 */
const raw = (oid: number): postgres.PostgresType => ({
  to: oid,
  from: [oid],
  serialize: (x: unknown) => String(x),
  parse: (x: string) => x,
});
export const RAW_TEMPORAL_TYPES: Record<string, postgres.PostgresType> = {
  date: raw(1082),
  timestamp: raw(1114),
  timestamptz: raw(1184),
};

export type BackupFile = {
  format: 'forja-backup';
  version: 1;
  createdAt: string;
  database: string;
  host: string;
  migrations: { count: number; lastCreatedAt: string | null };
  excluded: string[];
  counts: Record<string, number>;
  data: Record<string, Record<string, unknown>[]>;
};

export function validateBackupFile(obj: unknown): BackupFile {
  const f = obj as Partial<BackupFile> | null;
  if (!f || f.format !== 'forja-backup' || f.version !== 1) throw new Error('El archivo no es un respaldo de Forja (formato o versión desconocidos).');
  if (!f.data || !f.counts) throw new Error('El respaldo está incompleto (faltan datos o conteos).');
  for (const [table, rows] of Object.entries(f.data)) {
    if (!Array.isArray(rows)) throw new Error(`La tabla ${table} del respaldo no es una lista de filas.`);
    if (rows.length !== f.counts[table]) {
      throw new Error(`La tabla ${table} dice tener ${f.counts[table]} filas pero trae ${rows.length}: el archivo está dañado.`);
    }
  }
  return f as BackupFile;
}

export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Ordena tablas para insertar: primero las referenciadas, después las que las referencian. */
export function orderTables(tables: string[], fks: { child: string; parent: string }[]): string[] {
  const present = new Set(tables);
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  for (const { child, parent } of fks) {
    if (child !== parent && present.has(child) && present.has(parent)) deps.get(child)!.add(parent);
  }
  const out: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((t) => [...deps.get(t)!].every((p) => !remaining.has(p))).sort();
    if (ready.length === 0) throw new Error(`Dependencia circular entre tablas: ${[...remaining].join(', ')}`);
    for (const t of ready) {
      out.push(t);
      remaining.delete(t);
    }
  }
  return out;
}

/** En una tabla que se referencia a sí misma, deja primero las filas cuyo padre ya existe. */
export function orderSelfReferencing<T extends Record<string, unknown>>(rows: T[], idCol: string, parentCol: string): T[] {
  const placed = new Set<unknown>();
  const out: T[] = [];
  let pending = rows;
  while (pending.length > 0) {
    const next: T[] = [];
    let progressed = false;
    for (const row of pending) {
      const parent = row[parentCol];
      if (parent === null || parent === undefined || placed.has(parent)) {
        out.push(row);
        placed.add(row[idCol]);
        progressed = true;
      } else {
        next.push(row);
      }
    }
    if (!progressed) throw new Error(`Referencia circular o rota entre filas (columna ${parentCol}).`);
    pending = next;
  }
  return out;
}
