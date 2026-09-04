'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';
import {
  LayoutDashboard, CheckSquare, Users, Building2,
  FolderOpen, Search, LogOut, CalendarDays,
  Bell, ChevronLeft, ChevronRight, FileText, ScrollText, Sun,
  Menu, X, Moon,
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
  { href: '/admin/feriados', label: 'Feriados', icon: Sun },
] as const;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sgf-theme');
    if (saved === 'dark') {
      setDark(true);
      document.documentElement.classList.add('dark');
    } else if (saved === 'light') {
      document.documentElement.classList.add('light');
    }
  }, []);

  const toggle = useCallback(() => {
    setDark(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        localStorage.setItem('sgf-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        localStorage.setItem('sgf-theme', 'light');
      }
      return next;
    });
  }, []);

  return { dark, toggle };
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const isMobile = useIsMobile();
  const { dark, toggle: toggleDark } = useDarkMode();

  const fetchUnreadCount = useCallback(() => {
    fetch('/api/notifications?countOnly=true')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.unreadCount !== undefined) setUnreadCount(data.unreadCount);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    if (isMobile) setMobileOpen(false);
  }, [pathname, fetchUnreadCount, isMobile]);

  useEffect(() => {
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

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

  const showLabels = isMobile ? true : !collapsed;

  const sidebarContent = (
    <aside
      className={`
        ${isMobile ? 'w-64 sidebar-mobile' : collapsed ? 'w-16' : 'w-56'}
        ${isMobile && mobileOpen ? 'open' : ''}
        bg-[var(--bg-sidebar)] border-r border-[var(--border)] flex flex-col h-full transition-all duration-200
      `}
      role="navigation"
      aria-label="Navegación principal"
    >
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
        {showLabels && (
          <Link href="/mi-trabajo" className="font-semibold text-lg text-[var(--text-primary)]">
            SGF
          </Link>
        )}
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      <div className="px-2 pt-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] w-full transition-colors"
          aria-label="Buscar (Ctrl+K)"
        >
          <Search size={18} />
          {showLabels && (
            <>
              <span className="flex-1 text-left">Buscar...</span>
              <kbd className="text-[10px] text-[var(--text-muted)] border border-[var(--border)] rounded px-1 py-0.5 font-mono">Ctrl+K</kbd>
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
                      ? 'bg-[var(--bg-active)] text-blue-600 font-medium dark:text-blue-400'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.icon size={18} aria-hidden="true" />
                  {showLabels && item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {user.role === 'admin' && (
          <>
            {showLabels && (
              <p className="px-5 pt-4 pb-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
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
                          ? 'bg-[var(--bg-active)] text-blue-600 font-medium dark:text-blue-400'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <item.icon size={18} aria-hidden="true" />
                      {showLabels && item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-2 space-y-0.5">
        <button
          onClick={toggleDark}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-full transition-colors"
          aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          <Moon size={18} aria-hidden="true" />
          {showLabels && (dark ? 'Modo claro' : 'Modo oscuro')}
        </button>
        <Link
          href="/notificaciones"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] relative"
        >
          <Bell size={18} aria-hidden="true" />
          {showLabels && 'Notificaciones'}
          {unreadCount > 0 && (
            <span className="absolute top-1 left-7 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center" aria-label={`${unreadCount} sin leer`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
        <Link
          href="/perfil"
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
          aria-label={collapsed && !isMobile ? 'Mi perfil' : undefined}
        >
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center dark:bg-blue-900 dark:text-blue-300" aria-hidden="true">
            {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          {showLabels && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.name}</p>
              <p className="text-xs text-[var(--text-secondary)] truncate">{user.role}</p>
            </div>
          )}
        </Link>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-full"
          aria-label="Cerrar sesión"
        >
          <LogOut size={18} aria-hidden="true" />
          {showLabels && 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-30 p-2 rounded-md bg-[var(--bg-card)] border border-[var(--border)] shadow-sm text-[var(--text-primary)]"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {sidebarContent}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
