'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { useSession } from '@/lib/hooks/use-session';
import { Wordmark } from '@/components/ui/logo';

const INPUT =
  'w-full h-10 pl-3 pr-10 rounded-md border border-[var(--border-strong)] text-sm transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

export default function CambiarContrasenaPage() {
  const { user, loading, refresh, logout } = useSession();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!user.mustChangePassword) router.replace('/mi-trabajo');
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (next !== confirm) return setError('Las contraseñas nuevas no coinciden.');
    if (next === current) return setError('La nueva contraseña debe ser distinta de la actual.');

    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'No se pudo cambiar la contraseña.');
        return;
      }
      await refresh();
      router.replace('/mi-trabajo');
    } catch {
      setError('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !user.mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 className="animate-spin text-[var(--text-muted)]" size={24} aria-label="Cargando" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="px-8 py-6">
        <Wordmark />
      </header>

      <main className="flex-1 flex items-start justify-center px-6 pb-16 pt-6">
        <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Tu cuenta tiene una contraseña temporal. Por seguridad, elige una propia antes de continuar.
            </p>
          </div>

          <h1 className="mt-6 text-xl font-semibold tracking-tight text-[var(--text-primary)]">Elige tu contraseña</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Sesión iniciada como <span className="font-medium">{user.email}</span>
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="current" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Contraseña temporal (la actual)
              </label>
              <input id="current" type={show ? 'text' : 'password'} autoComplete="current-password" value={current}
                onChange={(e) => setCurrent(e.target.value)} className={INPUT} required />
            </div>

            <div>
              <label htmlFor="next" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Nueva contraseña
              </label>
              <div className="relative">
                <input id="next" type={show ? 'text' : 'password'} autoComplete="new-password" value={next}
                  onChange={(e) => setNext(e.target.value)} className={INPUT} required minLength={8} aria-describedby="next-hint" />
                <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show}
                  aria-label={show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                  className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-r-md">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p id="next-hint" className="mt-1 text-xs text-[var(--text-muted)]">Mínimo 8 caracteres. Usa una que no uses en otro sitio.</p>
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Repite la nueva contraseña
              </label>
              <input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className={INPUT} required />
            </div>

            <div aria-live="polite" className="min-h-5">
              {error && (
                <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <button type="submit" disabled={saving || !current || !next || !confirm}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {saving ? 'Guardando…' : 'Guardar y continuar'}
            </button>
          </form>

          <button type="button" onClick={logout}
            className="mt-4 w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] underline-offset-2 hover:underline">
            Cerrar sesión
          </button>
        </div>
      </main>
    </div>
  );
}
