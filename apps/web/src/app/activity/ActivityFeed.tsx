'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatShortDate } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Activity } from '@/lib/types';

export function ActivityFeed({ initialItems }: { initialItems: Activity[] }) {
  const [items, setItems] = React.useState<Activity[]>(initialItems);

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await fetch('/api/activity?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.items ?? []);
    }, 30_000);

    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | null = null;
    getPocketBaseClient()
      .then(async (pb) => {
        if (cancelled) return;
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        await pb.collection('activities').subscribe('*', (e: PBRealtimeEvent<Activity>) => {
          if (!e?.record) return;
          setItems((prev) => {
            if (e.action === 'delete') return prev.filter((item) => item.id !== e.record.id);
            const idx = prev.findIndex((item) => item.id === e.record.id);
            const next = [...prev];
            if (idx === -1) next.push(e.record as Activity);
            else next[idx] = e.record as Activity;
            return next.sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));
          });
        });
        unsubscribe = async () => pb.collection('activities').unsubscribe('*');
      })
      .catch(() => {
        // keep polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribe) void unsubscribe();
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live feed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">{item.type}</div>
            <div className="mt-2 text-sm">{item.summary}</div>
            <div className="mt-2 text-xs text-muted">{formatShortDate(item.created)}</div>
          </div>
        ))}
        {!items.length && <div className="text-sm text-muted">No activity yet.</div>}
      </CardContent>
    </Card>
  );
}
