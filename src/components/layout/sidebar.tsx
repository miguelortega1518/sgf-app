'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';
import {
  LayoutDashboard, CheckSquare, Users, Building2,
  FolderOpen, Search, LogOut, CalendarDays,
  Bell, ChevronLeft, ChevronRight, FileText, ScrollText,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { SearchDialog } from './search-dialog';

const NAV_ITEMS = [
  { href: '/mi-trabajo', label: 'Mi trabajo', icon: CheckSquare, roles: ['admin', 'miembro', 'observador'] },
  { href: '/mi-equipo', label: 'Mi equipo', icon: Users, roles: ['admin', 'miembro'] },
  { href: '/panorama', label: 'Panorama', icon: LayoutDashboard, roles: ['admin'] },
  { href: '/espacios', label: 'Espacios', icon: FolderOpen, roles: ['admin', 'miembro', 'observador'] },
  { href: '/calendario', label: 'Calendario', icon: CalendarDays, roles: ['admin', 'miembro', 'observador'] },
] as const;

const ADMIN_ITEMS = [
  { href: '/admin/plantillas', label: 'Plantillas', icon: FileText },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/empresas', label: 'Empresas', icon: Building2 },
  { href: '/admin/bitacora', label: 'Bitácora', icon: ScrollText },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setUnreadCount(data.filter((n: { read: boolean }) => !n.read).length);
        }
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter(item =>
    (item.roles as readonly string[]).includes(user.role)
  );

  return (
    <>
      <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-200`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {!collapsed && (
            <Link href="/mi-trabajo" className="font-semibold text-lg text-gray-900">
              SGF
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div className="px-2 pt-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100 w-full transition-colors"
            title={collapsed ? 'Buscar (Ctrl+K)' : undefined}
          >
            <Search size={18} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Buscar...</span>
                <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1 py-0.5 font-mono">Ctrl+K</kbd>
              </>
            )}
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          <ul className="space-y-0.5 px-2">
            {visibleNav.map(item => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} />
                    {!collapsed && item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {user.role === 'admin' && (
            <>
              {!collapsed && (
                <p className="px-5 pt-4 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Administración
                </p>
              )}
              <ul className="space-y-0.5 px-2">
                {ADMIN_ITEMS.map(item => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon size={18} />
                        {!collapsed && item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="border-t border-gray-200 p-2 space-y-0.5">
          <Link
            href="/notificaciones"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100 relative"
          >
            <Bell size={18} />
            {!collapsed && 'Notificaciones'}
            {unreadCount > 0 && (
              <span className="absolute top-1 left-7 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100 w-full"
          >
            <LogOut size={18} />
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
