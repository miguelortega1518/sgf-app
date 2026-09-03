'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, FileText, FolderOpen } from 'lucide-react';
import Link from 'next/link';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
  spaceId: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  task_completed: { label: 'Completada', color: 'text-green-700', bg: 'bg-green-50' },
  task_review: { label: 'Revisión', color: 'text-amber-700', bg: 'bg-amber-50' },
  task_blocked: { label: 'Bloqueada', color: 'text-red-700', bg: 'bg-red-50' },
  task_assigned: { label: 'Asignada', color: 'text-blue-700', bg: 'bg-blue-50' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function NotificacionesPage() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.ok ? r.json() : [])
      .then(data => setNotifs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markAsRead = useCallback(async (ids: string[]) => {
    const unreadIds = ids.filter(id => notifs.find(n => n.id === id && !n.read));
    if (unreadIds.length === 0) return;

    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    });
    setNotifs(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, read: true } : n));
  }, [notifs]);

  const markAllRead = useCallback(() => {
    const unreadIds = notifs.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length > 0) markAsRead(unreadIds);
  }, [notifs, markAsRead]);

  const filtered = filter === 'unread' ? notifs.filter(n => !n.read) : notifs;
  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-gray-400" />
          <h1 className="text-xl font-semibold text-gray-900">Notificaciones</h1>
          {unreadCount > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {unreadCount} sin leer
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === 'unread' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Sin leer
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1"
            >
              <CheckCheck size={14} />
              Marcar todas
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bell size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {filter === 'unread' ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const config = TYPE_CONFIG[n.type] || { label: n.type, color: 'text-gray-700', bg: 'bg-gray-50' };
            const href = n.taskId ? `/tareas/${n.taskId}` : n.spaceId ? `/espacios/${n.spaceId}` : null;
            const content = (
              <div
                className={`bg-white rounded-lg border p-4 transition-colors ${
                  n.read ? 'border-gray-200' : 'border-blue-200 bg-blue-50/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 p-1.5 rounded-lg ${config.bg}`}>
                    {n.taskId ? <FileText size={16} className={config.color} /> : <FolderOpen size={16} className={config.color} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                      {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                  </div>
                  {!n.read && (
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); markAsRead([n.id]); }}
                      className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-gray-100"
                      title="Marcar como leída"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              </div>
            );

            if (href) {
              return (
                <Link key={n.id} href={href} onClick={() => !n.read && markAsRead([n.id])} className="block hover:opacity-90">
                  {content}
                </Link>
              );
            }
            return <div key={n.id}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}
