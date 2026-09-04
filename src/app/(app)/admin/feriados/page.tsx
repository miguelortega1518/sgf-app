'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

type Holiday = { date: string; description: string };

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

function formatDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${parseInt(day)} ${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

export default function FeriadosPage() {
  const { toast } = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function fetchHolidays() {
    const res = await fetch('/api/holidays');
    if (res.ok) setHolidays(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchHolidays(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, description }),
    });
    if (res.ok) {
      toast('Feriado agregado', 'success');
      setDate('');
      setDescription('');
      setShowForm(false);
      fetchHolidays();
    } else {
      const data = await res.json();
      toast(data.error || 'Error', 'error');
    }
    setSubmitting(false);
  }

  async function handleDelete(d: string) {
    const res = await fetch('/api/holidays', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: d }),
    });
    if (res.ok) {
      toast('Feriado eliminado', 'success');
      fetchHolidays();
    }
  }

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.filter(h => h.date >= now);
  const past = holidays.filter(h => h.date < now);

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Días feriados</h1>
          <p className="text-sm text-gray-500 mt-1">
            Los feriados se excluyen del cálculo de días hábiles al generar ciclos
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} />
          Agregar feriado
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Descripción</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ej: Día de la Independencia"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              Guardar
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />)}
        </div>
      ) : holidays.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <CalendarDays size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay feriados registrados</p>
          <p className="text-sm text-gray-400 mt-1">Agrega los días feriados del año</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Próximos</h2>
              <div className="space-y-1">
                {upcoming.map(h => (
                  <div key={h.date} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CalendarDays size={16} className="text-blue-500 shrink-0" />
                      <span className="text-sm font-medium text-gray-900">{formatDate(h.date)}</span>
                      <span className="text-sm text-gray-500">{h.description}</span>
                    </div>
                    <button onClick={() => handleDelete(h.date)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <details>
              <summary className="text-sm font-medium text-gray-400 cursor-pointer hover:text-gray-600 mb-2">
                Pasados ({past.length})
              </summary>
              <div className="space-y-1">
                {past.map(h => (
                  <div key={h.date} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                      <CalendarDays size={16} className="text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-700">{formatDate(h.date)}</span>
                      <span className="text-sm text-gray-500">{h.description}</span>
                    </div>
                    <button onClick={() => handleDelete(h.date)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-gray-100">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
