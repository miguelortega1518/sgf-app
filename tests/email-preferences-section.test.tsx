import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmailPreferencesSection } from '../src/components/profile/email-preferences-section';

const IMMEDIATE_TEXT = 'Avisos inmediatos por correo (asignaciones, revisiones y bloqueos)';
const DIGEST_TEXT = 'Resumen diario por correo';

function render(props: { emailImmediate: boolean; emailDigest: boolean; disabled?: boolean }) {
  return renderToStaticMarkup(createElement(EmailPreferencesSection, { ...props, onChange: () => {} }));
}

function switches(html: string): string[] {
  return [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map(m => m[0]);
}

describe('EmailPreferencesSection', () => {
  it('muestra el título «Correo» y los dos textos exactos', () => {
    const html = render({ emailImmediate: true, emailDigest: true });
    expect(html).toContain('>Correo<');
    expect(html).toContain(IMMEDIATE_TEXT);
    expect(html).toContain(DIGEST_TEXT);
  });

  it('renderiza dos interruptores tipo botón con role="switch"', () => {
    const buttons = switches(render({ emailImmediate: true, emailDigest: true }));
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b).toContain('type="button"');
  });

  it.each([
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ])('aria-checked refleja emailImmediate=%s y emailDigest=%s', (emailImmediate, emailDigest) => {
    const [immediate, digest] = switches(render({ emailImmediate, emailDigest }));
    expect(immediate).toContain(`aria-checked="${emailImmediate}"`);
    expect(digest).toContain(`aria-checked="${emailDigest}"`);
  });

  it('cada interruptor está etiquetado por su texto', () => {
    const html = render({ emailImmediate: true, emailDigest: false });
    for (const button of switches(html)) {
      const id = /aria-labelledby="([^"]+)"/.exec(button)?.[1];
      expect(id).toBeTruthy();
      expect(html).toContain(`id="${id}"`);
    }
    const [immediate, digest] = switches(html);
    const immediateId = /aria-labelledby="([^"]+)"/.exec(immediate)![1];
    const digestId = /aria-labelledby="([^"]+)"/.exec(digest)![1];
    expect(immediateId).not.toBe(digestId);
    expect(html).toMatch(new RegExp(`id="${immediateId}"[^>]*>${IMMEDIATE_TEXT.replace(/[()]/g, '\\$&')}<`));
    expect(html).toMatch(new RegExp(`id="${digestId}"[^>]*>${DIGEST_TEXT}<`));
  });

  it('con disabled=true los interruptores llevan el atributo disabled', () => {
    for (const b of switches(render({ emailImmediate: true, emailDigest: true, disabled: true }))) {
      expect(b).toMatch(/\sdisabled=""/);
    }
  });

  it('sin disabled los interruptores no llevan el atributo disabled', () => {
    for (const b of switches(render({ emailImmediate: true, emailDigest: true }))) {
      expect(b).not.toMatch(/\sdisabled=""/);
    }
  });
});
