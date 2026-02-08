import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { pbFetch } from '@/lib/pbServer';
import { formatShortDate } from '@/lib/utils';
import type { NodeRecord, PBList } from '@/lib/types';
import { NodeActions } from '@/app/nodes/NodeActions';
import { NodeSync } from '@/app/nodes/NodeSync';
import { OpenClawNodesLive } from '@/app/nodes/OpenClawNodesLive';

export default async function NodesPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  const data = await pbFetch<PBList<NodeRecord>>(`/api/collections/nodes/records?${q.toString()}`);
  const nodes = data.items ?? [];
  const actionsEnabled = String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
  const healthCmds = (process.env.MC_NODE_HEALTH_CMDS || 'uname,uptime,df -h')
    .split(',')
    .map((cmd) => cmd.trim())
    .filter(Boolean);
  const gatewayHostHint = process.env.MC_GATEWAY_HOST_HINT || '<gateway-tailnet-ip>';
  const gatewayPortHint = process.env.MC_GATEWAY_PORT_HINT || '18789';
  const installCmd = `openclaw node install --host ${gatewayHostHint} --port ${gatewayPortHint} --display-name "<node-name>"`;

  return (
    <AppShell padding="dense">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Topbar title="Nodes" subtitle="Pair new devices through headscale + OpenClaw." density="compact" />
        <div className="min-h-0 flex-1 overflow-y-auto mc-scroll">
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Connected nodes</CardTitle>
              <NodeSync />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {nodes.map((node) => (
              <div key={node.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{node.displayName ?? node.id}</div>
                    <div className="text-xs text-muted">{node.os ?? 'unknown'} / {node.arch ?? 'unknown'}</div>
                  </div>
                  <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{node.paired ? 'paired' : 'pending'}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">Last seen: {formatShortDate(node.lastSeenAt)}</div>
                <div className="mt-1 text-xs text-muted">Exec policy: {node.execPolicy ?? 'deny'}</div>
              </div>
            ))}
            {!nodes.length && (
              <div className="text-sm text-muted">
                No nodes synced yet. Click <span className="font-medium text-[var(--foreground)]">Sync from OpenClaw</span>.
              </div>
            )}
          </CardContent>
        </Card>

        <OpenClawNodesLive />

        <Card>
          <CardHeader>
            <CardTitle>Pair a new node</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-[0.2em]">Step 1</div>
              <div className="mt-2 text-sm text-[var(--foreground)]">Join headscale tailnet on the node.</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-[0.2em]">Step 2</div>
              <div className="mt-2 text-sm text-[var(--foreground)]">Run on the node:</div>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <div className="min-w-0 truncate font-mono text-xs text-[var(--foreground)]">{installCmd}</div>
                <CopyButton value={installCmd} />
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-[0.2em]">Step 3</div>
              <div className="mt-2 text-sm text-[var(--foreground)]">On gateway host: openclaw nodes pending, approve request, set allowlist.</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CLI reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs">openclaw nodes pending</span>
              <CopyButton value="openclaw nodes pending" />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs">openclaw nodes approve &lt;requestId&gt;</span>
              <CopyButton value="openclaw nodes approve <requestId>" />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs">openclaw nodes list</span>
              <CopyButton value="openclaw nodes list" />
            </div>
            <div className="text-xs">Set allowlists before running remote commands.</div>
          </CardContent>
        </Card>
      </div>

          <div className="mt-6">
            <NodeActions nodes={nodes} actionsEnabled={actionsEnabled} healthCmds={healthCmds} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
