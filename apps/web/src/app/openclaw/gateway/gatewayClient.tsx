'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type GatewayStatus = any;

function isTruthy(v: string | undefined) {
  const s = String(v || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

export function GatewayClient() {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<GatewayStatus | null>(null);
  const [probe, setProbe] = React.useState(false);
  const [deep, setDeep] = React.useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const q = new URLSearchParams({ probe: probe ? '1' : '0', deep: deep ? '1' : '0' });
      const res = await mcFetch(`/api/openclaw/gateway/status?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load gateway status');
      setStatus(json?.status ?? null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe, deep]);

  async function doAction(action: 'start' | 'stop' | 'restart') {
    const msg =
      action === 'stop'
        ? 'Stop the OpenClaw gateway service?'
        : action === 'restart'
          ? 'Restart the OpenClaw gateway service?'
          : 'Start the OpenClaw gateway service?';
    if (!window.confirm(msg)) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch('/api/openclaw/gateway/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed to ${action} gateway`);
      setSuccess(`${action} OK`);
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const service = status?.service || null;
  const runtime = service?.runtime || {};
  const gateway = status?.gateway || {};
  const extraServices = Array.isArray(status?.extraServices) ? status.extraServices : [];
  const listeners = Array.isArray(status?.port?.listeners) ? status.port.listeners : [];

  const bindHost = String(gateway?.bindHost || '');
  const port = gateway?.port;
  const wsUrl = String(gateway?.probeUrl || '');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            {runtime?.status ? `Service: ${runtime.status}` : 'Service'}
          </Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            {gateway?.bindMode ? `Bind: ${gateway.bindMode}` : 'Bind'}
          </Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            {bindHost && port ? `${bindHost}:${port}` : 'Host'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={probe} onChange={(e) => setProbe(e.target.checked)} />
            Probe (slower)
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            Deep scan
          </label>
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Status</div>
                <div className="mt-2 text-sm text-[var(--foreground)]">{runtime?.status || '—'}</div>
                <div className="mt-1 text-xs text-muted">
                  PID: <span className="font-mono text-[var(--foreground)]">{runtime?.pid ?? '—'}</span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  State: <span className="font-mono text-[var(--foreground)]">{runtime?.state ?? '—'}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Gateway</div>
                <div className="mt-2 text-xs text-muted">
                  Bind mode: <span className="font-mono text-[var(--foreground)]">{gateway?.bindMode || '—'}</span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  Host: <span className="font-mono text-[var(--foreground)]">{bindHost || '—'}</span>
                </div>
                <div className="mt-1 text-xs text-muted">
                  Port: <span className="font-mono text-[var(--foreground)]">{port ?? '—'}</span>
                </div>
              </div>
            </div>

            {wsUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                <span className="min-w-0 truncate font-mono text-[var(--foreground)]">{wsUrl}</span>
                <CopyButton value={wsUrl} />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void doAction('start')} disabled={busy}>
                Start
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void doAction('stop')} disabled={busy}>
                Stop
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void doAction('restart')} disabled={busy}>
                Restart
              </Button>
            </div>

            {listeners.length ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Port listeners</div>
                <div className="mt-2 space-y-2">
                  {listeners.slice(0, 6).map((l: any, idx: number) => (
                    <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{l.address || 'addr'}</span>
                        <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                          pid {l.pid ?? '—'}
                        </Badge>
                      </div>
                      <div className="mt-1 text-muted">{l.commandLine || l.command || ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
              Keep the gateway bound to <span className="font-mono">loopback</span> or <span className="font-mono">tailnet</span>.
              If you bind to LAN, ensure auth is enabled and firewall rules are correct.
            </div>

            {extraServices.length ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Other services</div>
                <div className="mt-2 space-y-2">
                  {extraServices.slice(0, 6).map((s: any, idx: number) => (
                    <div key={idx} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                      <div className="font-mono">{s.label || 'service'}</div>
                      {s.detail ? <div className="mt-1 text-muted">{s.detail}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                No extra services detected.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Raw JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
              {status ? JSON.stringify(status, null, 2) : loading ? 'Loading…' : 'No data.'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
