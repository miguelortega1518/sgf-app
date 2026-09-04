'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FileText, FolderOpen, User } from 'lucide-react';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';

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
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults(null);
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
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
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en SGF"
        className="relative bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-lg mx-4 border border-[var(--border)] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search size={18} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="Buscar tareas, espacios, personas..."
            className="flex-1 text-sm outline-none bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            aria-label="Buscar"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults(null); }} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]" aria-label="Limpiar búsqueda">
              <X size={16} />
            </button>
          )}
          <kbd className="text-[10px] text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-sm text-[var(--text-muted)]" role="status">Buscando...</div>
          )}

          {!loading && query.length >= 2 && !hasResults && (
            <div className="p-6 text-center text-sm text-[var(--text-muted)]">Sin resultados</div>
          )}

          {!loading && hasResults && (
            <div className="py-2">
              {results!.tasks.length > 0 && (
                <div role="group" aria-label="Tareas">
                  <p className="px-4 py-1.5 text-[11px] font-medium text-[var(--text-muted)] uppercase">Tareas</p>
                  {results!.tasks.map(t => (
                    <a
                      key={t.id}
                      href={`/tareas/${t.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <FileText size={16} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{t.title}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{t.spaceName} &middot; {t.responsibleName} &middot; {STATUS_LABELS[t.status]}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {results!.spaces.length > 0 && (
                <div role="group" aria-label="Espacios">
                  <p className="px-4 py-1.5 text-[11px] font-medium text-[var(--text-muted)] uppercase">Espacios</p>
                  {results!.spaces.map(s => (
                    <a
                      key={s.id}
                      href={`/espacios/${s.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <FolderOpen size={16} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{s.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{s.type} &middot; {s.status}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {results!.persons.length > 0 && (
                <div role="group" aria-label="Personas">
                  <p className="px-4 py-1.5 text-[11px] font-medium text-[var(--text-muted)] uppercase">Personas</p>
                  {results!.persons.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2"
                    >
                      <User size={16} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{p.email} &middot; {p.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="p-6 text-center text-sm text-[var(--text-muted)]">
              Escribe al menos 2 caracteres
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
