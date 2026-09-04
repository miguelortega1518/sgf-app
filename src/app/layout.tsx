import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/providers/session-provider';
import { ToastProvider } from '@/components/providers/toast-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SGF — Sistema de Gestión Financiera',
  description: 'Gestión de trabajo del departamento de finanzas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('sgf-theme');
              if (t === 'dark') document.documentElement.classList.add('dark');
              else if (t === 'light') document.documentElement.classList.add('light');
            } catch(e){}
          })();
        `}} />
      </head>
      <body className={`${inter.className} h-full bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased`}>
        <SessionProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
