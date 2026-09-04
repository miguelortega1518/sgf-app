'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/hooks/use-session';
import { Sidebar } from '@/components/layout/sidebar';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-full flex bg-[var(--bg-primary)]">
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>
      <Sidebar />
      <main id="main-content" className="flex-1 overflow-y-auto pl-0 md:pl-0" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
