'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type AllowlistEntry = { pattern?: string; lastUsedAt?: number; id?: string };
type ApprovalsSnapshot = {
  path?: string;
  exists?: boolean;
  hash?: string;
  file?: {
    version?: number;
    defaults?: any;
    agents?: Record<string, { allowlist?: AllowlistEntry[] }>;
  };
};

function formatLastUsed(ms?: number) {
  if (!ms) return 'never';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'unknown';
  }
}

export function ApprovalsClient() {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<ApprovalsSnapshot | null>(null);

  const [agentId, setAgentId] = React.useState<string>('main');
  const [node, setNode] = React.useState<string>('');
  const [pattern, setPattern] = React.useState<string>('');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/approvals', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load approvals');
      setSnapshot((json?.approvals as ApprovalsSnapshot) || null);
      const agents = Object.keys(json?.approvals?.file?.agents || {});
      if (agents.length && !agents.includes(agentId)) setAgentId(agents[0]);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function updateAllowlist(action: 'add' | 'remove', agent: string, patternValue: string, nodeValue?: string) {
    const p = patternValue.trim();
    if (!p) return;
    if (action === 'remove') {
      if (!window.confirm(`Remove allowlist entry "${p}" for agent "${agent}"?`)) return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch('/api/openclaw/approvals/allowlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, agentId: agent, pattern: p, node: nodeValue || '' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Allowlist update failed');
      setSuccess(action === 'add' ? 'Allowlisted.' : 'Removed.');
      setPattern('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const agents = Object.keys(snapshot?.file?.agents || {}).sort((a, b) => a.localeCompare(b));
  if (!agents.includes(agentId)) agents.unshift(agentId);

  const allowlistRows: Array<{ agentId: string; entry: AllowlistEntry }> = [];
  for (const [aid, val] of Object.entries(snapshot?.file?.agents || {})) {
    for (const e of val.allowlist || []) allowlistRows.push({ agentId: aid, entry: e });
  }
  allowlistRows.sort((a, b) => (b.entry.lastUsedAt || 0) - (a.entry.lastUsedAt || 0));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Allowlist</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Add entry</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted">Agent</div>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                >
                  <option value="*">* (all agents)</option>
                  {agents.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted">Node (optional)</div>
                <Input value={node} onChange={(e) => setNode(e.target.value)} placeholder="node id / name / IP" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs text-muted">Pattern</div>
                <Input
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="/usr/bin/uname or ~/Projects/**/bin/rg"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void updateAllowlist('add', agentId || '*', pattern, node)}
                disabled={busy || !pattern.trim()}
              >
                Add
              </Button>
              <div className="text-xs text-muted">This updates OpenClaw exec approvals. No LLM calls are made.</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Current entries</div>
            {allowlistRows.length ? (
              <div className="space-y-2">
                {allowlistRows.map((row, idx) => (
                  <div
                    key={`${row.agentId}-${row.entry.pattern}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{row.agentId}</Badge>
                        <span className="truncate font-mono text-xs text-[var(--foreground)]">{row.entry.pattern}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted">Last used: {formatLastUsed(row.entry.lastUsedAt)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CopyButton value={String(row.entry.pattern || '')} />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void updateAllowlist('remove', row.agentId, String(row.entry.pattern || ''))}
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
                No allowlist entries yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <div>
            File: <span className="font-mono text-xs text-[var(--foreground)]">{snapshot?.path || '—'}</span>
          </div>
          <div>
            Hash: <span className="font-mono text-xs text-[var(--foreground)]">{snapshot?.hash || '—'}</span>
          </div>
          <div>
            Version: <span className="font-mono text-xs text-[var(--foreground)]">{snapshot?.file?.version ?? '—'}</span>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
            Keep allowlists tight. Treat every entry as remote code execution.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
