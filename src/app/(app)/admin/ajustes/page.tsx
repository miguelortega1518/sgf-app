'use client';

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useSession } from '@/lib/hooks/use-session';
import { useToast } from '@/components/providers/toast-provider';
import { PersonMetricsSettingForm } from '@/components/admin/person-metrics-setting';

type TeamSettings = { showPersonMetrics: boolean };

/**
 * Ajustes del equipo (DECISIONES §22). La seguridad está en PATCH /api/settings/team
 * (requireRole('admin')); aquí sólo se decide si el control se muestra habilitado.
 */
export default function AjustesPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Con la sesión aún cargando (user indefinido) se trata como sin permiso.
  const canEdit = user?.role === 'admin';

  useEffect(() => {
    fetch('/api/settings/team')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`settings ${r.status}`))))
      .then((body: TeamSettings) => setSettings(body))
      .catch((err: unknown) => {
        console.error('No se pudieron cargar los ajustes del equipo', err);
        setLoadFailed(true);
      });
  }, []);

  async function handleToggle(next: boolean) {
    if (!settings || !canEdit) return;
    const previous = settings;
    setSettings({ ...settings, showPersonMetrics: next });
    setSaving(true);
    try {
      const res = await fetch('/api/settings/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showPersonMetrics: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSettings(previous);
        toast(body?.error || 'No se pudo guardar el ajuste', 'error');
        return;
      }
      setSettings(body as TeamSettings);
      toast(next ? 'Métricas por persona activadas' : 'Métricas por persona desactivadas', 'success');
    } catch {
      setSettings(previous);
      toast('Error de conexión', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Settings2 size={22} className="text-[var(--text-muted)]" />
          Ajustes del equipo
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Decisiones que aplican a todo el equipo. Cada cambio queda en la actividad.</p>
      </div>

      {loadFailed ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">No se pudieron cargar los ajustes del equipo.</p>
      ) : !settings ? (
        <div className="h-32 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" aria-hidden="true" />
      ) : (
        <PersonMetricsSettingForm
          enabled={settings.showPersonMetrics}
          canEdit={canEdit}
          saving={saving}
          onToggle={handleToggle}
        />
      )}
    </div>
  );
}
