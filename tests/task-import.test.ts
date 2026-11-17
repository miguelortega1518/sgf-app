import { describe, expect, it } from 'vitest';
import {
  analyzeCsvImport,
  resolveCsvImport,
  normalizeHeader,
  parseImportDate,
  parseImportPriority,
  parseImportKind,
  parseImportLabels,
  CSV_IMPORT_TEMPLATE,
  type ImportContext,
  type ImportMember,
} from '../src/lib/task-import';
import {
  IMPORT_CSV_MAX_BYTES,
  IMPORT_CSV_MAX_ROWS,
  IMPORT_CSV_PREVIEW_ROWS,
  IMPORT_CSV_MAX_PER_WINDOW,
  IMPORT_CSV_MAX_BODY_BYTES,
  importCsvBodySchema,
} from '../src/lib/schemas/task-import';

const ana: ImportMember = { id: crypto.randomUUID(), name: 'Ana Pérez', email: 'ana@ejemplo.com' };
const beto: ImportMember = { id: crypto.randomUUID(), name: 'Beto Ruiz', email: 'beto@ejemplo.com' };
const lider: ImportMember = { id: crypto.randomUUID(), name: 'Lía Líder', email: 'lia@ejemplo.com' };
const hitoBeta = { id: crypto.randomUUID(), name: 'Beta' };

function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    membersByEmail: new Map([ana, beto, lider].map(m => [m.email, m])),
    milestonesByName: new Map([['Beta', [hitoBeta]]]),
    defaultReviewerId: lider.id,
    ...overrides,
  };
}

function run(csv: string, context: ImportContext = ctx()) {
  return resolveCsvImport(analyzeCsvImport(csv), context);
}

/** CSV con cabecera titulo,responsable,<col> y una fila con el valor dado. */
function oneValue(column: string, value: string) {
  const cell = /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return run(`titulo,responsable,${column}\nTarea,ana@ejemplo.com,${cell}\n`);
}

describe('esquema y constantes', () => {
  it('fija los límites del importador', () => {
    expect(IMPORT_CSV_MAX_BYTES).toBe(1048576);
    expect(IMPORT_CSV_MAX_ROWS).toBe(1000);
    expect(IMPORT_CSV_PREVIEW_ROWS).toBe(50);
    expect(IMPORT_CSV_MAX_PER_WINDOW).toBeGreaterThan(0);
    expect(IMPORT_CSV_MAX_BODY_BYTES).toBeGreaterThan(IMPORT_CSV_MAX_BYTES);
  });

  it('importCsvBodySchema valida el cuerpo', () => {
    expect(importCsvBodySchema.parse({ csv: 'a', dryRun: true })).toEqual({ csv: 'a', dryRun: true });
    const id = crypto.randomUUID();
    expect(importCsvBodySchema.parse({ csv: 'a', dryRun: false, defaultResponsibleId: id }).defaultResponsibleId).toBe(id);
    expect(importCsvBodySchema.safeParse({ csv: '', dryRun: true }).success).toBe(false);
    expect(importCsvBodySchema.safeParse({ csv: 'a' }).success).toBe(false);
    expect(importCsvBodySchema.safeParse({ csv: 'a', dryRun: true, defaultResponsibleId: 'x' }).success).toBe(false);
  });
});

describe('cabecera', () => {
  it('normaliza mayúsculas, tildes, espacios y guiones', () => {
    expect(normalizeHeader('  Fecha Límite ')).toBe('fecha_limite');
    expect(normalizeHeader('Story-Points')).toBe('story_points');
    expect(normalizeHeader('TÍTULO')).toBe('titulo');
  });

  it('reconoce los nombres con mayúsculas, tildes y espacios', () => {
    const r = run('Título,Responsable,Fecha Límite,Descripción,Estimación\nUno,ana@ejemplo.com,2026-03-15,Texto,3\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ title: 'Uno', dueDate: '2026-03-15', description: 'Texto', estimate: 3 });
  });

  it('admite los alias en inglés', () => {
    const r = run('summary,assignee,due,points,kind,priority,labels,milestone,reviewer,description\n'
      + 'Uno,ana@ejemplo.com,2026-03-15,5,bug,high,a;b,Beta,beto@ejemplo.com,Texto\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      title: 'Uno',
      responsible: { id: ana.id },
      reviewer: { id: beto.id, name: beto.name },
      dueDate: '2026-03-15',
      estimate: 5,
      kind: 'bug',
      priority: 'alta',
      labels: ['a', 'b'],
      milestone: { id: hitoBeta.id, name: 'Beta' },
      description: 'Texto',
    });
  });

  it('avisa e ignora una columna desconocida', () => {
    const r = run('titulo,responsable,color\nUno,ana@ejemplo.com,rojo\n');
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatchObject({ line: 1, column: null });
    expect(r.warnings[0].message).toContain('color');
  });

  it('avisa de que el estado no se importa', () => {
    for (const col of ['estado', 'Status']) {
      const r = run(`titulo,responsable,${col}\nUno,ana@ejemplo.com,Hecho\n`);
      expect(r.errors).toEqual([]);
      expect(r.warnings.map(w => w.message)).toEqual(['El estado no se importa: todas las tareas empiezan en Por hacer']);
    }
  });

  it('sin columna titulo da un error de línea 1', () => {
    const r = run('responsable,tipo\nana@ejemplo.com,bug\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 1, column: 'titulo' });
    expect(r.rows).toEqual([]);
  });

  it('dos columnas que van al mismo campo dan un error de línea 1', () => {
    const r = run('titulo,title,responsable\nUno,Dos,ana@ejemplo.com\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 1, column: 'titulo' });
    expect(r.rows).toEqual([]);
  });

  it('sin columna responsable ni responsable por defecto da un único error', () => {
    const r = run('titulo\nUno\nDos\nTres\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 1, column: 'responsable' });
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(3);
  });

  it('sin columna responsable usa el responsable por defecto', () => {
    const r = run('titulo\nUno\nDos\n', ctx({ defaultResponsible: beto }));
    expect(r.errors).toEqual([]);
    expect(r.rows.map(row => row.responsible.id)).toEqual([beto.id, beto.id]);
  });
});

describe('valores por columna', () => {
  it('titulo: recorta y exige 1–500 caracteres', () => {
    expect(run('titulo,responsable\n  Uno  ,ana@ejemplo.com\n').rows[0].title).toBe('Uno');
    const empty = run('titulo,responsable\n   ,ana@ejemplo.com\n');
    expect(empty.errors).toEqual([expect.objectContaining({ line: 2, column: 'titulo' })]);
    const long = run(`titulo,responsable\n${'x'.repeat(501)},ana@ejemplo.com\n`);
    expect(long.errors).toEqual([expect.objectContaining({ line: 2, column: 'titulo' })]);
    expect(long.errors[0].message).toContain('500');
    expect(run(`titulo,responsable\n${'x'.repeat(500)},ana@ejemplo.com\n`).errors).toEqual([]);
  });

  it('descripcion: hasta 5000 y vacía = sin descripción', () => {
    expect(oneValue('descripcion', '').rows[0].description).toBeNull();
    expect(oneValue('descripcion', 'x'.repeat(5000)).errors).toEqual([]);
    const r = oneValue('descripcion', 'x'.repeat(5001));
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, column: 'descripcion' })]);
    expect(r.errors[0].message).toContain('5000');
  });

  it('fecha_limite: YYYY-MM-DD y DD/MM/YYYY', () => {
    expect(oneValue('fecha_limite', '2026-03-15').rows[0].dueDate).toBe('2026-03-15');
    expect(oneValue('fecha_limite', '15/03/2026').rows[0].dueDate).toBe('2026-03-15');
    expect(oneValue('fecha_limite', '5/3/2026').rows[0].dueDate).toBe('2026-03-05');
    expect(oneValue('fecha_limite', '').rows[0].dueDate).toBeNull();
    for (const bad of ['31/02/2026', '2026-02-30', '15-03-2026', 'abc']) {
      const r = oneValue('fecha_limite', bad);
      expect(r.errors, bad).toEqual([expect.objectContaining({ line: 2, column: 'fecha_limite' })]);
      expect(r.rows).toEqual([]);
    }
  });

  it('parseImportDate convierte y valida', () => {
    expect(parseImportDate('2026-03-15')).toBe('2026-03-15');
    expect(parseImportDate('15/03/2026')).toBe('2026-03-15');
    expect(parseImportDate('1/1/2026')).toBe('2026-01-01');
    expect(parseImportDate('31/02/2026')).toBeNull();
    expect(parseImportDate('2026-02-30')).toBeNull();
    expect(parseImportDate('15-03-2026')).toBeNull();
    expect(parseImportDate('abc')).toBeNull();
  });

  it('prioridad: español e inglés, sin distinguir mayúsculas ni tildes', () => {
    expect(oneValue('prioridad', 'High').rows[0].priority).toBe('alta');
    expect(oneValue('prioridad', 'crítica').rows[0].priority).toBe('critica');
    expect(oneValue('prioridad', '').rows[0].priority).toBe('normal');
    const r = oneValue('prioridad', 'urgente');
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, column: 'prioridad' })]);
  });

  it('parseImportPriority mapea los alias', () => {
    expect(parseImportPriority('CRITICAL')).toBe('critica');
    expect(parseImportPriority('medium')).toBe('normal');
    expect(parseImportPriority('Low')).toBe('baja');
    expect(parseImportPriority('Baja')).toBe('baja');
    expect(parseImportPriority('')).toBe('normal');
    expect(parseImportPriority('urgente')).toBeNull();
  });

  it('tipo: TASK_KINDS y alias en inglés', () => {
    expect(oneValue('tipo', 'story').rows[0].kind).toBe('feature');
    expect(oneValue('tipo', 'task').rows[0].kind).toBe('feature');
    expect(oneValue('tipo', 'Bug').rows[0].kind).toBe('bug');
    expect(oneValue('tipo', 'enhancement').rows[0].kind).toBe('mejora');
    expect(oneValue('tipo', '').rows[0].kind).toBe('feature');
    const r = oneValue('tipo', 'x');
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, column: 'tipo' })]);
  });

  it('parseImportKind mapea los alias', () => {
    expect(parseImportKind('historia')).toBe('feature');
    expect(parseImportKind('Tarea')).toBe('feature');
    expect(parseImportKind('improvement')).toBe('mejora');
    expect(parseImportKind('debt')).toBe('deuda');
    expect(parseImportKind('tech_debt')).toBe('deuda');
    expect(parseImportKind('Tech Debt')).toBe('deuda');
    expect(parseImportKind('chore')).toBe('chore');
    expect(parseImportKind('Deuda')).toBe('deuda');
    expect(parseImportKind('x')).toBeNull();
  });

  it('estimacion: sólo enteros de 0 a 100', () => {
    expect(oneValue('estimacion', '0').rows[0].estimate).toBe(0);
    expect(oneValue('estimacion', '100').rows[0].estimate).toBe(100);
    expect(oneValue('estimacion', '').rows[0].estimate).toBeNull();
    for (const bad of ['101', '-1', '2.5', 'tres']) {
      const r = oneValue('estimacion', bad);
      expect(r.errors, bad).toEqual([expect.objectContaining({ line: 2, column: 'estimacion' })]);
      expect(r.errors[0].message).toContain('100');
    }
  });

  it('etiquetas: separadas por ; | o , sin vacías ni duplicadas', () => {
    expect(oneValue('etiquetas', 'a; b ;c').rows[0].labels).toEqual(['a', 'b', 'c']);
    expect(oneValue('etiquetas', 'a|b').rows[0].labels).toEqual(['a', 'b']);
    expect(oneValue('etiquetas', 'a,b').rows[0].labels).toEqual(['a', 'b']);
    expect(oneValue('etiquetas', 'a;;a; ;b').rows[0].labels).toEqual(['a', 'b']);
    expect(oneValue('etiquetas', '').rows[0].labels).toEqual([]);
  });

  it('parseImportLabels separa y limpia', () => {
    expect(parseImportLabels(' x | y ; x , z ')).toEqual(['x', 'y', 'z']);
    expect(parseImportLabels('')).toEqual([]);
  });

  it('etiquetas: más de 8 o alguna de más de 30 caracteres es error', () => {
    const many = oneValue('etiquetas', 'a;b;c;d;e;f;g;h;i');
    expect(many.errors).toEqual([expect.objectContaining({ line: 2, column: 'etiquetas' })]);
    expect(many.errors[0].message).toContain('8');
    expect(oneValue('etiquetas', 'a;b;c;d;e;f;g;h').errors).toEqual([]);
    const long = oneValue('etiquetas', 'x'.repeat(31));
    expect(long.errors).toEqual([expect.objectContaining({ line: 2, column: 'etiquetas' })]);
    expect(long.errors[0].message).toContain('30');
    expect(oneValue('etiquetas', 'x'.repeat(30)).errors).toEqual([]);
  });

  it('informa varios errores de una fila y de varias filas con su línea', () => {
    const r = run('titulo,responsable,prioridad,tipo\nUno,ana@ejemplo.com,urgente,x\nDos,ana@ejemplo.com,alta,bug\n,ana@ejemplo.com,,\n');
    expect(r.errors.map(e => [e.line, e.column])).toEqual([
      [2, 'prioridad'], [2, 'tipo'], [4, 'titulo'],
    ]);
    expect(r.rows.map(row => row.title)).toEqual(['Dos']);
    expect(r.total).toBe(3);
  });
});

describe('referencias a personas e hitos', () => {
  it('resuelve el responsable sin distinguir mayúsculas', () => {
    const r = run('titulo,responsable\nUno,ANA@Ejemplo.com\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0].responsible).toEqual({ id: ana.id, name: ana.name, email: ana.email });
  });

  it('un responsable que no es miembro da error en la columna responsable', () => {
    const r = run('titulo,responsable\nUno,zoe@ejemplo.com\n');
    expect(r.errors).toEqual([{
      line: 2,
      column: 'responsable',
      message: 'zoe@ejemplo.com no es miembro del proyecto con permiso de escritura',
    }]);
    expect(r.rows).toEqual([]);
  });

  it('un revisor que no es miembro da error', () => {
    const r = run('titulo,responsable,revisor\nUno,ana@ejemplo.com,zoe@ejemplo.com\n');
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, column: 'revisor' })]);
    expect(r.errors[0].message).toContain('zoe@ejemplo.com');
  });

  it('un revisor vacío usa el revisor por defecto (líder)', () => {
    const r = run('titulo,responsable,revisor\nUno,ana@ejemplo.com,\n');
    expect(r.rows[0].reviewer).toEqual({ id: lider.id, name: lider.name });
  });

  it('sin revisor por defecto, el revisor vacío queda en null', () => {
    const r = run('titulo,responsable\nUno,ana@ejemplo.com\n', ctx({ defaultReviewerId: null }));
    expect(r.rows[0].reviewer).toBeNull();
  });

  it('un responsable vacío usa el de por defecto', () => {
    const r = run('titulo,responsable\nUno,\n', ctx({ defaultResponsible: beto }));
    expect(r.errors).toEqual([]);
    expect(r.rows[0].responsible.id).toBe(beto.id);
  });

  it('un responsable vacío sin responsable por defecto es error de la fila', () => {
    const r = run('titulo,responsable\nUno,\nDos,ana@ejemplo.com\n');
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, column: 'responsable' })]);
    expect(r.rows.map(row => row.title)).toEqual(['Dos']);
  });

  it('hito: nombre exacto tras el trim', () => {
    const r = run('titulo,responsable,hito\nUno,ana@ejemplo.com,  Beta \nDos,ana@ejemplo.com,\n');
    expect(r.errors).toEqual([]);
    expect(r.rows[0].milestone).toEqual({ id: hitoBeta.id, name: 'Beta' });
    expect(r.rows[1].milestone).toBeNull();
  });

  it('hito inexistente o con otro caso de letra da error', () => {
    for (const name of ['Gamma', 'beta']) {
      const r = run(`titulo,responsable,hito\nUno,ana@ejemplo.com,${name}\n`);
      expect(r.errors, name).toEqual([expect.objectContaining({ line: 2, column: 'hito' })]);
      expect(r.errors[0].message).toContain(name);
    }
  });

  it('hito repetido en el proyecto da error', () => {
    const dup = ctx({ milestonesByName: new Map([['Beta', [hitoBeta, { id: crypto.randomUUID(), name: 'Beta' }]]]) });
    const r = run('titulo,responsable,hito\nUno,ana@ejemplo.com,Beta\n', dup);
    expect(r.errors).toEqual([expect.objectContaining({ line: 2, column: 'hito' })]);
  });

  it('el análisis recoge los correos en minúsculas y los hitos únicos', () => {
    const a = analyzeCsvImport('titulo,responsable,revisor,hito\nUno,ANA@ejemplo.com,beto@ejemplo.com,Beta\nDos,ana@ejemplo.com,,Beta\nTres,zoe@x.com,,Alfa\n');
    expect([...a.emails].sort()).toEqual(['ana@ejemplo.com', 'beto@ejemplo.com', 'zoe@x.com']);
    expect([...a.milestoneNames].sort()).toEqual(['Alfa', 'Beta']);
  });
});

describe('límites', () => {
  it('un CSV de más de IMPORT_CSV_MAX_BYTES da un único error', () => {
    const header = 'titulo,responsable\n';
    const csv = header + 'x'.repeat(IMPORT_CSV_MAX_BYTES + 1 - header.length);
    expect(new TextEncoder().encode(csv).length).toBe(IMPORT_CSV_MAX_BYTES + 1);
    const r = run(csv);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain(String(IMPORT_CSV_MAX_BYTES));
    expect(r.rows).toEqual([]);
  });

  it('mide los bytes en UTF-8, no los caracteres', () => {
    const header = 'titulo,responsable\n';
    const csv = header + 'ñ'.repeat(Math.ceil((IMPORT_CSV_MAX_BYTES - header.length) / 2) + 1);
    expect(csv.length).toBeLessThan(IMPORT_CSV_MAX_BYTES);
    const r = run(csv);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain(String(IMPORT_CSV_MAX_BYTES));
  });

  function rowsCsv(n: number) {
    const lines = ['titulo,responsable'];
    for (let i = 1; i <= n; i++) lines.push(`Tarea ${i},ana@ejemplo.com`);
    return lines.join('\n');
  }

  it('más de IMPORT_CSV_MAX_ROWS filas de datos da un único error', () => {
    const r = run(rowsCsv(IMPORT_CSV_MAX_ROWS + 1));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain(String(IMPORT_CSV_MAX_ROWS));
    expect(r.rows).toEqual([]);
  });

  it('exactamente IMPORT_CSV_MAX_ROWS filas no da error de límite', () => {
    const r = run(rowsCsv(IMPORT_CSV_MAX_ROWS));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(IMPORT_CSV_MAX_ROWS);
    expect(r.total).toBe(IMPORT_CSV_MAX_ROWS);
  });

  it('un CSV con sólo la cabecera no tiene filas de datos', () => {
    const r = run('titulo,responsable\n\n');
    expect(r.errors).toEqual([{ line: null, column: null, message: 'El CSV no tiene filas de datos' }]);
    expect(r.total).toBe(0);
  });

  it('una comilla sin cerrar se convierte en un error con su línea', () => {
    const r = run('titulo,responsable\nUno,ana@ejemplo.com\n"Dos,ana@ejemplo.com\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 3, column: null });
  });

  it('CSV_IMPORT_TEMPLATE se analiza sin errores de formato', () => {
    const lines = CSV_IMPORT_TEMPLATE.trim().split('\n');
    expect(lines).toHaveLength(3);
    const a = analyzeCsvImport(CSV_IMPORT_TEMPLATE);
    expect(a.errors).toEqual([]);
    expect(a.warnings).toEqual([]);
    expect(a.rows).toHaveLength(2);
    expect(CSV_IMPORT_TEMPLATE).toContain('ana@ejemplo.com');
    expect(CSV_IMPORT_TEMPLATE).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('rendimiento', () => {
  it('analiza y resuelve 1000 filas completas en menos de un segundo', () => {
    const lines = ['titulo,descripcion,responsable,revisor,fecha_limite,prioridad,tipo,estimacion,etiquetas,hito'];
    for (let i = 1; i <= IMPORT_CSV_MAX_ROWS; i++) {
      lines.push(`"Tarea ${i}, con coma","Descripción ""larga""\ncon salto",ana@ejemplo.com,beto@ejemplo.com,15/03/2026,alta,bug,${i % 101},"api;web|qa",Beta`);
    }
    const csv = lines.join('\r\n');
    const start = performance.now();
    const r = resolveCsvImport(analyzeCsvImport(csv), ctx());
    const elapsed = performance.now() - start;
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(IMPORT_CSV_MAX_ROWS);
    expect(r.rows[0]).toMatchObject({ title: 'Tarea 1, con coma', description: 'Descripción "larga"\ncon salto', labels: ['api', 'web', 'qa'] });
    expect(r.rows[1].line).toBe(4);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('preview total', () => {
  it('IMPORT_CSV_PREVIEW_ROWS es menor que el máximo de filas', () => {
    expect(IMPORT_CSV_PREVIEW_ROWS).toBeLessThan(IMPORT_CSV_MAX_ROWS);
  });
});
