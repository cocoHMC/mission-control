'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mcFetch } from '@/lib/clientApi';

type StatusPayload = { version?: string | null; output?: string };

export function UpdateClient() {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusPayload | null>(null);
  const [channel, setChannel] = React.useState<'stable' | 'beta' | 'dev'>('stable');
  const [tag, setTag] = React.useState('');
  const [noRestart, setNoRestart] = React.useState(false);
  const [runOutput, setRunOutput] = React.useState('');

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/update/status', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load update status');
      setStatus({ version: json?.version ?? null, output: String(json?.output || '') });
    } catch (err: any) {
      setError(err?.message || String(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  async function runUpdate() {
    const extra = tag.trim() ? ` (tag: ${tag.trim()})` : '';
    const confirmMsg = `Run OpenClaw update to channel "${channel}"${extra}? This may take several minutes.`;
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    setError(null);
    setRunOutput('');
    try {
      const res = await mcFetch('/api/openclaw/update/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, tag: tag.trim(), noRestart }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Update failed');
      setRunOutput(String(json?.output || '').trim());
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px,1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Update</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Current CLI</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="font-mono text-sm text-[var(--foreground)]">{status?.version || '—'}</div>
              <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{channel}</Badge>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Channel</div>
            <select
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
              value={channel}
              onChange={(e) => setChannel(e.target.value as any)}
            >
              <option value="stable">stable</option>
              <option value="beta">beta</option>
              <option value="dev">dev</option>
            </select>
            <div className="text-xs text-muted">Stable is recommended unless you need a new feature or fix.</div>
          </div>

          <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Tag (optional)</div>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="dist-tag or version (e.g. latest, 2026.2.3-1)" />
            <div className="text-xs text-muted">One-off install override. Leave empty to use the selected channel defaults.</div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
            <span>Skip restarting gateway after update</span>
            <input type="checkbox" checked={noRestart} onChange={(e) => setNoRestart(e.target.checked)} />
          </label>

          <Button onClick={() => void runUpdate()} disabled={busy}>
            {busy ? 'Updating…' : 'Run update'}
          </Button>

          <div className="text-xs text-muted">
            This runs <span className="font-mono">openclaw update --yes</span> (non-interactive). If you run into issues, use the terminal for full control.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
            {status?.output || (loading ? 'Loading…' : 'No status output.')}
          </pre>

          <div className="text-xs uppercase tracking-[0.2em] text-muted">Last update run</div>
          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
            {runOutput || (busy ? 'Running…' : 'No update run output yet.')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
