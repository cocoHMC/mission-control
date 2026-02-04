'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Brain, ClipboardCheck, LayoutDashboard, ListTodo, Server, Settings, Shield, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/activity', label: 'Activity', icon: BarChart3 },
  { href: '/agents', label: 'Agents', icon: Brain },
  { href: '/nodes', label: 'Nodes', icon: Server },
  { href: '/docs', label: 'Docs', icon: ClipboardCheck },
  { href: '/openclaw', label: 'OpenClaw', icon: SlidersHorizontal },
  { href: '/security', label: 'Security', icon: Shield },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const leadName = process.env.NEXT_PUBLIC_MC_LEAD_AGENT_NAME || process.env.NEXT_PUBLIC_MC_LEAD_AGENT_ID || 'Lead';

  return (
    <aside className="flex h-full flex-col gap-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Mission Control</div>
        <div className="mt-2 text-2xl font-semibold headline">{leadName} Ops</div>
        <div className="mt-1 text-sm text-muted">Tailnet-only command center</div>
      </div>

      <nav className="flex flex-1 flex-col gap-2">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition',
                active
                  ? 'bg-[var(--accent)] text-[var(--background)]'
                  : 'text-[var(--foreground)] hover:bg-[color:var(--foreground)]/5'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-xs text-muted">
        <div className="font-semibold text-[var(--foreground)]">LAN + Headscale</div>
        <div className="mt-1">Gateway runs on lead. UI locked to Tailnet.</div>
      </div>
    </aside>
  );
}
