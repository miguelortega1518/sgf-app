'use client';

import { useState } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { useToast } from '@/components/providers/toast-provider';
import { EmailPreferencesSection, type EmailPreferenceKey } from '@/components/profile/email-preferences-section';
import { User, Lock, Mail, Shield } from 'lucide-react';

const EMAIL_PREF_ERROR = 'No se pudo guardar la preferencia de correo';

export default function PerfilPage() {
  const { user, loading, refresh } = useSession();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Valores elegidos en esta página; lo que falte sale de la sesión (true si no viene, p. ej. modo degradado).
  const [prefOverrides, setPrefOverrides] = useState<Partial<Record<EmailPreferenceKey, boolean>>>({});
  const [savingPrefs, setSavingPrefs] = useState(false);

  const emailPrefs: Record<EmailPreferenceKey, boolean> = {
    emailImmediate: prefOverrides.emailImmediate ?? user?.emailImmediate ?? true,
    emailDigest: prefOverrides.emailDigest ?? user?.emailDigest ?? true,
  };

  async function handleEmailPreferenceChange(key: EmailPreferenceKey, value: boolean) {
    const previous = emailPrefs[key];
    // Actualización optimista: se revierte si el servidor no confirma.
    setPrefOverrides(prev => ({ ...prev, [key]: value }));
    setSavingPrefs(true);
    let failure: string | null = null;
    try {
      const res = await fetch('/api/auth/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        // Sincroniza la sesión con lo guardado para que, al volver a Mi perfil, se vea el valor de la BD.
        // El override se conserva: coincide con el valor nuevo y cubre una respuesta degradada sin preferencias.
        await refresh();
      } else {
        const body = await res.json().catch(() => null);
        failure = body?.error || EMAIL_PREF_ERROR;
      }
    } catch {
      failure = EMAIL_PREF_ERROR;
    } finally {
      if (failure) {
        setPrefOverrides(prev => ({ ...prev, [key]: previous }));
        toast(failure, 'error');
      }
      setSavingPrefs(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (res.ok) {
      toast('Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      const body = await res.json();
      setError(body.error || 'Error al cambiar la contraseña');
    }
    setSaving(false);
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

      <EmailPreferencesSection
        emailImmediate={emailPrefs.emailImmediate}
        emailDigest={emailPrefs.emailDigest}
        disabled={savingPrefs || loading || !user}
        onChange={handleEmailPreferenceChange}
      />

      <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-5">
        <h2 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Lock size={16} />
          Cambiar contraseña
        </h2>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Contraseña actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={8}
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
    </div>
  );
}
