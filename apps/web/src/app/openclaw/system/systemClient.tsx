'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcFetch } from '@/lib/clientApi';

type PresenceRow = {
  host?: string;
  ip?: string;
  version?: string;
  platform?: string;
  deviceFamily?: string;
  mode?: string;
  reason?: string;
  text?: string;
  ts?: number;
};

type HeartbeatLast = { ts?: number; status?: string; reason?: string; durationMs?: number } | Record<string, unknown>;

function fmtTime(ms?: number) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  } catch {
    return '';
  }
}

export function SystemClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [presence, setPresence] = React.useState<PresenceRow[]>([]);
  const [last, setLast] = React.useState<HeartbeatLast | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const [pRes, hbRes] = await Promise.all([
        mcFetch('/api/openclaw/system/presence', { cache: 'no-store' }),
        mcFetch('/api/openclaw/system/heartbeat', { cache: 'no-store' }),
      ]);
      const pJson = await pRes.json().catch(() => null);
      if (!pRes.ok) throw new Error(pJson?.error || 'Failed to load presence');
      setPresence(Array.isArray(pJson?.presence) ? pJson.presence : []);

      const hbJson = await hbRes.json().catch(() => null);
      if (!hbRes.ok) throw new Error(hbJson?.error || 'Failed to load heartbeat');
      setLast((hbJson?.last as HeartbeatLast) || null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setPresence([]);
      setLast(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  async function setHeartbeat(action: 'enable' | 'disable') {
    if (
      action === 'enable' &&
      !window.confirm(
        'Enable heartbeats? This can wake agents periodically and increase token usage depending on your setup.'
      )
    ) {
      return;
    }
    if (action === 'disable' && !window.confirm('Disable heartbeats?')) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await mcFetch('/api/openclaw/system/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed to ${action} heartbeats`);
      setResult(`${action} OK`);
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const lastTs = (last as any)?.ts as number | undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Presence</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}
          {presence.length ? (
            <div className="space-y-2">
              {presence.map((p, idx) => (
                <div
                  key={`${p.host || p.ip || 'presence'}-${idx}`}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[var(--foreground)]">{p.host || 'host'}</div>
                    <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{p.mode || 'mode'}</Badge>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-muted">
                    <div>IP: {p.ip || '—'}</div>
                    <div>Platform: {p.platform || '—'}</div>
                    <div>Device: {p.deviceFamily || '—'}</div>
                    <div>Seen: {fmtTime(p.ts)}</div>
                  </div>
                  {p.text ? <div className="mt-2 text-xs text-muted">{p.text}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">No presence entries returned.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Heartbeat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Last event</div>
            <div className="mt-2 grid gap-2 text-xs">
              <div>
                Status: <span className="font-mono text-[var(--foreground)]">{String((last as any)?.status || '—')}</span>
              </div>
              <div>
                Reason: <span className="font-mono text-[var(--foreground)]">{String((last as any)?.reason || '—')}</span>
              </div>
              <div>
                Time: <span className="font-mono text-[var(--foreground)]">{lastTs ? fmtTime(lastTs) : '—'}</span>
              </div>
              <div>
                Duration:{' '}
                <span className="font-mono text-[var(--foreground)]">{String((last as any)?.durationMs ?? '—')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void setHeartbeat('enable')} disabled={busy}>
              Enable
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void setHeartbeat('disable')} disabled={busy}>
              Disable
            </Button>
            {result ? <Badge className="border-none bg-emerald-600 text-white">{result}</Badge> : null}
          </div>

          <div className="text-xs text-muted">
            Heartbeats are optional. Mission Control is push-based: it notifies agents only for assignments, mentions, nudges, and escalations.
            Enable heartbeats only if you intentionally want periodic wakeups.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
