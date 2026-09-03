'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, Upload } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { useRouter } from 'next/navigation';

type TemplateItem = {
  id: string;
  name: string;
  periodicity: string;
  targetCycleDays: number;
  active: boolean;
  taskCount: number;
};

const PERIODICITY_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

export default function PlantillasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, []);

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('templateName', file.name.replace(/\.[^.]+$/, ''));
    formData.append('targetCycleDays', '10');

    const res = await fetch('/api/templates/import-excel', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/plantillas/${data.template.id}`);
    } else {
      toast('Error al importar el archivo', 'error');
      setImporting(false);
    }
    e.target.value = '';
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-16 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Plantillas de cierre</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define las tareas recurrentes para cada período contable
          </p>
        </div>
        <div className="flex gap-2">
          <label className={`inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload size={16} />
            {importing ? 'Importando...' : 'Importar Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />
          </label>
          <a
            href="/admin/plantillas/nueva"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} />
            Nueva plantilla
          </a>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <FileText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay plantillas creadas</p>
          <p className="text-sm text-gray-400 mt-1">
            Crea una plantilla o importa desde un Excel
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <a
              key={t.id}
              href={`/admin/plantillas/${t.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{t.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span>{PERIODICITY_LABELS[t.periodicity]}</span>
                    <span>{t.targetCycleDays} días</span>
                    <span>{t.taskCount} tareas</span>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  t.active
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
