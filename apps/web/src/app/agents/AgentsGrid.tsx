'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatShortDate } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent } from '@/lib/types';

export function AgentsGrid({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = React.useState<Agent[]>(initialAgents);
  const [form, setForm] = React.useState({
    id: '',
    name: '',
    role: '',
    modelTier: 'mid',
    createWorkspace: true,
  });
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

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
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }, []);

  async function createAgent(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/agents/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: form.id.trim(),
          name: form.name.trim(),
          role: form.role.trim(),
          modelTier: form.modelTier,
          createWorkspace: form.createWorkspace,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create agent');
      if (json.workspaceError) {
        setSuccess(`Created agent ${json.agent?.openclawAgentId || form.id}. Workspace error: ${json.workspaceError}`);
      } else {
        setSuccess(`Created agent ${json.agent?.openclawAgentId || form.id}`);
      }
      setForm((prev) => ({ ...prev, id: '', name: '', role: '' }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Add agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={createAgent} className="space-y-3">
            <Input
              value={form.id}
              onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="Agent ID (e.g. coco)"
            />
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Display name"
            />
            <Input
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              placeholder="Role (optional)"
            />
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {['cheap', 'mid', 'expensive'].map((tier) => (
                <Button
                  key={tier}
                  type="button"
                  size="sm"
                  variant={form.modelTier === tier ? 'default' : 'secondary'}
                  onClick={() => setForm((prev) => ({ ...prev, modelTier: tier }))}
                >
                  {tier}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.createWorkspace}
                onChange={(e) => setForm((prev) => ({ ...prev, createWorkspace: e.target.checked }))}
              />
              Create OpenClaw workspace scaffold
            </label>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? 'Creating...' : 'Create agent'}
            </Button>
          </form>
          {error && <div className="text-xs text-red-600">{error}</div>}
          {success && <div className="text-xs text-emerald-600">{success}</div>}
          <div className="text-xs text-muted">
            New agent IDs map to OpenClaw session keys like <span className="font-mono">agent:&lt;id&gt;:main</span>.
          </div>
        </CardContent>
      </Card>

      {agents.map((agent) => (
        <Card key={agent.id}>
          <CardHeader>
            <CardTitle>{agent.displayName ?? agent.id}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted">{agent.role ?? 'Agent'}</div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{agent.status ?? 'idle'}</Badge>
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
