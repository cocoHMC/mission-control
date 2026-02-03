'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatShortDate } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { DocumentRecord } from '@/lib/types';

export function DocumentsList({ initialDocs }: { initialDocs: DocumentRecord[] }) {
  const [docs, setDocs] = React.useState<DocumentRecord[]>(initialDocs);

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await fetch('/api/documents?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json();
      setDocs(json.items ?? []);
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
        await pb.collection('documents').subscribe('*', (e: PBRealtimeEvent<DocumentRecord>) => {
          if (!e?.record) return;
          setDocs((prev) => {
            if (e.action === 'delete') return prev.filter((doc) => doc.id !== e.record.id);
            const idx = prev.findIndex((doc) => doc.id === e.record.id);
            const next = [...prev];
            if (idx === -1) next.push(e.record);
            else next[idx] = e.record;
            return next;
          });
        });
        unsubscribe = async () => pb.collection('documents').unsubscribe('*');
      })
      .catch(() => {
        // keep polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {docs.map((doc) => (
        <Card key={doc.id}>
          <CardHeader>
            <CardTitle>{doc.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div>Type: {doc.type}</div>
            <div>Updated: {formatShortDate(doc.updated)}</div>
            {doc.taskId && <div>Task: {doc.taskId}</div>}
          </CardContent>
        </Card>
      ))}
      {!docs.length && (
        <Card>
          <CardHeader>
            <CardTitle>No documents yet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted">Create docs from task detail pages.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
