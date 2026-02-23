'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCheck, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { NotificationRecord } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';

type InboxClientProps = {
  initialItems: NotificationRecord[];
};

function isRead(item: NotificationRecord) {
  return Boolean(String(item.readAt || '').trim());
}

function safeDate(item: NotificationRecord) {
  return item.updated || item.created || item.deliveredAt || '';
}

export function InboxClient({ initialItems }: InboxClientProps) {
  const [items, setItems] = React.useState<NotificationRecord[]>(initialItems || []);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const visibleItems = React.useMemo(
    () => (unreadOnly ? items.filter((it) => !isRead(it)) : items),
    [items, unreadOnly]
  );

  const unreadCount = React.useMemo(() => items.filter((it) => !isRead(it)).length, [items]);

  async function refresh() {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: '1',
        perPage: '200',
        delivered: 'true',
      });
      if (unreadOnly) q.set('unread', 'true');
      const res = await mcFetch(`/api/inbox?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) return;
      setItems(Array.isArray(json?.items) ? (json.items as NotificationRecord[]) : []);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(ids: string[], read: boolean) {
    if (!ids.length) return;
    await mcFetch('/api/inbox/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, read }),
    });

    setItems((prev) =>
      prev.map((item) =>
        ids.includes(item.id)
          ? {
              ...item,
              readAt: read ? new Date().toISOString() : '',
            }
          : item
      )
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            {unreadCount} unread
          </Badge>
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium"
          >
            <Filter className="h-3.5 w-3.5" />
            {unreadOnly ? 'Unread only' : 'All notifications'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void markRead(items.filter((it) => !isRead(it)).map((it) => it.id), true)}
            disabled={!unreadCount}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto mc-scroll">
        <div className="space-y-2 pr-1">
          {visibleItems.map((item) => {
            const read = isRead(item);
            const href = item.url || (item.taskId ? `/tasks/${encodeURIComponent(item.taskId)}` : '/tasks');
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 uppercase">
                        {item.kind || 'generic'}
                      </span>
                      <span className="font-mono">@{item.toAgentId || 'agent'}</span>
                      {safeDate(item) ? <span>{formatShortDate(safeDate(item))}</span> : null}
                    </div>
                    <div className="mt-2 text-sm font-medium text-[var(--foreground)]">
                      {item.title || item.content}
                    </div>
                    {item.title && item.content && item.content !== item.title ? (
                      <div className="mt-1 text-sm text-muted">{item.content}</div>
                    ) : null}
                    {item.taskId ? (
                      <div className="mt-2 text-xs text-muted">
                        Task: <span className="font-mono">{item.taskId}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {!read ? (
                      <Badge className="border-none bg-[var(--accent)] text-[var(--accent-foreground)]">unread</Badge>
                    ) : (
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">read</Badge>
                    )}
                    <Link
                      href={href}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium"
                    >
                      Open
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void markRead([item.id], !read)}
                    >
                      {read ? 'Mark unread' : 'Mark read'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {!visibleItems.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-muted">
              {unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

