'use client';

import * as React from 'react';
import { mcFetch } from '@/lib/clientApi';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';

type StatusResponse = {
  ok: boolean;
  output?: string;
  error?: string;
};

export function SetupChecklist({
  leadAgentId,
  leadAgentName,
  webUrl,
  pbUrl,
  gatewayUrl,
  gatewayHostHint,
  gatewayPortHint,
}: {
  leadAgentId: string;
  leadAgentName: string;
  webUrl: string;
  pbUrl: string;
  gatewayUrl: string;
  gatewayHostHint: string;
  gatewayPortHint: string;
}) {
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refreshStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await mcFetch('/api/openclaw/status', { cache: 'no-store' });
      const json = (await res.json()) as StatusResponse;
      setStatus(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ ok: false, error: message || 'Failed to fetch status' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshStatus();
    // Only run once on mount to avoid polling.
  }, [refreshStatus]);

  const installCmd = `openclaw node install --host ${gatewayHostHint} --port ${gatewayPortHint} --display-name "<node-name>"`;
  const pendingCmd = 'openclaw nodes pending';
  const approveCmd = 'openclaw nodes approve <requestId>';
  const pingCmd = 'node scripts/openclaw_ping.mjs';
  const devCmd = './scripts/dev.sh';
  const bootstrapCmd = './scripts/bootstrap.sh';

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Getting Started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">1. Verify Services</div>
            <div className="mt-2 text-sm text-[var(--foreground)]">
              Web: <span className="font-mono">{webUrl}</span>
            </div>
            <div className="mt-1 text-sm text-[var(--foreground)]">
              PocketBase: <span className="font-mono">{pbUrl}</span>
            </div>
            <div className="mt-1 text-sm text-[var(--foreground)]">
              OpenClaw: <span className="font-mono">{gatewayUrl}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">
                {status ? (status.ok ? 'openclaw ok' : 'openclaw error') : 'openclaw unknown'}
              </Badge>
              <Button size="sm" variant="secondary" onClick={refreshStatus} disabled={loading}>
                {loading ? 'Checking...' : 'Check OpenClaw'}
              </Button>
            </div>
            {status?.error ? <div className="mt-2 text-xs text-red-600">{status.error}</div> : null}
            {status?.ok && status?.output ? (
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-muted">
                {status.output}
              </pre>
            ) : null}
            <div className="mt-3 text-xs text-muted">
              Tip: If you run Mission Control in Docker, OpenClaw CLI/status checks won&apos;t work unless you mount the
              OpenClaw binary + config into the container. Recommended: run Mission Control on the same host as the
              gateway.
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">2. Bootstrap + Test Wiring</div>
            <div className="mt-2 text-sm text-[var(--foreground)]">
              Lead agent: <span className="font-mono">{leadAgentName}</span> (<span className="font-mono">{leadAgentId}</span>)
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton value={devCmd} label="Copy dev command" />
              <CopyButton value={bootstrapCmd} label="Copy bootstrap command" />
              <CopyButton value={pingCmd} label="Copy ping command" />
            </div>
            <div className="mt-3 text-xs text-muted">
              Bootstrap is idempotent: it creates/patches PocketBase schema and seeds the lead agent.
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link href="/tasks/new" className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                Create a task
              </Link>
              <Link href="/agents" className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                Manage agents
              </Link>
              <Link href="/openclaw" className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                OpenClaw settings
              </Link>
              <Link href="/nodes" className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1">
                Pair nodes
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">3. Add Nodes (Optional)</div>
          <div className="mt-2 text-sm text-[var(--foreground)]">On the node machine:</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{installCmd}</span>
            <CopyButton value={installCmd} />
          </div>
          <div className="mt-3 text-sm text-[var(--foreground)]">On the gateway host:</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{pendingCmd}</span>
            <CopyButton value={pendingCmd} />
            <span className="font-mono text-xs">{approveCmd}</span>
            <CopyButton value={approveCmd} />
          </div>
          <div className="mt-3 text-xs text-muted">
            Use strict allowlists before running commands on nodes.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
