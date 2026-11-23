import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PersonMetricsSettingForm } from '../src/components/admin/person-metrics-setting';

const render = (props: { enabled: boolean; canEdit: boolean; saving?: boolean }) =>
  renderToStaticMarkup(createElement(PersonMetricsSettingForm, { saving: false, onToggle: () => {}, ...props }));

const checkbox = (html: string) => html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? '';
// Atributos booleanos tal como los pinta React (la clase `disabled:opacity-50` no cuenta).
const isChecked = (input: string) => input.includes('checked=""');
const isDisabled = (input: string) => input.includes('disabled=""');

describe('PersonMetricsSettingForm', () => {
  it('muestra el control con su etiqueta asociada y el texto explicativo', () => {
    const html = render({ enabled: true, canEdit: true });
    expect(html).toContain('Mostrar métricas por persona');
    expect(html).toContain('equilibrar la carga');
    expect(html).toContain('no para hacer rankings');
    expect(html).toContain('los totales del equipo siguen visibles');

    const input = checkbox(html);
    const id = input.match(/id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"`));
    const describedBy = input.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>[^<]*equilibrar la carga`));
  });

  it('el checkbox refleja el valor', () => {
    expect(isChecked(checkbox(render({ enabled: true, canEdit: true })))).toBe(true);
    expect(isChecked(checkbox(render({ enabled: false, canEdit: true })))).toBe(false);
  });

  it('un admin puede cambiarlo y no ve la nota', () => {
    const html = render({ enabled: true, canEdit: true });
    expect(isDisabled(checkbox(html))).toBe(false);
    expect(html).not.toContain('Sólo un admin puede cambiar este ajuste.');
  });

  it('sin permiso lo ve deshabilitado con la nota', () => {
    const html = render({ enabled: true, canEdit: false });
    expect(isDisabled(checkbox(html))).toBe(true);
    expect(html).toContain('Sólo un admin puede cambiar este ajuste.');
  });

  it('mientras guarda queda deshabilitado', () => {
    expect(isDisabled(checkbox(render({ enabled: true, canEdit: true, saving: true })))).toBe(true);
  });
});
