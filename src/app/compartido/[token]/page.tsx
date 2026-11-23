import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { SharedProjectView } from '@/components/share/shared-project-view';
import { formatWait } from '@/lib/rate-limit';
import { loadSharedProject } from '@/lib/shared-project';

// Título genérico (sin el nombre del proyecto) y sin indexar. La cabecera X-Robots-Tag
// y Referrer-Policy: no-referrer salen de next.config.ts.
export const metadata: Metadata = {
  title: 'Estado del proyecto',
  robots: { index: false, follow: false },
};

/** Primera IP de x-forwarded-for (la pone el proxy de Render); 'unknown' si falta. */
function clientIp(forwardedFor: string | null): string {
  const first = forwardedFor?.split(',')[0]?.trim();
  return first || 'unknown';
}

/**
 * Vista pública de sólo lectura de un proyecto. Fuera del grupo (app): no exige sesión.
 * Inexistente, revocado y mal formado dan el mismo 404 genérico.
 */
export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ip = clientIp((await headers()).get('x-forwarded-for'));

  const result = await loadSharedProject(token, ip);
  if (result.kind === 'not_found') notFound();

  if (result.kind === 'rate_limited') {
    return (
      <main className="flex min-h-full items-center justify-center bg-[var(--bg-primary)] p-6">
        <p role="alert" className="max-w-md text-center text-sm text-[var(--text-secondary)]">
          {`Demasiadas visitas seguidas desde su red. Vuelva a intentarlo en ${formatWait(result.retryAfterMs)}.`}
        </p>
      </main>
    );
  }

  return <SharedProjectView view={result.view} />;
}
