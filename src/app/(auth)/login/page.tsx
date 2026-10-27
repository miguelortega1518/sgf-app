'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, GitPullRequest, GitBranch } from 'lucide-react';
import { useSession } from '@/lib/hooks/use-session';
import { Wordmark } from '@/components/ui/logo';

const PREVIEW_COLUMNS = [
  {
    name: 'Por hacer',
    dot: 'bg-gray-400',
    items: [
      { id: 'FOR-142', title: 'Paginación en el listado de facturas', kind: 'Mejora', pts: 3 },
      { id: 'FOR-147', title: 'Migrar cron de reportes a worker', kind: 'Deuda', pts: 5 },
    ],
  },
  {
    name: 'En progreso',
    dot: 'bg-blue-500',
    items: [
      { id: 'FOR-139', title: 'Timeout en login con VPN activa', kind: 'Bug', pts: 2, branch: 'fix/login-timeout' },
    ],
  },
  {
    name: 'En code review',
    dot: 'bg-purple-500',
    items: [
      { id: 'FOR-136', title: 'Filtros guardados en el tablero', kind: 'Feature', pts: 8, pr: '#218' },
    ],
  },
];

const KIND_STYLE: Record<string, string> = {
  Bug: 'bg-red-100 text-red-700',
  Feature: 'bg-blue-100 text-blue-700',
  Mejora: 'bg-green-100 text-green-700',
  Deuda: 'bg-amber-100 text-amber-700',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'No se pudo iniciar sesión');
        return;
      }
      await refresh();
      router.push('/mi-trabajo');
    } catch {
      setError('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,26rem)_1fr] bg-[var(--bg-primary)]">
      <main className="flex flex-col justify-between px-8 py-10 sm:px-12 border-r border-[var(--border)] bg-[var(--bg-card)]">
        <Wordmark />

        <div className="w-full max-w-sm py-12">
          <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-[var(--text-primary)] text-balance">
            Entra a tu tablero
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Tareas, sprints y revisiones de código de tu equipo en un solo lugar.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Correo del equipo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="w-full h-10 px-3 rounded-md border border-[var(--border-strong)] text-sm transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 pl-3 pr-10 rounded-md border border-[var(--border-strong)] text-sm transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-r-md"
                  aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={show}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div aria-live="polite" className="min-h-5">
              {error && (
                <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-xs text-[var(--text-muted)]">Acceso solo para miembros invitados al equipo.</p>
      </main>

      <aside className="hidden lg:flex flex-col justify-center px-14 xl:px-20" aria-hidden="true">
        <p className="text-sm text-[var(--text-muted)] mb-4">Vista previa · datos de ejemplo</p>
        <div className="grid grid-cols-3 gap-4 max-w-3xl">
          {PREVIEW_COLUMNS.map((col) => (
            <div key={col.name} className="min-w-0">
              <div className="flex items-center gap-2 mb-3 text-xs font-medium text-[var(--text-secondary)]">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                {col.name}
                <span className="tabular text-[var(--text-muted)]">{col.items.length}</span>
              </div>
              <div className="space-y-2.5">
                {col.items.map((it) => (
                  <div key={it.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 shadow-[0_1px_2px_oklch(0.2_0.02_255/0.06)]">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">{it.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${KIND_STYLE[it.kind]}`}>{it.kind}</span>
                    </div>
                    <p className="text-[13px] leading-snug text-[var(--text-primary)]">{it.title}</p>
                    <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <span className="tabular rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">{it.pts} pts</span>
                      {'branch' in it && it.branch && (
                        <span className="inline-flex items-center gap-1 font-mono truncate"><GitBranch size={11} />{it.branch}</span>
                      )}
                      {'pr' in it && it.pr && (
                        <span className="inline-flex items-center gap-1 font-mono text-purple-700"><GitPullRequest size={11} />{it.pr}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
