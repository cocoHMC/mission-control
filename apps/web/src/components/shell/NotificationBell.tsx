'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { mcFetch } from '@/lib/clientApi';

type Summary = { unread?: number };

async function getSummary(): Promise<Summary | null> {
  const res = await mcFetch('/api/inbox/summary?deliveredOnly=1', { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export function NotificationBell() {
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const data = await getSummary().catch(() => null);
      if (cancelled || !data) return;
      setUnread(Math.max(0, Number(data.unread || 0)));
    };

    void refresh();
    const id = setInterval(() => void refresh(), 30_000);

    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return (
    <Link
      href="/inbox"
      aria-label={unread ? `Inbox (${unread} unread)` : 'Inbox'}
      title={unread ? `${unread} unread` : 'Inbox'}
      className="no-drag relative inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] p-2"
    >
      <Bell className="h-4 w-4" />
      {unread ? (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--accent-foreground)]">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}

