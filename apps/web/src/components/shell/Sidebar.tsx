'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Brain,
  ClipboardCheck,
  Download,
  FolderKanban,
  Gauge,
  Inbox,
  LayoutDashboard,
  Layers3,
  ListTodo,
  MessageSquare,
  Orbit,
  Shield,
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
      { href: '/inbox', label: 'Inbox', icon: Inbox },
      { href: '/workspaces', label: 'Workspaces', icon: Layers3 },
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/usage', label: 'Usage', icon: Gauge },
      { href: '/activity', label: 'Activity', icon: BarChart3 },
      { href: '/docs', label: 'Documents', icon: ClipboardCheck },
      { href: '/workflows', label: 'Workflows', icon: Orbit },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/agents', label: 'Roster', icon: Brain },
      { href: '/sessions', label: 'Sessions', icon: MessageSquare },
      { href: '/nodes', label: 'Nodes', icon: Server },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/openclaw', label: 'OpenClaw', icon: SlidersHorizontal },
      { href: '/ops', label: 'Ops', icon: Shield },
      { href: '/download', label: 'Downloads', icon: Download },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-full flex-col gap-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Mission Control</div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-auto pr-1 mc-scroll">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{section.label}</div>
            <div className="mt-1 space-y-1">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href.endsWith('/') ? item.href : `${item.href}/`));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      active
                        ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                        : 'text-[var(--foreground)]/80 hover:bg-[color:var(--foreground)]/5 hover:text-[var(--foreground)]'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'opacity-100' : 'opacity-75')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

    </aside>
  );
}
