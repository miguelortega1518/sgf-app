'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileText, FolderOpen, User } from 'lucide-react';

type SearchResults = {
  tasks: { id: string; title: string; status: string; spaceName: string; responsibleName: string }[];
  spaces: { id: string; name: string; type: string; status: string }[];
  persons: { id: string; name: string; email: string; role: string }[];
};

const STATUS_LABELS: Record<string, string> = {
  no_iniciada: 'No iniciada',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
};

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(null);
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) onClose();
        else onClose(); // parent toggles
      }
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  }

  if (!open) return null;

  const hasResults = results && (results.tasks.length + results.spaces.length + results.persons.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="Buscar tareas, espacios, personas..."
            className="flex-1 text-sm outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null); }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-sm text-gray-400">Buscando...</div>
          )}

          {!loading && query.length >= 2 && !hasResults && (
            <div className="p-6 text-center text-sm text-gray-400">Sin resultados</div>
          )}

          {!loading && hasResults && (
            <div className="py-2">
              {results!.tasks.length > 0 && (
                <div>
                  <p className="px-4 py-1.5 text-[11px] font-medium text-gray-400 uppercase">Tareas</p>
                  {results!.tasks.map(t => (
                    <a
                      key={t.id}
                      href={`/tareas/${t.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <FileText size={16} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{t.title}</p>
                        <p className="text-xs text-gray-500">{t.spaceName} &middot; {t.responsibleName} &middot; {STATUS_LABELS[t.status]}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {results!.spaces.length > 0 && (
                <div>
                  <p className="px-4 py-1.5 text-[11px] font-medium text-gray-400 uppercase">Espacios</p>
                  {results!.spaces.map(s => (
                    <a
                      key={s.id}
                      href={`/espacios/${s.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <FolderOpen size={16} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.type} &middot; {s.status}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {results!.persons.length > 0 && (
                <div>
                  <p className="px-4 py-1.5 text-[11px] font-medium text-gray-400 uppercase">Personas</p>
                  {results!.persons.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2"
                    >
                      <User size={16} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.email} &middot; {p.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="p-6 text-center text-sm text-gray-400">
              Escribe al menos 2 caracteres
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
