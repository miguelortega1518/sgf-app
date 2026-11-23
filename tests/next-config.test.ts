import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<Rule[]> {
  expect(nextConfig.headers).toBeTypeOf('function');
  return (await nextConfig.headers!()) as Rule[];
}

function header(rule: Rule | undefined, key: string): string | undefined {
  return rule?.headers.find(h => h.key.toLowerCase() === key.toLowerCase())?.value;
}

describe('next.config.ts: cabeceras', () => {
  it('la regla general /:path* mantiene las cabeceras de seguridad', async () => {
    const general = (await rules()).find(r => r.source === '/:path*');
    expect(general).toBeDefined();
    expect(header(general, 'X-Frame-Options')).toBe('DENY');
    expect(header(general, 'X-Content-Type-Options')).toBe('nosniff');
    expect(header(general, 'Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(header(general, 'Strict-Transport-Security')).toContain('max-age=');
  });

  it('/compartido/:path* no se indexa y no envía Referer', async () => {
    const all = await rules();
    const share = all.find(r => r.source === '/compartido/:path*');
    expect(share).toBeDefined();
    const robots = header(share, 'X-Robots-Tag')!;
    expect(robots).toContain('noindex');
    expect(robots).toContain('nofollow');
    expect(robots).toContain('noarchive');
    expect(header(share, 'Referrer-Policy')).toBe('no-referrer');
  });

  it('la regla de /compartido va después de la general para que su Referrer-Policy prevalezca', async () => {
    const all = await rules();
    const generalIdx = all.findIndex(r => r.source === '/:path*');
    const shareIdx = all.findIndex(r => r.source === '/compartido/:path*');
    expect(shareIdx).toBeGreaterThan(generalIdx);
  });
});
