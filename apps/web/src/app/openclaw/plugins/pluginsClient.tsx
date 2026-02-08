'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcFetch } from '@/lib/clientApi';
import { Input } from '@/components/ui/input';

type PluginRow = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  origin?: string;
  enabled?: boolean;
  status?: string;
  error?: string;
  toolNames?: string[];
  hookNames?: string[];
  channelIds?: string[];
  providerIds?: string[];
  gatewayMethods?: string[];
  cliCommands?: string[];
};

type PluginList = { workspaceDir?: string; plugins?: PluginRow[] };

export function PluginsClient() {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [list, setList] = React.useState<PluginList | null>(null);
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [details, setDetails] = React.useState<any>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/plugins/list', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load plugins');
      setList((json?.plugins as PluginList) || null);
      const first = (json?.plugins?.plugins || [])[0]?.id;
      if (first && !selectedId) setSelectedId(first);
    } catch (err: any) {
      setError(err?.message || String(err));
      setList(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = React.useMemo(() => {
    const items = (list?.plugins || []).filter((p) => p && p.id);
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => {
      const hay = `${p.id || ''} ${p.name || ''} ${p.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [list, query]);

  async function loadDetails(id: string) {
    if (!id) return;
    setDetailsLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ id });
      const res = await mcFetch(`/api/openclaw/plugins/info?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load plugin info');
      setDetails(json?.plugin ?? null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  React.useEffect(() => {
    if (!selectedId) return;
    void loadDetails(selectedId);
  }, [selectedId]);

  async function setEnabled(id: string, enabled: boolean) {
    if (!id) return;
    const action = enabled ? 'enable' : 'disable';
    if (!window.confirm(`${enabled ? 'Enable' : 'Disable'} plugin "${id}"? This updates OpenClaw config.`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch('/api/openclaw/plugins/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Plugin update failed');
      setSuccess(`Plugin ${action}d. Restart OpenClaw if changes do not apply immediately.`);
      await refresh();
      await loadDetails(id);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const selected = rows.find((p) => p.id === selectedId) || null;

  return (
    <div className="grid gap-4 lg:grid-cols-[420px,1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Plugins</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search plugins…" />

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              {success}
            </div>
          ) : null}

          <div className="space-y-2">
            {rows.map((p) => {
              const active = p.id === selectedId;
              const enabled = Boolean(p.enabled);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(String(p.id))}
                  className={[
                    'w-full rounded-2xl border px-3 py-3 text-left transition',
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[color:var(--foreground)]/5',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px] text-[var(--foreground)]/90">{p.id}</div>
                      <div className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{p.name || p.id}</div>
                      {p.description ? <div className="mt-1 line-clamp-2 text-xs text-muted">{p.description}</div> : null}
                    </div>
                    <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                      {enabled ? 'enabled' : 'disabled'}
                    </Badge>
                  </div>
                </button>
              );
            })}
            {!rows.length ? <div className="text-sm text-muted">No plugins found.</div> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Details</span>
            {selected?.id ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={selected.enabled ? 'secondary' : 'default'}
                  onClick={() => void setEnabled(String(selected.id), !selected.enabled)}
                  disabled={busy || loading}
                >
                  {busy ? 'Working…' : selected.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {!selected ? <div className="text-sm text-muted">Select a plugin to see details.</div> : null}

          {selected ? (
            <div className="space-y-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-sm font-semibold text-[var(--foreground)]">{selected.name || selected.id}</div>
                {selected.description ? <div className="mt-1 text-sm text-muted">{selected.description}</div> : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                    version {selected.version || '—'}
                  </Badge>
                  <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                    origin {selected.origin || '—'}
                  </Badge>
                  <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                    {selected.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </div>
                {selected.error ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    {selected.error}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Tools', selected.toolNames],
                  ['Hooks', selected.hookNames],
                  ['Channels', selected.channelIds],
                  ['Providers', selected.providerIds],
                  ['Gateway methods', selected.gatewayMethods],
                  ['CLI commands', selected.cliCommands],
                ].map(([label, items]) => {
                  const list = (items as string[] | undefined) || [];
                  return (
                    <div key={String(label)} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
                      <div className="mt-2 text-xs text-[var(--foreground)]">
                        {list.length ? list.slice(0, 12).join(', ') : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Raw info</div>
                <pre className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)]">
                  {detailsLoading ? 'Loading…' : details ? JSON.stringify(details, null, 2) : 'No details.'}
                </pre>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
