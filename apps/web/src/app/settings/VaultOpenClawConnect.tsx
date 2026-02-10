'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type PluginInfoResponse =
  | { ok: true; plugin: any }
  | { ok: false; error?: string; raw?: string };

type ConnectResponse =
  | {
      ok: true;
      pluginId: string;
      pluginDir: string;
      missionControlUrl: string;
      agentId: string;
      alreadyConfigured?: boolean;
      tokenPrefix?: string | null;
      token?: string | null;
      restartHint?: string;
    }
  | { ok: false; error: string };

function safeError(json: any, fallback: string) {
  if (json?.error) return String(json.error);
  if (json?.message) return String(json.message);
  return fallback;
}

export function VaultOpenClawConnect({ leadAgentId }: { leadAgentId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [plugin, setPlugin] = React.useState<any | null>(null);
  const [connectRes, setConnectRes] = React.useState<ConnectResponse | null>(null);
  const [origin, setOrigin] = React.useState<string>('');

  React.useEffect(() => {
    try {
      setOrigin(window.location.origin);
    } catch {
      setOrigin('');
    }
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const q = new URLSearchParams({ id: 'mission-control-vault' });
      const res = await mcFetch(`/api/openclaw/plugins/info?${q.toString()}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as PluginInfoResponse | null;
      if (!res.ok || !json || !(json as any).ok) {
        setPlugin(null);
        return;
      }
      setPlugin((json as any).plugin ?? null);
    } catch (err: any) {
      setPlugin(null);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  async function connect() {
    if (
      !window.confirm(
        [
          'Connect OpenClaw to Mission Control Vault?',
          '',
          'This will:',
          '- install + enable the bundled "mission-control-vault" OpenClaw plugin',
          '- generate a new Vault token for your lead agent',
          '- write the token + Mission Control URL into OpenClaw config',
          '',
          'Proceed?',
        ].join('\n')
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setConnectRes(null);
    try {
      const res = await mcFetch('/api/openclaw/plugins/mission-control-vault/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: leadAgentId, missionControlUrl: origin || undefined, rotateToken: false }),
      });
      const json = (await res.json().catch(() => null)) as ConnectResponse | null;
      if (!res.ok || !json || !(json as any).ok) throw new Error(safeError(json, `Connect failed (${res.status})`));
      setConnectRes(json);
      setSuccess(
        (json as any)?.alreadyConfigured
          ? 'Already connected. Repaired plugin wiring.'
          : 'Connected. OpenClaw can now resolve {{vault:HANDLE}} placeholders.'
      );
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const enabled = Boolean(plugin?.enabled);
  const statusLabel = enabled ? 'enabled' : plugin ? 'disabled' : 'not installed';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Vault + OpenClaw</span>
          <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{statusLabel}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted">
        <div>
          Make OpenClaw resolve <span className="font-mono">{'{{vault:HANDLE}}'}</span> placeholders automatically (no plaintext secrets in prompts).
        </div>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {success}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading || busy}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button size="sm" onClick={() => void connect()} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
          <Link href="/openclaw/plugins" className="text-xs underline underline-offset-2">
            OpenClaw plugins
          </Link>
          <Link href={`/agents/${encodeURIComponent(leadAgentId)}/vault`} className="text-xs underline underline-offset-2">
            Vault credentials
          </Link>
        </div>

        {connectRes && connectRes.ok ? (
          <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--foreground)]">Connection details</summary>
            <div className="mt-3 space-y-2">
              <div>
                Plugin: <span className="font-mono">{connectRes.pluginId}</span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <span className="min-w-0 truncate font-mono text-[11px]">{connectRes.pluginDir}</span>
                <CopyButton value={connectRes.pluginDir} />
              </div>
              <div>
                Mission Control URL: <span className="font-mono">{connectRes.missionControlUrl}</span>
              </div>
              <div>
                Lead agent: <span className="font-mono">{connectRes.agentId}</span>
              </div>
              {connectRes.token ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="font-semibold">Vault token (stored in OpenClaw config)</div>
                  <div className="mt-1 text-[11px]">Token is shown once. Keep it private.</div>
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                    <span className="min-w-0 truncate font-mono text-[11px]">{connectRes.token}</span>
                    <CopyButton value={connectRes.token} />
                  </div>
                  {connectRes.tokenPrefix ? (
                    <div className="mt-2 text-[11px]">
                      Prefix: <span className="font-mono">{connectRes.tokenPrefix}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-muted">
                  Vault token already configured (not shown again). To rotate, use Vault tokens for this agent.
                </div>
              )}
              {connectRes.restartHint ? <div className="text-[11px] text-muted">{connectRes.restartHint}</div> : null}
            </div>
          </details>
        ) : null}

        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
          If you run Mission Control on a different machine than OpenClaw, this automatic install cannot work (OpenClaw CLI
          must be available on the Mission Control host). In that case, install the plugin on the gateway host and point it at{' '}
          <span className="font-mono">{origin || '<your-mission-control-url>'}</span>.
        </div>
      </CardContent>
    </Card>
  );
}
