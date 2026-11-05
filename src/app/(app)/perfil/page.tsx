'use client';

import { useState } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { useToast } from '@/components/providers/toast-provider';
import { Lock, Mail, Shield, MonitorSmartphone } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, passwordProblem } from '@/lib/password-policy';

export default function PerfilPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closingOthers, setClosingOthers] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    const problem = passwordProblem(newPassword, { email: user?.email });
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (res.ok) {
      toast('Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      const body = await res.json();
      setError(body.error || 'Error al cambiar la contraseña');
    }
    setSaving(false);
  }

  async function handleCloseOtherSessions() {
    setClosingOthers(true);
    try {
      const res = await fetch('/api/auth/logout-others', { method: 'POST' });
      if (res.ok) toast('Listo: tus otras sesiones quedaron cerradas.');
      else toast('No se pudieron cerrar las otras sesiones. Inténtalo de nuevo.', 'warning');
    } catch {
      toast('Sin conexión con el servidor.', 'warning');
    } finally {
      setClosingOthers(false);
    }
  }

  if (!user) return null;

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    miembro: 'Miembro',
    observador: 'Observador',
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Mi perfil</h1>

      <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-semibold">
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="text-lg font-medium text-gray-900">{user.name}</p>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Mail size={13} />
              {user.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Shield size={14} />
          <span>Rol: {ROLE_LABELS[user.role] || user.role}</span>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-5">
        <h2 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Lock size={16} />
          Cambiar contraseña
        </h2>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label htmlFor="current-password" className="block text-sm text-gray-600 mb-1">Contraseña actual</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm text-gray-600 mb-1">Nueva contraseña</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="new-password-hint"
            />
            <p id="new-password-hint" className="mt-1 text-xs text-gray-500">{PASSWORD_HINT}</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm text-gray-600 mb-1">Confirmar nueva contraseña</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>

      <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-5 mt-6">
        <h2 className="text-base font-medium text-gray-900 mb-2 flex items-center gap-2">
          <MonitorSmartphone size={16} />
          Sesiones abiertas
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Si entraste desde otro computador o teléfono y ya no lo usas, cierra esas sesiones. Esta seguirá abierta.
        </p>
        <button
          type="button"
          onClick={handleCloseOtherSessions}
          disabled={closingOthers}
          className="w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {closingOthers ? 'Cerrando…' : 'Cerrar sesión en los demás dispositivos'}
        </button>
      </div>
    </div>
  );
}
