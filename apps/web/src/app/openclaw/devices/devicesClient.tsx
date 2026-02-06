'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcFetch } from '@/lib/clientApi';
import { CopyButton } from '@/components/ui/copy-button';

type Device = {
  deviceId?: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  remoteIp?: string;
  publicKeyMasked?: string;
  createdAtMs?: number;
  approvedAtMs?: number;
  tokens?: Array<{ role?: string; scopes?: string[]; createdAtMs?: number; lastUsedAtMs?: number }>;
  scopes?: string[];
};

type DeviceList = { pending?: Device[]; paired?: Device[] };

function fmt(ms?: number) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

export function DevicesClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<DeviceList>({});

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/devices/list', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load devices');
      setData({ pending: json?.pending || [], paired: json?.paired || [] });
    } catch (err: any) {
      setError(err?.message || String(err));
      setData({});
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  const pending = Array.isArray(data.pending) ? data.pending : [];
  const paired = Array.isArray(data.paired) ? data.paired : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Pending</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}
          {pending.length ? (
            pending.map((d) => (
              <div key={d.deviceId} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-[var(--foreground)]">{d.displayName || d.deviceId}</div>
                  <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">pending</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">
                  {d.platform || 'unknown'} · {d.clientMode || 'unknown'} · role {d.role || '—'}
                </div>
                {d.deviceId ? (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                    <span className="min-w-0 truncate font-mono text-xs">{d.deviceId}</span>
                    <CopyButton value={d.deviceId} />
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-muted">
                  Requested: {fmt(d.createdAtMs)} {d.remoteIp ? `· ${d.remoteIp}` : ''}
                </div>
                <div className="mt-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                  Approve/reject actions will be added next. For now use OpenClaw: <span className="font-mono">openclaw devices approve &lt;requestId&gt;</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No pending requests.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paired</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {paired.length ? (
            paired.map((d) => (
              <div key={d.deviceId} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-[var(--foreground)]">{d.displayName || d.deviceId}</div>
                  <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{d.role || 'paired'}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted">
                  {d.platform || 'unknown'} · {d.clientMode || 'unknown'} · {d.clientId || 'client'}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  {d.remoteIp ? <span>{d.remoteIp}</span> : null}
                  {d.publicKeyMasked ? <span className="font-mono">pk {d.publicKeyMasked}</span> : null}
                  {Array.isArray(d.scopes) && d.scopes.length ? <span>scopes {d.scopes.length}</span> : null}
                </div>
                <div className="mt-2 text-xs text-muted">
                  Created: {fmt(d.createdAtMs)} · Approved: {fmt(d.approvedAtMs)}
                </div>
                {d.deviceId ? (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                    <span className="min-w-0 truncate font-mono text-xs">{d.deviceId}</span>
                    <CopyButton value={d.deviceId} />
                  </div>
                ) : null}
                {Array.isArray(d.tokens) && d.tokens.length ? (
                  <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">Tokens</div>
                    <div className="mt-2 space-y-2">
                      {d.tokens.slice(0, 6).map((t, idx) => (
                        <div key={`${t.role || ''}-${idx}`} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono">{t.role || 'role'}</span>
                          <span className="text-xs text-muted">last used {fmt(t.lastUsedAtMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No paired devices.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
