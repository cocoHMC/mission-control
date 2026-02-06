'use client';

import * as React from 'react';
import { mcFetch } from '@/lib/clientApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';

type TailscaleStatus =
  | {
      installed: true;
      running: true;
      backendState: string | null;
      self: { hostName: string | null; dnsName: string | null; tailscaleIps: string[]; online: boolean | null } | null;
      serve: { configured: boolean; error?: string; raw?: unknown } | null;
      error?: undefined;
    }
  | {
      installed: boolean;
      running: boolean;
      backendState: null;
      self: null;
      serve: null;
      error?: string;
    };

export function TailscaleStatusCard({ webPort }: { webPort: string }) {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<TailscaleStatus | null>(null);

  const primaryIp = React.useMemo(() => {
    const ips = status?.self?.tailscaleIps || [];
    return ips.find((ip) => ip.includes('.')) || ips[0] || '';
  }, [status]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await mcFetch('/api/setup/tailscale-status', { cache: 'no-store' });
      const json = (await res.json()) as TailscaleStatus;
      setStatus(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({
        installed: true,
        running: false,
        backendState: null,
        self: null,
        serve: null,
        error: message || 'Failed to fetch tailscale status',
      });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tailnet (Tailscale/Headscale)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Checking…' : 'Check status'}
          </Button>
          {status ? (
            <Badge
              className={
                !status.installed || !status.running
                  ? 'border-none bg-red-600 text-white'
                  : status.backendState === 'Running'
                    ? 'border-none bg-emerald-600 text-white'
                    : 'border-none bg-amber-500 text-black'
              }
            >
              {!status.installed ? 'not installed' : !status.running ? 'not running' : status.backendState || 'unknown'}
            </Badge>
          ) : null}
        </div>

        {status?.self?.tailscaleIps?.length ? (
          <div className="space-y-2">
            <div className="text-xs text-muted">Tailnet IPs</div>
            <div className="font-mono text-xs text-[var(--foreground)]">{status.self.tailscaleIps.join(', ')}</div>
            <CopyButton value={status.self.tailscaleIps.join(', ')} label="Copy IPs" />
          </div>
        ) : null}

        {status?.self?.dnsName ? (
          <div className="space-y-2">
            <div className="text-xs text-muted">MagicDNS</div>
            <div className="font-mono text-xs text-[var(--foreground)]">{status.self.dnsName}</div>
            <CopyButton value={status.self.dnsName} label="Copy name" />
          </div>
        ) : null}

        {status?.self && (status.self.dnsName || primaryIp) ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
            <div className="font-semibold text-[var(--foreground)]">Remote Access</div>
            <div className="mt-2">
              Recommended (tailnet-only): <span className="font-mono">tailscale serve --bg {webPort}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton value={`tailscale serve --bg ${webPort}`} label="Copy serve cmd" />
            </div>
            {status.self.dnsName ? (
              <div className="mt-2">
                URL: <span className="font-mono">https://{status.self.dnsName}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={`https://${status.self.dnsName}`} label="Copy URL" />
                </div>
              </div>
            ) : null}
            {primaryIp ? (
              <div className="mt-2">
                Advanced (bind to tailnet IP): <span className="font-mono">http://{primaryIp}:{webPort}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={`http://${primaryIp}:${webPort}`} label="Copy IP URL" />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {status?.error ? (
          <pre className="whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
            {status.error}
          </pre>
        ) : (
          <div className="text-xs text-muted">
            Tip: Keep services bound to loopback and use <span className="font-mono">tailscale serve</span> for tailnet-only access.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
