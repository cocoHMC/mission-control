'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { NodeRecord } from '@/lib/types';
import { mcFetch } from '@/lib/clientApi';

export function NodeActions({
  nodes,
  actionsEnabled,
  healthCmds,
}: {
  nodes: NodeRecord[];
  actionsEnabled: boolean;
  healthCmds: string[];
}) {
  const [output, setOutput] = React.useState<Record<string, string>>({});

  async function runHealth(nodeId: string, cmd: string) {
    const key = `${nodeId}:${cmd}`;
    setOutput((prev) => ({ ...prev, [key]: 'Running...' }));
    const res = await mcFetch('/api/nodes/health', {
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
          <div className="text-sm font-semibold">Health checks (synced nodes)</div>
          {!actionsEnabled && <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">disabled</Badge>}
        </div>
        {!actionsEnabled ? <div className="mt-2 text-xs text-muted">Enable MC_NODE_ACTIONS_ENABLED=true to run remote checks.</div> : null}
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
