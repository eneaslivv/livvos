import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { AuroraFab } from '@/components/AuroraFab';

export const metadata: Metadata = {
  title: 'Livv · aurora',
  description: 'Multi-agent layer for Livv',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="app">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
        <AuroraFab />
      </body>
    </html>
  );
}
