import { describe, it, expect } from 'vitest';
import { orderSelfReferencing, orderTables, quoteIdent, validateBackupFile } from '../scripts/lib/backup-format';

describe('orderTables', () => {
  it('pone primero las tablas referenciadas', () => {
    const order = orderTables(
      ['tasks', 'persons', 'spaces', 'comments'],
      [
        { child: 'tasks', parent: 'spaces' },
        { child: 'tasks', parent: 'persons' },
        { child: 'comments', parent: 'tasks' },
        { child: 'spaces', parent: 'persons' },
      ],
    );
    expect(order.indexOf('persons')).toBeLessThan(order.indexOf('spaces'));
    expect(order.indexOf('spaces')).toBeLessThan(order.indexOf('tasks'));
    expect(order.indexOf('tasks')).toBeLessThan(order.indexOf('comments'));
  });

  it('ignora la referencia de una tabla a sí misma y a tablas fuera del respaldo', () => {
    expect(orderTables(['a', 'b'], [{ child: 'a', parent: 'a' }, { child: 'b', parent: 'rate_limits' }]).sort()).toEqual(['a', 'b']);
  });

  it('avisa si hay dependencia circular', () => {
    expect(() => orderTables(['a', 'b'], [{ child: 'a', parent: 'b' }, { child: 'b', parent: 'a' }])).toThrow(/circular/);
  });
});

describe('orderSelfReferencing', () => {
  it('deja los padres antes que los hijos aunque vengan al revés', () => {
    const rows = [
      { id: 'c', parent: 'b' },
      { id: 'b', parent: 'a' },
      { id: 'a', parent: null },
    ];
    expect(orderSelfReferencing(rows, 'id', 'parent').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('falla si un padre no existe', () => {
    expect(() => orderSelfReferencing([{ id: 'x', parent: 'fantasma' }], 'id', 'parent')).toThrow();
  });
});

describe('validateBackupFile', () => {
  const ok = { format: 'forja-backup', version: 1, counts: { persons: 1 }, data: { persons: [{ id: 'a' }] } };
  it('acepta un respaldo coherente', () => {
    expect(validateBackupFile(ok).counts.persons).toBe(1);
  });
  it('rechaza archivos ajenos o dañados', () => {
    expect(() => validateBackupFile({ foo: 1 })).toThrow(/no es un respaldo/);
    expect(() => validateBackupFile({ ...ok, counts: { persons: 5 } })).toThrow(/dañado/);
    expect(() => validateBackupFile(null)).toThrow();
  });
});

describe('quoteIdent', () => {
  it('escapa comillas para no abrir inyección en nombres de tabla', () => {
    expect(quoteIdent('tasks')).toBe('"tasks"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});
