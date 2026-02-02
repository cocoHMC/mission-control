'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatShortDate } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent } from '@/lib/types';

export function AgentsGrid({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = React.useState<Agent[]>(initialAgents);

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await fetch('/api/agents?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json();
      setAgents(json.items ?? []);
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
        await pb.collection('agents').subscribe('*', (e: PBRealtimeEvent<Agent>) => {
          if (!e?.record) return;
          setAgents((prev) => {
            if (e.action === 'delete') return prev.filter((agent) => agent.id !== e.record.id);
            const idx = prev.findIndex((agent) => agent.id === e.record.id);
            const next = [...prev];
            if (idx === -1) next.push(e.record);
            else next[idx] = e.record;
            return next;
          });
        });
        unsubscribe = async () => pb.collection('agents').unsubscribe('*');
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
    <div className="grid gap-4 lg:grid-cols-3">
      {agents.map((agent) => (
        <Card key={agent.id}>
          <CardHeader>
            <CardTitle>{agent.displayName ?? agent.id}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted">{agent.role ?? 'Agent'}</div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-none bg-[var(--accent)] text-white">{agent.status ?? 'idle'}</Badge>
              <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{agent.modelTier ?? 'mid'}</Badge>
            </div>
            <div className="text-xs text-muted">Last seen: {formatShortDate(agent.lastSeenAt)}</div>
            <div className="text-xs text-muted">Last worklog: {formatShortDate(agent.lastWorklogAt)}</div>
          </CardContent>
        </Card>
      ))}
      {!agents.length && (
        <Card>
          <CardHeader>
            <CardTitle>No agents yet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted">Run the bootstrap script to seed the lead agent.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
