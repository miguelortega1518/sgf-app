'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';

type PersonOption = {
  id: string;
  name: string;
};

export default function NuevoEspacioPage() {
  const router = useRouter();
  const { user } = useSession();
  const [name, setName] = useState('');
  const [type, setType] = useState<'proyecto' | 'continuo'>('proyecto');
  const [objective, setObjective] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then(setPeople);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type,
        objective: objective || undefined,
        targetDate: targetDate || undefined,
        memberIds: selectedMembers,
      }),
    });

    if (res.ok) {
      const space = await res.json();
      router.push(`/espacios/${space.id}`);
    } else {
      const data = await res.json();
      setError(data.error || 'Error al crear el espacio');
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Nuevo espacio</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as 'proyecto' | 'continuo')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="proyecto">Proyecto</option>
            <option value="continuo">Continuo</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Los espacios recurrentes se crean desde plantillas
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Objetivo</label>
          <textarea
            value={objective}
            onChange={e => setObjective(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {type === 'proyecto' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha objetivo</label>
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Miembros</label>
          <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
            {people
              .filter(p => p.id !== user?.id)
              .map(person => (
                <label key={person.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(person.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedMembers([...selectedMembers, person.id]);
                      } else {
                        setSelectedMembers(selectedMembers.filter(id => id !== person.id));
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{person.name}</span>
                </label>
              ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creando...' : 'Crear espacio'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
