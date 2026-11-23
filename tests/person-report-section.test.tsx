import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PersonReportSection } from '../src/components/reports/person-report-section';

const people = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Beto' }];
const base = { people, personId: 'p1', generating: null, onSelect: () => {}, onDownload: () => {} };

describe('PersonReportSection', () => {
  it('con el ajuste apagado no pinta nada', () => {
    expect(renderToStaticMarkup(createElement(PersonReportSection, { ...base, enabled: false }))).toBe('');
  });

  it('con el ajuste encendido pinta el reporte y las personas', () => {
    const html = renderToStaticMarkup(createElement(PersonReportSection, { ...base, enabled: true }));
    expect(html).toContain('Reporte por persona');
    expect(html).toMatch(/<option value="p1"[^>]*>Ana<\/option>/);
    expect(html).toMatch(/<option value="p2"[^>]*>Beto<\/option>/);
    expect(html).toMatch(/<label[^>]*for="report-person"[^>]*>Persona<\/label>/);
  });

  it('marca el botón que se está generando', () => {
    const html = renderToStaticMarkup(createElement(PersonReportSection, { ...base, enabled: true, generating: 'persona-pdf' }));
    expect(html).toContain('Generando...');
  });
});
