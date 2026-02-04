'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Brain,
  ClipboardCheck,
  LayoutDashboard,
  ListTodo,
  Server,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sections: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: any }>;
}> = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/tasks', label: 'Tasks', icon: ListTodo },
      { href: '/activity', label: 'Activity', icon: BarChart3 },
      { href: '/docs', label: 'Documents', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/agents', label: 'Roster', icon: Brain },
      { href: '/nodes', label: 'Nodes', icon: Server },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/openclaw', label: 'OpenClaw', icon: SlidersHorizontal },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const leadName = process.env.NEXT_PUBLIC_MC_LEAD_AGENT_NAME || process.env.NEXT_PUBLIC_MC_LEAD_AGENT_ID || 'Lead';

  return (
    <aside className="mc-desktop-sidebar flex h-full flex-col">
      <div className="px-4 pt-5">
        <div className="text-xs font-semibold tracking-[0.16em] text-muted">Mission Control</div>
        <div className="mt-1 text-lg font-semibold headline">{leadName}</div>
        <div className="mt-1 text-xs text-muted">Local-first command center</div>
      </div>

      <div className="mt-5 flex-1 overflow-auto px-2 pb-4">
        {sections.map((section) => (
          <div key={section.label} className="mt-4 first:mt-0">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {section.label}
            </div>
            <div className="mt-1 space-y-1">
              {section.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
                      active
                        ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                        : 'text-[var(--foreground)]/80 hover:bg-[color:var(--foreground)]/5 hover:text-[var(--foreground)]'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'opacity-100' : 'opacity-75')} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

