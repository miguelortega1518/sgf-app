'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, X, Pencil, KeyRound, Check } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'miembro' | 'observador';
  active: boolean;
  createdAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  miembro: 'Miembro',
  observador: 'Observador',
};

const ROLE_STYLES: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700',
  miembro: 'bg-blue-50 text-blue-700',
  observador: 'bg-gray-100 text-gray-600',
};

export default function UsuariosPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; role: User['role'] }>({ name: '', email: '', role: 'miembro' });
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: User['role'] }>({ name: '', email: '', password: '', role: 'miembro' });

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const user = await res.json();
      setUsers(prev => [...prev, user]);
      setForm({ name: '', email: '', password: '', role: 'miembro' });
      setShowForm(false);
    } else {
      const data = await res.json();
      toast(data.error || 'Error al crear usuario', 'error');
    }
    setSaving(false);
  }

  async function handleToggleActive(user: User) {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    }
  }

  function startEdit(user: User) {
    setEditingId(user.id);
    setEditForm({ name: user.name, email: user.email, role: user.role });
    setResetId(null);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      setEditingId(null);
    } else {
      const data = await res.json();
      toast(data.error || 'Error al actualizar', 'error');
    }
    setSaving(false);
  }

  async function handleResetPassword(id: string) {
    if (!newPassword || newPassword.length < 8) {
      toast('La contraseña debe tener mínimo 8 caracteres', 'warning');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setResetId(null);
      setNewPassword('');
      toast('Contraseña actualizada');
    } else {
      const data = await res.json();
      toast(data.error || 'Error al cambiar contraseña', 'error');
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
          <h1 className="text-2xl font-semibold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona las personas con acceso al sistema
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setResetId(null); }}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} />
          Nuevo usuario
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Nuevo usuario</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Nombre completo"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              required
              type="password"
              placeholder="Contraseña (mín. 8 caracteres)"
              minLength={8}
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value as User['role'] }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="miembro">Miembro</option>
              <option value="admin">Administrador</option>
              <option value="observador">Observador</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      )}

      {users.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <Users size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-4">
              {editingId === u.id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">Editar usuario</h3>
                    <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      value={editForm.name}
                      onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Nombre"
                    />
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Email"
                    />
                    <select
                      value={editForm.role}
                      onChange={e => setEditForm(p => ({ ...p, role: e.target.value as User['role'] }))}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="miembro">Miembro</option>
                      <option value="admin">Administrador</option>
                      <option value="observador">Observador</option>
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSaveEdit(u.id)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                    >
                      <Check size={14} />
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                        {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{u.name}</h3>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${ROLE_STYLES[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs font-medium px-2 py-1 rounded-full cursor-pointer transition-colors ${
                          u.active
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        {u.active ? 'Activo' : 'Inactivo'}
                      </button>
                      <button
                        onClick={() => startEdit(u)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => { setResetId(resetId === u.id ? null : u.id); setEditingId(null); setNewPassword(''); }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Cambiar contraseña"
                      >
                        <KeyRound size={14} />
                      </button>
                    </div>
                  </div>
                  {resetId === u.id && (
                    <div className="mt-3 flex items-center gap-2 pt-3 border-t border-gray-100">
                      <input
                        type="password"
                        placeholder="Nueva contraseña (mín. 8 caracteres)"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => handleResetPassword(u.id)}
                        disabled={saving}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => { setResetId(null); setNewPassword(''); }}
                        className="text-gray-400 hover:text-gray-600 px-2 py-1.5 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
