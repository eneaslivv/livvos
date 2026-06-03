'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BarChart3, Wallet, Users } from 'lucide-react';

const links = [
  { href: '/',          label: 'Inicio',     icon: Home,       module: 'home' },
  { href: '/pipeline',  label: 'Pipeline',   icon: Users,      module: 'pipeline' },
  { href: '/finance',   label: 'Finance',    icon: Wallet,     module: 'finance' },
  { href: '/growth',    label: 'Growth',     icon: BarChart3,  module: 'growth' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="dot" /> livv · aurora
      </div>
      <nav>
        {links.map(l => {
          const Icon = l.icon;
          const active = pathname === l.href;
          return (
            <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
              <Icon size={16} /> {l.label}
            </Link>
          );
        })}
      </nav>
      <div style={{ marginTop: 32, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        v0.1 · mock mode<br />
        flip <code>AURORA_MODE=live</code> y <code>ANTHROPIC_API_KEY</code> para wiring a Claude.
      </div>
    </aside>
  );
}
