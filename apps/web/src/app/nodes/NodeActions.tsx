'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { NodeRecord } from '@/lib/types';

type PendingNode = { requestId?: string; id?: string; name?: string; displayName?: string };

export function NodeActions({
  nodes,
  actionsEnabled,
  healthCmds,
}: {
  nodes: NodeRecord[];
  actionsEnabled: boolean;
  healthCmds: string[];
}) {
  const [pending, setPending] = React.useState<PendingNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [output, setOutput] = React.useState<Record<string, string>>({});

  const loadPending = React.useCallback(async () => {
    if (!actionsEnabled) return;
    setLoading(true);
    try {
      const res = await fetch('/api/nodes/pending');
      const json = await res.json();
      setPending(json.items ?? []);
    } catch {
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [actionsEnabled]);

  React.useEffect(() => {
    void loadPending();
    const id = setInterval(loadPending, 30_000);
    return () => clearInterval(id);
  }, [loadPending]);

  async function approve(requestId?: string) {
    if (!requestId) return;
    await fetch('/api/nodes/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId }),
    });
    await loadPending();
  }

  async function runHealth(nodeId: string, cmd: string) {
    const key = `${nodeId}:${cmd}`;
    setOutput((prev) => ({ ...prev, [key]: 'Running...' }));
    const res = await fetch('/api/nodes/health', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId, cmd }),
    });
    const json = await res.json();
    setOutput((prev) => ({ ...prev, [key]: json.output || json.error || 'No output' }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Pending approvals</div>
          {!actionsEnabled && <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">disabled</Badge>}
        </div>
        <div className="mt-3 space-y-2 text-sm text-muted">
          {loading && actionsEnabled && <div>Loading pending nodes…</div>}
          {!actionsEnabled && <div>Enable MC_NODE_ACTIONS_ENABLED=true to approve nodes.</div>}
          {actionsEnabled && !pending.length && !loading && <div>No pending requests.</div>}
          {pending.map((item) => (
            <div key={item.requestId || item.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <div>{item.displayName || item.name || item.requestId || item.id}</div>
              <Button size="sm" onClick={() => approve(item.requestId || item.id)}>
                Approve
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="text-sm font-semibold">Health checks</div>
        <div className="mt-3 space-y-3">
          {nodes.map((node) => (
            <div key={node.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-sm font-medium">{node.displayName ?? node.nodeId ?? node.id}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {healthCmds.map((cmd) => (
                  <Button
                    key={cmd}
                    size="sm"
                    variant="secondary"
                    disabled={!actionsEnabled}
                    onClick={() => runHealth(node.nodeId ?? node.id, cmd)}
                  >
                    {cmd}
                  </Button>
                ))}
              </div>
              {healthCmds.map((cmd) => {
                const key = `${node.nodeId ?? node.id}:${cmd}`;
                const value = output[key];
                return value ? (
                  <pre
                    key={key}
                    className="mt-2 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-xs text-[var(--foreground)]"
                  >
                    {value}
                  </pre>
                ) : null;
              })}
            </div>
          ))}
          {!nodes.length && <div className="text-sm text-muted">No nodes available.</div>}
        </div>
      </div>
    </div>
  );
}
