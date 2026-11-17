/**
 * Analizador CSV (RFC 4180) sin dependencias. Un solo recorrido carácter a carácter (O(n)):
 * no parte por líneas porque un campo entre comillas puede contener saltos de línea.
 */

export type CsvDelimiter = ',' | ';';
export type CsvRow = { line: number; cells: string[] };
export type CsvParseResult = { delimiter: CsvDelimiter; header: string[]; rows: CsvRow[] };

/** Error de formato con la línea física (base 1) donde empieza el problema. */
export class CsvParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = 'CsvParseError';
    this.line = line;
  }
}

const BOM = '﻿';

/**
 * Cuenta `,` y `;` fuera de comillas en la primera línea con contenido.
 * En empate (también sin ninguno) gana la coma.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  let hasContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; hasContent = true; }
    else if (ch === ',') { commas++; hasContent = true; }
    else if (ch === ';') { semicolons++; hasContent = true; }
    else if (ch === '\n' || ch === '\r') { if (hasContent) break; }
    else if (ch.trim() !== '') hasContent = true;
  }
  return semicolons > commas ? ';' : ',';
}

function isBlank(cells: string[]): boolean {
  return cells.every(cell => cell.trim() === '');
}

/**
 * Lee un CSV completo. Quita el BOM, acepta CRLF, LF y CR sueltos, detecta el separador en la
 * cabecera e ignora las filas en blanco. `line` es la línea física en la que empieza cada fila.
 */
export function parseCsv(input: string): CsvParseResult {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records: CsvRow[] = [];

  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;
  let inQuotes = false;
  let field = '';
  // true mientras `field` sólo contiene espacios: equivale a `field.trim() === ''` en O(1),
  // para no recorrer el campo entero en cada comilla (sería O(n²) con un campo lleno de `"`).
  let fieldBlank = true;
  let cells: string[] = [];
  let recordHasData = false;

  const endRecord = () => {
    cells.push(field);
    if (!isBlank(cells)) records.push({ line: recordLine, cells });
    cells = [];
    field = '';
    fieldBlank = true;
    recordHasData = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; fieldBlank = false; i++; }
        else inQuotes = false;
      } else if (ch === '\r' || ch === '\n') {
        // Dentro de un campo, cualquier fin de línea se guarda como '\n'.
        if (ch === '\r' && text[i + 1] === '\n') i++;
        field += '\n';
        line++;
      } else {
        field += ch;
        if (fieldBlank && ch.trim() !== '') fieldBlank = false;
      }
      continue;
    }

    if (ch === '"' && fieldBlank) {
      // Comilla de apertura (se toleran espacios antes de ella).
      field = '';
      fieldBlank = true;
      inQuotes = true;
      quoteLine = line;
      recordHasData = true;
    } else if (ch === delimiter) {
      cells.push(field);
      field = '';
      fieldBlank = true;
      recordHasData = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += ch;
      if (fieldBlank && ch.trim() !== '') fieldBlank = false;
      recordHasData = true;
    }
  }

  if (inQuotes) {
    throw new CsvParseError(`Comilla sin cerrar en la línea ${quoteLine}`, quoteLine);
  }
  if (recordHasData || field !== '') endRecord();

  const [first, ...rest] = records;
  if (!first) return { delimiter, header: [], rows: [] };
  return { delimiter, header: first.cells, rows: rest };
}
