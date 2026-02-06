'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mcFetch } from '@/lib/clientApi';

type Snapshot = {
  gateway: {
    port: number | null;
    bind: string | null;
    authMode: string | null;
    tailscaleMode: string | null;
    tailscaleResetOnExit: boolean | null;
  };
  tools: {
    profile: string | null;
  };
  session: {
    maxPingPongTurns: number | null;
  };
};

type ApplyResult = {
  ok: boolean;
  results?: Array<{ path: string; ok: boolean; error?: string }>;
  restartHint?: string;
  error?: string;
};

export function ConfigureClient() {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [result, setResult] = React.useState<ApplyResult | null>(null);

  const [port, setPort] = React.useState('');
  const [bind, setBind] = React.useState('tailnet');
  const [authMode, setAuthMode] = React.useState('token');
  const [authToken, setAuthToken] = React.useState('');
  const [authPassword, setAuthPassword] = React.useState('');
  const [tailscaleMode, setTailscaleMode] = React.useState('off');
  const [tailscaleResetOnExit, setTailscaleResetOnExit] = React.useState(false);
  const [toolsProfile, setToolsProfile] = React.useState('full');
  const [maxPingPong, setMaxPingPong] = React.useState('0');

  async function load() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await mcFetch('/api/openclaw/config/guided', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load settings');
      const snap = (json?.snapshot as Snapshot) || null;
      setSnapshot(snap);
      setPort(snap?.gateway?.port != null ? String(snap.gateway.port) : '');
      setBind(snap?.gateway?.bind || 'tailnet');
      setAuthMode(snap?.gateway?.authMode || 'token');
      setTailscaleMode(snap?.gateway?.tailscaleMode || 'off');
      setTailscaleResetOnExit(Boolean(snap?.gateway?.tailscaleResetOnExit));
      setToolsProfile(snap?.tools?.profile || 'full');
      setMaxPingPong(snap?.session?.maxPingPongTurns != null ? String(snap.session.maxPingPongTurns) : '0');
      // Never prefill secrets.
      setAuthToken('');
      setAuthPassword('');
    } catch (err: any) {
      setError(err?.message || String(err));
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const body: any = {
        gateway: {
          port: port.trim() ? Number(port) : undefined,
          bind: bind.trim() || undefined,
          authMode: authMode.trim() || undefined,
          tailscaleMode: tailscaleMode.trim() || undefined,
          tailscaleResetOnExit,
        },
        tools: { profile: toolsProfile.trim() || undefined },
        session: { maxPingPongTurns: maxPingPong.trim() ? Number(maxPingPong) : undefined },
      };
      if (authToken.trim()) body.gateway.authToken = authToken.trim();
      if (authPassword.trim()) body.gateway.authPassword = authPassword.trim();

      const res = await mcFetch('/api/openclaw/config/guided', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Save failed');
      setResult(json as ApplyResult);
      await load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  const portNum = port.trim() ? Number(port) : NaN;
  const portBad = port.trim() !== '' && (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Guided</Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            Secrets: <span className="ml-1">never shown</span>
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Reload'}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || loading || portBad}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {result?.restartHint ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
          <div className="font-medium text-[var(--foreground)]">Restart required</div>
          <div className="mt-1">{result.restartHint}</div>
          <div className="mt-2 text-xs">
            Advanced JSON editor: <Link className="underline" href="/openclaw/config">/openclaw/config</Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gateway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Port</div>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  inputMode="numeric"
                  placeholder="18789"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
                {portBad ? <div className="mt-1 text-xs text-red-600">Port must be 1-65535.</div> : null}
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Bind</div>
                <select
                  value={bind}
                  onChange={(e) => setBind(e.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                >
                  {['loopback', 'lan', 'tailnet', 'auto', 'custom'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Auth mode</div>
                <select
                  value={authMode}
                  onChange={(e) => setAuthMode(e.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                >
                  {['token', 'password'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{authMode === 'password' ? 'New password' : 'New token'}</div>
                <input
                  value={authMode === 'password' ? authPassword : authToken}
                  onChange={(e) => (authMode === 'password' ? setAuthPassword(e.target.value) : setAuthToken(e.target.value))}
                  placeholder="Leave blank to keep unchanged"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              Tip: prefer <span className="font-mono">loopback</span> or <span className="font-mono">tailnet</span> binds. If you bind to LAN, ensure auth + firewall rules are correct.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tailscale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Exposure mode</div>
                <select
                  value={tailscaleMode}
                  onChange={(e) => setTailscaleMode(e.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                >
                  {['off', 'serve', 'funnel'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={tailscaleResetOnExit}
                    onChange={(e) => setTailscaleResetOnExit(Boolean(e.target.checked))}
                  />
                  Reset on exit
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              If you use headscale, <span className="font-mono">bind=tailnet</span> is often simpler than Serve/Funnel.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tool Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Tools profile</div>
                <input
                  value={toolsProfile}
                  onChange={(e) => setToolsProfile(e.target.value)}
                  placeholder="full"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Agent-to-agent ping pong</div>
                <input
                  value={maxPingPong}
                  onChange={(e) => setMaxPingPong(e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              Keep ping pong at <span className="font-mono">0</span> to prevent agent-to-agent loops.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apply Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            {result?.results?.length ? (
              <div className="space-y-2">
                {result.results.map((r) => (
                  <div
                    key={r.path}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-[var(--foreground)]">{r.path}</span>
                    <span className={r.ok ? 'text-emerald-700' : 'text-red-700'}>{r.ok ? 'ok' : 'error'}</span>
                    {!r.ok && r.error ? <span className="w-full text-[11px] text-red-700">{r.error}</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted">No apply results yet.</div>
            )}
            {snapshot ? (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                Loaded: bind=<span className="font-mono">{snapshot.gateway.bind ?? '—'}</span> port=
                <span className="font-mono">{snapshot.gateway.port ?? '—'}</span> tailscale=
                <span className="font-mono">{snapshot.gateway.tailscaleMode ?? '—'}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
