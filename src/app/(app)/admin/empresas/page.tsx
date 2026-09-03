'use client';

import { useState, useEffect } from 'react';
import { Building2, Plus, X, Pencil, Check } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

type Company = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
};

export default function EmpresasPage() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(setCompanies)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const company = await res.json();
      setCompanies(prev => [...prev, company]);
      setName('');
      setShowForm(false);
    } else {
      const data = await res.json();
      toast(data.error || 'Error al crear empresa', 'error');
    }
    setSaving(false);
  }

  async function handleToggleActive(company: Company) {
    const res = await fetch(`/api/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !company.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  }

  function startEdit(company: Company) {
    setEditingId(company.id);
    setEditName(company.name);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditingId(null);
    } else {
      const data = await res.json();
      toast(data.error || 'Error al actualizar', 'error');
    }
    setSaving(false);
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
          <h1 className="text-2xl font-semibold text-gray-900">Empresas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona las empresas del grupo
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} />
          Nueva empresa
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Nueva empresa</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <input
            required
            placeholder="Nombre de la empresa"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear empresa'}
            </button>
          </div>
        </form>
      )}

      {companies.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay empresas registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Building2 size={18} className="text-blue-600" />
                  </div>
                  {editingId === c.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit(c.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(c.id)}
                        disabled={saving}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                        title="Guardar"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                        title="Cancelar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <h3 className="font-medium text-gray-900">{c.name}</h3>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(c)}
                    className={`text-xs font-medium px-2 py-1 rounded-full cursor-pointer transition-colors ${
                      c.active
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                  >
                    {c.active ? 'Activa' : 'Inactiva'}
                  </button>
                  {editingId !== c.id && (
                    <button
                      onClick={() => startEdit(c)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      title="Editar nombre"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
