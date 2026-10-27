import { is } from 'drizzle-orm';
import { PgTable, getTableConfig, isPgEnum } from 'drizzle-orm/pg-core';

/**
 * Compara el esquema que el código espera con el que la base de datos realmente tiene.
 * Solo mira nombres (tablas, columnas, valores de enum): es lo bastante barato para el chequeo
 * de salud y atrapa el fallo que ya ocurrió (columnas nuevas que no llegaron a producción).
 */

export type ExpectedSchema = {
  /** tabla -> columnas */
  tables: Record<string, string[]>;
  /** enum -> valores */
  enums: Record<string, string[]>;
};

export type ActualSchema = {
  columns: { table_name: string; column_name: string }[];
  enumValues: { name: string; value: string }[];
};

export type SchemaDiff = {
  missingTables: string[];
  missingColumns: string[];
  missingEnums: string[];
  missingEnumValues: string[];
};

export type Query = (text: string) => Promise<ReadonlyArray<Record<string, unknown>>>;

/** Esquema esperado según las definiciones de Drizzle del código. */
export function expectedFromModule(mod: Record<string, unknown>): ExpectedSchema {
  const tables: Record<string, string[]> = {};
  const enums: Record<string, string[]> = {};
  for (const value of Object.values(mod)) {
    if (isPgEnum(value)) {
      enums[value.enumName] = [...value.enumValues];
    } else if (is(value, PgTable)) {
      const cfg = getTableConfig(value);
      tables[cfg.name] = cfg.columns.map((c) => c.name);
    }
  }
  return { tables, enums };
}

type Snapshot = {
  tables?: Record<string, { name: string; columns: Record<string, { name: string }> }>;
  enums?: Record<string, { name: string; values: string[] }>;
};

/** Esquema esperado según un snapshot de drizzle-kit (meta/NNNN_snapshot.json). */
export function expectedFromSnapshot(snapshot: Snapshot): ExpectedSchema {
  const tables: Record<string, string[]> = {};
  const enums: Record<string, string[]> = {};
  for (const t of Object.values(snapshot.tables ?? {})) {
    tables[t.name] = Object.values(t.columns).map((c) => c.name);
  }
  for (const e of Object.values(snapshot.enums ?? {})) {
    enums[e.name] = [...e.values];
  }
  return { tables, enums };
}

export function diffSchema(expected: ExpectedSchema, actual: ActualSchema): SchemaDiff {
  const cols = new Map<string, Set<string>>();
  for (const r of actual.columns) {
    if (!cols.has(r.table_name)) cols.set(r.table_name, new Set());
    cols.get(r.table_name)!.add(r.column_name);
  }
  const enumVals = new Map<string, Set<string>>();
  for (const r of actual.enumValues) {
    if (!enumVals.has(r.name)) enumVals.set(r.name, new Set());
    enumVals.get(r.name)!.add(r.value);
  }

  const diff: SchemaDiff = { missingTables: [], missingColumns: [], missingEnums: [], missingEnumValues: [] };
  for (const [table, columns] of Object.entries(expected.tables)) {
    const have = cols.get(table);
    if (!have) {
      diff.missingTables.push(table);
      continue;
    }
    for (const c of columns) if (!have.has(c)) diff.missingColumns.push(`${table}.${c}`);
  }
  for (const [name, values] of Object.entries(expected.enums)) {
    const have = enumVals.get(name);
    if (!have) {
      diff.missingEnums.push(name);
      continue;
    }
    for (const v of values) if (!have.has(v)) diff.missingEnumValues.push(`${name}.${v}`);
  }
  return diff;
}

export function isClean(diff: SchemaDiff): boolean {
  return (
    diff.missingTables.length === 0 &&
    diff.missingColumns.length === 0 &&
    diff.missingEnums.length === 0 &&
    diff.missingEnumValues.length === 0
  );
}

export function describeDiff(diff: SchemaDiff): string[] {
  const lines: string[] = [];
  if (diff.missingTables.length) lines.push(`Tablas que faltan: ${diff.missingTables.join(', ')}`);
  if (diff.missingColumns.length) lines.push(`Columnas que faltan: ${diff.missingColumns.join(', ')}`);
  if (diff.missingEnums.length) lines.push(`Tipos enumerados que faltan: ${diff.missingEnums.join(', ')}`);
  if (diff.missingEnumValues.length) lines.push(`Valores de enum que faltan: ${diff.missingEnumValues.join(', ')}`);
  return lines;
}

const COLUMNS_SQL = `select table_name, column_name from information_schema.columns where table_schema = 'public'`;
const ENUMS_SQL = `select t.typname as name, e.enumlabel as value
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'`;

export async function loadActual(query: Query): Promise<ActualSchema> {
  const [columns, enumValues] = await Promise.all([query(COLUMNS_SQL), query(ENUMS_SQL)]);
  return {
    columns: columns as unknown as ActualSchema['columns'],
    enumValues: enumValues as unknown as ActualSchema['enumValues'],
  };
}

export async function checkSchema(query: Query, expected: ExpectedSchema): Promise<SchemaDiff> {
  return diffSchema(expected, await loadActual(query));
}
