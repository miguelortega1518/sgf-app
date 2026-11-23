import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareLinkPanel, type ShareLinkPanelProps } from '../src/components/share/share-link-panel';

const noop = () => {};

function render(overrides: Partial<ShareLinkPanelProps> = {}) {
  return renderToStaticMarkup(createElement(ShareLinkPanel, {
    canManage: true,
    spaceClosed: false,
    active: false,
    createdAt: null,
    createdUrl: null,
    busy: false,
    error: null,
    confirmingRevoke: false,
    today: '2026-11-23',
    onCreate: noop,
    onRevoke: noop,
    onCopy: noop,
    onAskRevoke: noop,
    onCancelRevoke: noop,
    ...overrides,
  }));
}

describe('ShareLinkPanel', () => {
  it('sin permiso no pinta nada', () => {
    expect(render({ canManage: false })).toBe('');
    expect(render({ canManage: false, active: true, createdAt: '2026-11-20T15:00:00.000Z' })).toBe('');
  });

  it('sin enlace y con el proyecto activo pinta «Crear enlace»', () => {
    const html = render();
    expect(html).toContain('Enlace para no técnicos');
    expect(html).toContain('Crear enlace');
    expect(html).not.toContain('Revocar enlace');
  });

  it('con el proyecto cerrado y sin enlace no pinta «Crear enlace»', () => {
    const html = render({ spaceClosed: true });
    expect(html).not.toContain('Crear enlace');
  });

  it('recién creado pinta la URL, «Copiar» y el aviso', () => {
    const url = 'https://forja.example.do/compartido/abc';
    const html = render({ active: true, createdAt: '2026-11-23T15:00:00.000Z', createdUrl: url });
    expect(html).toContain(url);
    expect(html).toContain('Copiar');
    expect(html).toContain('Copie el enlace ahora: no se volverá a mostrar.');
  });

  it('con enlace activo pinta «Enlace activo desde …» y «Revocar enlace»', () => {
    const html = render({ active: true, createdAt: '2026-11-20T15:00:00.000Z' });
    expect(html).toContain('Enlace activo desde el 20 nov');
    expect(html).toContain('Revocar enlace');
    expect(html).not.toContain('Crear enlace');
    expect(html).not.toContain('Copie el enlace ahora');
  });

  it('con el proyecto cerrado se puede revocar igualmente', () => {
    const html = render({ spaceClosed: true, active: true, createdAt: '2026-11-20T15:00:00.000Z' });
    expect(html).toContain('Revocar enlace');
  });

  it('la confirmación de revocar es en línea (Sí/No), sin diálogo modal', () => {
    const html = render({ active: true, createdAt: '2026-11-20T15:00:00.000Z', confirmingRevoke: true });
    expect(html).toContain('¿Revocar el enlace?');
    expect(html).toContain('>Sí<');
    expect(html).toContain('>No<');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
  });

  it('muestra el error del servidor', () => {
    const html = render({ error: 'El proyecto ya tiene un enlace público activo; revóquelo antes de crear otro' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('revóquelo antes de crear otro');
  });

  it('desactiva los botones mientras trabaja', () => {
    expect(render({ busy: true })).toMatch(/<button[^>]*disabled=""[^>]*>Crear enlace/);
  });
});
