import { describe, expect, it } from 'vitest';
import { buildStatusHistory, startedAt, timeInStatus, type StatusEvent } from '../src/lib/status-history';

const at = (s: string) => new Date(s);
const CREATED = at('2026-10-01T12:00:00Z');
const ev = (newValue: string | null, when: string, previousValue: string | null = null): StatusEvent => ({
  taskId: 't1', previousValue, newValue, at: at(when),
});
const HOUR = 3_600_000;

describe('buildStatusHistory', () => {
  it('sin eventos devuelve un tramo no_iniciada abierto', () => {
    expect(buildStatusHistory({ createdAt: CREATED }, [])).toEqual([
      { status: 'no_iniciada', from: CREATED, to: null },
    ]);
  });

  it('recorrido completo devuelve 4 tramos con límites exactos', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('en_proceso', '2026-10-03T12:00:00Z', 'no_iniciada'),
      ev('en_revision', '2026-10-05T12:00:00Z', 'en_proceso'),
      ev('completada', '2026-10-06T12:00:00Z', 'en_revision'),
    ]);
    expect(h).toEqual([
      { status: 'no_iniciada', from: CREATED, to: at('2026-10-03T12:00:00Z') },
      { status: 'en_proceso', from: at('2026-10-03T12:00:00Z'), to: at('2026-10-05T12:00:00Z') },
      { status: 'en_revision', from: at('2026-10-05T12:00:00Z'), to: at('2026-10-06T12:00:00Z') },
      { status: 'completada', from: at('2026-10-06T12:00:00Z'), to: null },
    ]);
  });

  it('una reapertura crea un tramo completada intermedio y startedAt es el primer inicio', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('en_proceso', '2026-10-02T12:00:00Z'),
      ev('completada', '2026-10-04T12:00:00Z'),
      ev('en_proceso', '2026-10-06T12:00:00Z'),
      ev('completada', '2026-10-07T12:00:00Z'),
    ]);
    expect(h.map(s => s.status)).toEqual(['no_iniciada', 'en_proceso', 'completada', 'en_proceso', 'completada']);
    expect(h[2]).toEqual({ status: 'completada', from: at('2026-10-04T12:00:00Z'), to: at('2026-10-06T12:00:00Z') });
    expect(startedAt(h)).toEqual(at('2026-10-02T12:00:00Z'));
  });

  it('eventos desordenados dan el mismo resultado que ordenados', () => {
    const sorted = [
      ev('en_proceso', '2026-10-03T12:00:00Z'),
      ev('en_revision', '2026-10-05T12:00:00Z'),
      ev('completada', '2026-10-06T12:00:00Z'),
    ];
    const shuffled = [sorted[2], sorted[0], sorted[1]];
    expect(buildStatusHistory({ createdAt: CREATED }, shuffled)).toEqual(buildStatusHistory({ createdAt: CREATED }, sorted));
  });

  it('no modifica los eventos recibidos', () => {
    const events = [ev('completada', '2026-10-06T12:00:00Z'), ev('en_proceso', '2026-09-01T12:00:00Z')];
    const copy = events.map(e => ({ ...e, at: new Date(e.at) }));
    buildStatusHistory({ createdAt: CREATED }, events);
    expect(events).toEqual(copy);
  });

  it('un estado repetido no duplica el tramo', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('en_proceso', '2026-10-03T12:00:00Z'),
      ev('en_proceso', '2026-10-04T12:00:00Z'),
    ]);
    expect(h).toEqual([
      { status: 'no_iniciada', from: CREATED, to: at('2026-10-03T12:00:00Z') },
      { status: 'en_proceso', from: at('2026-10-03T12:00:00Z'), to: null },
    ]);
  });

  it('un evento anterior a createdAt se ajusta a createdAt sin tramos de duración cero ni negativa', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [ev('en_proceso', '2026-09-20T12:00:00Z')]);
    expect(h).toEqual([{ status: 'en_proceso', from: CREATED, to: null }]);
    expect(startedAt(h)).toEqual(CREATED);
  });

  it('ignora newValue null o desconocido sin lanzar', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev(null, '2026-10-02T12:00:00Z'),
      ev('pendiente', '2026-10-03T12:00:00Z'),
      ev('constructor', '2026-10-03T13:00:00Z'),
      ev('en_proceso', '2026-10-04T12:00:00Z'),
    ]);
    expect(h).toEqual([
      { status: 'no_iniciada', from: CREATED, to: at('2026-10-04T12:00:00Z') },
      { status: 'en_proceso', from: at('2026-10-04T12:00:00Z'), to: null },
    ]);
  });

  it('dos cambios en el mismo instante: prevalece el último, sin tramos de duración cero', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('en_proceso', '2026-10-03T12:00:00Z'),
      ev('en_revision', '2026-10-03T12:00:00Z'),
      ev('completada', '2026-10-05T12:00:00Z'),
    ]);
    expect(h).toEqual([
      { status: 'no_iniciada', from: CREATED, to: at('2026-10-03T12:00:00Z') },
      { status: 'en_revision', from: at('2026-10-03T12:00:00Z'), to: at('2026-10-05T12:00:00Z') },
      { status: 'completada', from: at('2026-10-05T12:00:00Z'), to: null },
    ]);
  });

  it('fusiona tramos iguales que quedan adyacentes al descartar uno de duración cero', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('en_proceso', '2026-10-03T12:00:00Z'),
      ev('bloqueada', '2026-10-04T12:00:00Z'),
      ev('en_proceso', '2026-10-04T12:00:00Z'),
    ]);
    expect(h).toEqual([
      { status: 'no_iniciada', from: CREATED, to: at('2026-10-03T12:00:00Z') },
      { status: 'en_proceso', from: at('2026-10-03T12:00:00Z'), to: null },
    ]);
  });

  it('confía en newValue si previousValue no coincide con el estado vigente', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('completada', '2026-10-05T12:00:00Z', 'en_revision'),
    ]);
    expect(h.map(s => s.status)).toEqual(['no_iniciada', 'completada']);
  });

  it('el salto directo a en_revision cuenta como inicio', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [ev('en_revision', '2026-10-04T12:00:00Z')]);
    expect(startedAt(h)).toEqual(at('2026-10-04T12:00:00Z'));
  });
});

describe('startedAt', () => {
  it('devuelve null sin eventos', () => {
    expect(startedAt(buildStatusHistory({ createdAt: CREATED }, []))).toBeNull();
    expect(startedAt([])).toBeNull();
  });

  it('devuelve null si sólo pasó por bloqueada', () => {
    expect(startedAt(buildStatusHistory({ createdAt: CREATED }, [ev('bloqueada', '2026-10-04T12:00:00Z')]))).toBeNull();
  });
});

describe('timeInStatus', () => {
  it('suma los tramos de un estado visitado varias veces', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, [
      ev('en_proceso', '2026-10-01T14:00:00Z'), // no_iniciada 2h
      ev('completada', '2026-10-01T17:00:00Z'), // en_proceso 3h
      ev('en_proceso', '2026-10-01T18:00:00Z'), // completada 1h
      ev('completada', '2026-10-01T22:00:00Z'), // en_proceso 4h
    ]);
    const r = timeInStatus(h, at('2026-10-02T00:00:00Z')); // completada abierta 2h
    expect(r).toEqual({ no_iniciada: 2 * HOUR, en_proceso: 7 * HOUR, completada: 3 * HOUR });
  });

  it('cierra el tramo abierto en now y no cuenta duraciones negativas', () => {
    const h = buildStatusHistory({ createdAt: CREATED }, []);
    expect(timeInStatus(h, at('2026-10-01T15:00:00Z'))).toEqual({ no_iniciada: 3 * HOUR });
    expect(timeInStatus(h, at('2026-09-01T00:00:00Z'))).toEqual({ no_iniciada: 0 });
  });

  it('historial vacío devuelve {}', () => {
    expect(timeInStatus([], at('2026-10-01T15:00:00Z'))).toEqual({});
  });
});
