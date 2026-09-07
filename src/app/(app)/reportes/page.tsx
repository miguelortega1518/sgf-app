'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/hooks/use-session';
import { useToast } from '@/components/providers/toast-provider';
import {
  FileText, Users, AlertTriangle, Building2, Download,
} from 'lucide-react';

type Person = { id: string; name: string };
type Company = { id: string; name: string };

export default function ReportesPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [personId, setPersonId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [days, setDays] = useState('7');
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/persons').then(r => r.ok ? r.json() : []),
      fetch('/api/companies').then(r => r.ok ? r.json() : []),
    ]).then(([p, c]) => {
      const personList = Array.isArray(p) ? p : (p.data ?? []);
      const companyList = Array.isArray(c) ? c : (c.data ?? []);
      setPeople(personList);
      setCompanies(companyList);
      if (personList.length > 0) setPersonId(personList[0].id);
      if (companyList.length > 0) setCompanyId(companyList[0].id);
    }).finally(() => setLoading(false));
  }, []);

  async function download(url: string, reportName: string) {
    setGenerating(reportName);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast(body?.error || 'Error al generar reporte');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || 'reporte';

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Reporte descargado');
    } catch {
      toast('Error de conexión');
    } finally {
      setGenerating(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Reportes</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Genera y descarga reportes en Excel o PDF
        </p>
      </div>

      <div className="space-y-6">
        {/* Reporte por persona */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Users size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-medium text-[var(--text-primary)]">Reporte por persona</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Tareas asignadas, completadas, vencidas, tasa de cumplimiento y tiempo promedio de resolución
              </p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Persona</label>
              <select
                value={personId}
                onChange={e => setPersonId(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => download(`/api/reports/persona?personId=${personId}&format=xlsx`, 'persona-xlsx')}
              disabled={!personId || generating === 'persona-xlsx'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              <Download size={14} />
              {generating === 'persona-xlsx' ? 'Generando...' : 'Excel'}
            </button>
            <button
              onClick={() => download(`/api/reports/persona?personId=${personId}&format=pdf`, 'persona-pdf')}
              disabled={!personId || generating === 'persona-pdf'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              <FileText size={14} />
              {generating === 'persona-pdf' ? 'Generando...' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Reporte de vencimientos */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-medium text-[var(--text-primary)]">Reporte de vencimientos</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Tareas vencidas y próximas a vencer, ordenadas por urgencia
              </p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-40">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Ventana (días)</label>
              <select
                value={days}
                onChange={e => setDays(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="3">3 días</option>
                <option value="7">7 días</option>
                <option value="14">14 días</option>
                <option value="30">30 días</option>
              </select>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => download(`/api/reports/vencimientos?days=${days}&format=xlsx`, 'venc-xlsx')}
              disabled={generating === 'venc-xlsx'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              <Download size={14} />
              {generating === 'venc-xlsx' ? 'Generando...' : 'Excel'}
            </button>
            <button
              onClick={() => download(`/api/reports/vencimientos?days=${days}&format=pdf`, 'venc-pdf')}
              disabled={generating === 'venc-pdf'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              <FileText size={14} />
              {generating === 'venc-pdf' ? 'Generando...' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Reporte por empresa */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Building2 size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-medium text-[var(--text-primary)]">Reporte por empresa</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Resumen de tareas agrupadas por empresa con tasa de cumplimiento
              </p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Empresa</label>
              <select
                value={companyId}
                onChange={e => setCompanyId(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas las empresas (resumen)</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const params = companyId ? `companyId=${companyId}&format=xlsx` : 'format=xlsx';
                download(`/api/reports/empresa?${params}`, 'empresa-xlsx');
              }}
              disabled={generating === 'empresa-xlsx'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              <Download size={14} />
              {generating === 'empresa-xlsx' ? 'Generando...' : 'Excel'}
            </button>
            <button
              onClick={() => {
                const params = companyId ? `companyId=${companyId}&format=pdf` : 'format=pdf';
                download(`/api/reports/empresa?${params}`, 'empresa-pdf');
              }}
              disabled={generating === 'empresa-pdf'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] disabled:opacity-50 transition-colors"
            >
              <FileText size={14} />
              {generating === 'empresa-pdf' ? 'Generando...' : 'PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
