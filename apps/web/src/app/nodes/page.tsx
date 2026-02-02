import { AppShell } from '@/components/shell/AppShell';
import { Topbar } from '@/components/shell/Topbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { pbFetch } from '@/lib/pbServer';
import { formatShortDate } from '@/lib/utils';
import type { NodeRecord, PBList } from '@/lib/types';
import { NodeActions } from '@/app/nodes/NodeActions';

export default async function NodesPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  const data = await pbFetch<PBList<NodeRecord>>(`/api/collections/nodes/records?${q.toString()}`);
  const nodes = data.items ?? [];
  const actionsEnabled = String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
  const healthCmds = (process.env.MC_NODE_HEALTH_CMDS || 'uname,uptime,df -h')
    .split(',')
    .map((cmd) => cmd.trim())
    .filter(Boolean);

  return (
    <AppShell>
      <Topbar title="Nodes" subtitle="Pair new devices through headscale + OpenClaw." />
      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Connected nodes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nodes.map((node) => (
              <div key={node.id} className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{node.displayName ?? node.id}</div>
                    <div className="text-xs text-muted">{node.os ?? 'unknown'} / {node.arch ?? 'unknown'}</div>
                  </div>
                  <Badge className="border-none bg-[var(--accent)] text-white">{node.paired ? 'paired' : 'pending'}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">Last seen: {formatShortDate(node.lastSeenAt)}</div>
                <div className="mt-1 text-xs text-muted">Exec policy: {node.execPolicy ?? 'deny'}</div>
              </div>
            ))}
            {!nodes.length && <div className="text-sm text-muted">No nodes paired yet.</div>}
          </CardContent>
        </Card>

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
              <div className="mt-2 text-sm text-[var(--foreground)]">Run: openclaw node install --host &lt;gateway-tailnet-ip&gt; --port 18789 --display-name &lt;name&gt;</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-[0.2em]">Step 3</div>
              <div className="mt-2 text-sm text-[var(--foreground)]">On gateway host: openclaw nodes pending, approve request, set allowlist.</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <NodeActions nodes={nodes} actionsEnabled={actionsEnabled} healthCmds={healthCmds} />
      </div>
    </AppShell>
  );
}
