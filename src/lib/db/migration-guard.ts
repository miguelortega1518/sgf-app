/**
 * Guarda de migraciones: bloquea cambios de esquema que pueden destruir datos o romper la versión
 * anterior de la app mientras un deploy está a medias. Un cambio de ese tipo solo pasa si el archivo
 * trae una línea `-- allow-destructive: <motivo>` con una razón escrita por una persona.
 */

export type Finding = { rule: string; statement: string };

export type MigrationVerdict = {
  ok: boolean;
  findings: Finding[];
  /** Motivo escrito en la marca de autorización, si existe. */
  reason: string | null;
};

const MARKER = /--[ \t]*allow-destructive:[ \t]*(\S[^\r\n]*)/i;

/** Quita comentarios `--` de línea y devuelve el SQL ejecutable. */
export function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

/** Separa en sentencias; drizzle-kit marca los cortes con `--> statement-breakpoint`. */
export function splitStatements(sql: string): string[] {
  const withoutMarkers = sql.replace(/--> statement-breakpoint/g, ';');
  return stripComments(withoutMarkers)
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const RULES: { rule: string; test: (s: string) => boolean }[] = [
  { rule: 'elimina una tabla, columna, tipo o esquema', test: (s) => /\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE)\b/i.test(s) },
  { rule: 'vacía una tabla (TRUNCATE)', test: (s) => /\bTRUNCATE\b/i.test(s) },
  { rule: 'borra filas (DELETE)', test: (s) => /\bDELETE\s+FROM\b/i.test(s) },
  { rule: 'cambia el tipo de una columna', test: (s) => /\bALTER\s+COLUMN\b.*\bTYPE\b/i.test(s) },
  { rule: 'vuelve obligatoria una columna que ya existe', test: (s) => /\bALTER\s+COLUMN\b.*\bSET\s+NOT\s+NULL\b/i.test(s) },
  { rule: 'renombra algo (rompe la versión anterior durante el deploy)', test: (s) => /\bRENAME\b/i.test(s) },
  {
    rule: 'agrega una columna obligatoria sin valor por defecto',
    test: (s) => /\bADD\s+COLUMN\b/i.test(s) && /\bNOT\s+NULL\b/i.test(s) && !/\bDEFAULT\b/i.test(s) && !/\bGENERATED\b/i.test(s),
  },
];

export function findRisky(sql: string): Finding[] {
  const findings: Finding[] = [];
  for (const statement of splitStatements(sql)) {
    for (const { rule, test } of RULES) {
      if (test(statement)) findings.push({ rule, statement: statement.slice(0, 160) });
    }
  }
  return findings;
}

export function evaluateMigration(sql: string): MigrationVerdict {
  const findings = findRisky(sql);
  const m = MARKER.exec(sql);
  const reason = m ? m[1].trim() : null;
  return { ok: findings.length === 0 || reason !== null, findings, reason };
}

export type JournalEntry = { idx: number; tag: string; when: number };

/** Valida el diario de drizzle-kit: índices seguidos, fechas crecientes, sin archivos huérfanos. */
export function validateJournal(entries: JournalEntry[], sqlFiles: string[], snapshotFiles: string[]): string[] {
  const problems: string[] = [];
  entries.forEach((e, i) => {
    if (e.idx !== i) problems.push(`El diario salta del índice ${i - 1} al ${e.idx}`);
    if (i > 0 && e.when <= entries[i - 1].when) {
      problems.push(`La migración ${e.tag} tiene fecha menor o igual que la anterior; drizzle la ignoraría. Regenérela.`);
    }
    if (!sqlFiles.includes(`${e.tag}.sql`)) problems.push(`Falta el archivo ${e.tag}.sql`);
    const snap = `${String(e.idx).padStart(4, '0')}_snapshot.json`;
    if (!snapshotFiles.includes(snap)) problems.push(`Falta meta/${snap}`);
  });
  const tags = new Set(entries.map((e) => `${e.tag}.sql`));
  for (const f of sqlFiles) if (!tags.has(f)) problems.push(`${f} no está en el diario (_journal.json)`);
  return problems;
}
