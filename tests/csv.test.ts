import { describe, expect, it } from 'vitest';
import { CsvParseError, parseCsv } from '../src/lib/csv';

describe('parseCsv: separador', () => {
  it('lee un CSV simple separado por comas', () => {
    const r = parseCsv('titulo,responsable\nUno,ana@x.com\nDos,beto@x.com\n');
    expect(r.delimiter).toBe(',');
    expect(r.header).toEqual(['titulo', 'responsable']);
    expect(r.rows).toEqual([
      { line: 2, cells: ['Uno', 'ana@x.com'] },
      { line: 3, cells: ['Dos', 'beto@x.com'] },
    ]);
  });

  it('detecta el punto y coma de las exportaciones de Excel en español', () => {
    const r = parseCsv('titulo;descripcion;etiquetas\nUno;Texto, con coma;a,b\n');
    expect(r.delimiter).toBe(';');
    expect(r.header).toEqual(['titulo', 'descripcion', 'etiquetas']);
    expect(r.rows[0].cells).toEqual(['Uno', 'Texto, con coma', 'a,b']);
  });

  it('en empate (sin separadores) gana la coma', () => {
    const r = parseCsv('titulo\nUno\n');
    expect(r.delimiter).toBe(',');
    expect(r.header).toEqual(['titulo']);
    expect(r.rows).toEqual([{ line: 2, cells: ['Uno'] }]);
  });

  it('en empate con el mismo número de , y ; gana la coma', () => {
    expect(parseCsv('a;b,c\n1;2,3\n').delimiter).toBe(',');
  });

  it('no cuenta los separadores que van entre comillas en la cabecera', () => {
    const r = parseCsv('"a,b,c";d;e\n1;2;3\n');
    expect(r.delimiter).toBe(';');
    expect(r.header).toEqual(['a,b,c', 'd', 'e']);
  });
});

describe('parseCsv: codificación y fin de línea', () => {
  it('quita el BOM UTF-8 inicial', () => {
    const r = parseCsv('﻿titulo,tipo\nUno,bug\n');
    expect(r.header[0]).toBe('titulo');
    expect(r.header[0].charCodeAt(0)).not.toBe(0xfeff);
  });

  it('acepta CRLF', () => {
    const r = parseCsv('titulo,tipo\r\nUno,bug\r\nDos,chore\r\n');
    expect(r.rows).toEqual([
      { line: 2, cells: ['Uno', 'bug'] },
      { line: 3, cells: ['Dos', 'chore'] },
    ]);
  });

  it('acepta una mezcla de CRLF, LF y CR sueltos', () => {
    const r = parseCsv('titulo,tipo\r\nUno,bug\nDos,chore\rTres,feature');
    expect(r.rows).toEqual([
      { line: 2, cells: ['Uno', 'bug'] },
      { line: 3, cells: ['Dos', 'chore'] },
      { line: 4, cells: ['Tres', 'feature'] },
    ]);
  });

  it('lee la última fila aunque no termine en salto de línea', () => {
    const r = parseCsv('titulo,tipo\nUno,bug');
    expect(r.rows).toEqual([{ line: 2, cells: ['Uno', 'bug'] }]);
  });
});

describe('parseCsv: comillas (RFC 4180)', () => {
  it('admite el separador dentro de un campo entre comillas', () => {
    const r = parseCsv('titulo,descripcion\n"Uno, dos","a,b"\n');
    expect(r.rows[0].cells).toEqual(['Uno, dos', 'a,b']);
  });

  it('desescapa las comillas dobles', () => {
    const r = parseCsv('titulo,descripcion\n"Dijo ""hola""",""""\n');
    expect(r.rows[0].cells).toEqual(['Dijo "hola"', '"']);
  });

  it('admite saltos de línea dentro de un campo y cuenta las líneas físicas', () => {
    const r = parseCsv('titulo,descripcion\nUno,"línea 1\nlínea 2\r\nlínea 3"\nDos,x\n');
    expect(r.rows).toEqual([
      { line: 2, cells: ['Uno', 'línea 1\nlínea 2\nlínea 3'] },
      { line: 5, cells: ['Dos', 'x'] },
    ]);
  });

  it('admite un campo entre comillas vacío', () => {
    const r = parseCsv('titulo,descripcion\nUno,""\n');
    expect(r.rows[0].cells).toEqual(['Uno', '']);
  });

  it('lanza CsvParseError con la línea si una comilla no se cierra', () => {
    let caught: unknown;
    try {
      parseCsv('titulo,descripcion\nUno,x\nDos,"sin cerrar\nmás texto\n');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CsvParseError);
    expect((caught as CsvParseError).line).toBe(3);
    expect((caught as CsvParseError).message).toContain('3');
  });
});

describe('parseCsv: filas vacías', () => {
  it('ignora las filas vacías y las de sólo separadores, conservando la línea física', () => {
    const r = parseCsv('titulo,tipo\n\nUno,bug\n,\n  ,  \n"",""\nDos,chore\n\n');
    expect(r.rows).toEqual([
      { line: 3, cells: ['Uno', 'bug'] },
      { line: 7, cells: ['Dos', 'chore'] },
    ]);
  });

  it('con separador ; también ignora las filas de sólo ;', () => {
    const r = parseCsv('titulo;tipo\n;;\nUno;bug\n');
    expect(r.rows).toEqual([{ line: 3, cells: ['Uno', 'bug'] }]);
  });

  it('la cabecera es el primer registro no vacío', () => {
    const r = parseCsv('\n\ntitulo;tipo\nUno;bug\n');
    expect(r.delimiter).toBe(';');
    expect(r.header).toEqual(['titulo', 'tipo']);
    expect(r.rows).toEqual([{ line: 4, cells: ['Uno', 'bug'] }]);
  });

  it('un texto vacío no tiene cabecera ni filas', () => {
    expect(parseCsv('')).toEqual({ delimiter: ',', header: [], rows: [] });
    expect(parseCsv('﻿\n\n')).toEqual({ delimiter: ',', header: [], rows: [] });
  });
});
