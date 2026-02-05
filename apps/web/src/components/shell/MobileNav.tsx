'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Brain, ClipboardCheck, LayoutDashboard, ListTodo, Server, Settings, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/activity', label: 'Activity', icon: BarChart3 },
  { href: '/agents', label: 'Agents', icon: Brain },
  { href: '/nodes', label: 'Nodes', icon: Server },
  { href: '/docs', label: 'Docs', icon: ClipboardCheck },
  { href: '/openclaw', label: 'OpenClaw', icon: SlidersHorizontal },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const STORAGE_KEY = 'mc_mobile_nav_scroll_left';
  const STORAGE_ACTIVE = 'mc_mobile_nav_active_href';

  // Restore the last scroll position so "far right" items (like Settings) don't
  // jump back off-screen after navigation.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const n = Number(raw);
      if (Number.isFinite(n)) el.scrollLeft = n;
    } catch {
      // ignore
    }
  }, []);

  // Keep the active tab visible after navigation (no disappearing highlight).
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLAnchorElement>(`a[data-mc-nav-href="${pathname}"]`);
    if (!active) return;

    // If already visible, don't nudge scroll.
    const c = el.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    const fullyVisible = r.left >= c.left + 8 && r.right <= c.right - 8;
    if (fullyVisible) return;

    active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  return (
    <nav
      ref={ref}
      className="scrollbar-none flex items-center gap-2 overflow-x-auto px-1"
      onScroll={(e) => {
        try {
          sessionStorage.setItem(STORAGE_KEY, String(e.currentTarget.scrollLeft));
        } catch {
          // ignore
        }
      }}
    >
      {nav.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-mc-nav-href={item.href}
            onClick={() => {
              // Persist scroll position immediately on click (before route transition),
              // so the active tab doesn't "jump away" after navigation.
              try {
                const el = ref.current;
                if (el) sessionStorage.setItem(STORAGE_KEY, String(el.scrollLeft));
                sessionStorage.setItem(STORAGE_ACTIVE, item.href);
              } catch {
                // ignore
              }
            }}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-medium whitespace-nowrap transition',
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
  );
}
