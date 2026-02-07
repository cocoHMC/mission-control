'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { mcFetch } from '@/lib/clientApi';

type OpenClawNodesStatus = {
  ts?: number;
  nodes?: Array<{
    nodeId?: string;
    displayName?: string;
    platform?: string;
    remoteIp?: string;
    caps?: string[];
    commands?: string[];
    paired?: boolean;
    connected?: boolean;
  }>;
};

type PendingNode = { requestId?: string; id?: string; name?: string; displayName?: string };

export function OpenClawNodesLive() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<OpenClawNodesStatus | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<string | null>(null);

  const [pendingLoading, setPendingLoading] = React.useState(false);
  const [pending, setPending] = React.useState<PendingNode[]>([]);
  const [pendingError, setPendingError] = React.useState<string | null>(null);

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [describe, setDescribe] = React.useState<Record<string, any>>({});
  const [renameDraft, setRenameDraft] = React.useState<Record<string, string>>({});
  const [invokeOut, setInvokeOut] = React.useState<Record<string, string>>({});
  const [invokeCmd, setInvokeCmd] = React.useState<Record<string, string>>({});

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      // Use absolute URL to avoid BasicAuth-credentialed document URL issues.
      // See mcFetch for details.
      const res = await mcFetch('/api/openclaw/nodes/status', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load OpenClaw nodes');
      setStatus((json?.status as OpenClawNodesStatus) || null);
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

  async function loadPending() {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await mcFetch('/api/openclaw/nodes/pending', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load pending requests');
      setPending(Array.isArray(json?.pending) ? json.pending : []);
    } catch (err: any) {
      setPending([]);
      setPendingError(err?.message || String(err));
    } finally {
      setPendingLoading(false);
    }
  }

  async function approve(requestId?: string) {
    if (!requestId) return;
    if (!window.confirm(`Approve node pairing request ${requestId}?`)) return;
    setPendingError(null);
    try {
      const res = await mcFetch('/api/openclaw/nodes/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Approve failed');
      await loadPending();
      await refresh();
    } catch (err: any) {
      setPendingError(err?.message || String(err));
    }
  }

  async function reject(requestId?: string) {
    if (!requestId) return;
    if (!window.confirm(`Reject node pairing request ${requestId}?`)) return;
    setPendingError(null);
    try {
      const res = await mcFetch('/api/openclaw/nodes/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Reject failed');
      await loadPending();
      await refresh();
    } catch (err: any) {
      setPendingError(err?.message || String(err));
    }
  }

  async function loadDescribe(node: string) {
    setInvokeOut((prev) => ({ ...prev, [`${node}:describe`]: 'Loading…' }));
    try {
      const q = new URLSearchParams({ node });
      const res = await mcFetch(`/api/openclaw/nodes/describe?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Describe failed');
      setDescribe((prev) => ({ ...prev, [node]: json.describe ?? null }));
      setInvokeOut((prev) => ({ ...prev, [`${node}:describe`]: '' }));
    } catch (err: any) {
      setInvokeOut((prev) => ({ ...prev, [`${node}:describe`]: err?.message || String(err) }));
    }
  }

  async function renameNode(node: string) {
    const name = String(renameDraft[node] || '').trim();
    if (!name) return;
    if (!window.confirm(`Rename node ${node} to "${name}"?`)) return;
    setInvokeOut((prev) => ({ ...prev, [`${node}:rename`]: 'Renaming…' }));
    try {
      const res = await mcFetch('/api/openclaw/nodes/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ node, name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Rename failed');
      setInvokeOut((prev) => ({ ...prev, [`${node}:rename`]: 'OK' }));
      await refresh();
    } catch (err: any) {
      setInvokeOut((prev) => ({ ...prev, [`${node}:rename`]: err?.message || String(err) }));
    }
  }

  async function invokeSystemRun(node: string) {
    const cmd = String(invokeCmd[node] || '').trim();
    if (!cmd) return;
    setInvokeOut((prev) => ({ ...prev, [`${node}:run`]: 'Running…' }));
    try {
      const res = await mcFetch('/api/openclaw/nodes/invoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ node, command: 'system.run', params: { cmd } }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Invoke failed');
      const out = json?.raw ? String(json.raw) : JSON.stringify(json?.result ?? {}, null, 2);
      setInvokeOut((prev) => ({ ...prev, [`${node}:run`]: out || 'OK' }));
    } catch (err: any) {
      setInvokeOut((prev) => ({ ...prev, [`${node}:run`]: err?.message || String(err) }));
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await mcFetch('/api/nodes/sync', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Sync failed');
      setSyncResult(`Synced ${json?.upserted ?? ''}`.trim());
    } catch (err: any) {
      setSyncResult(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const nodes = Array.isArray(status?.nodes) ? status!.nodes! : [];
  const paired = nodes.filter((n) => n?.paired).length;
  const connected = nodes.filter((n) => n?.connected).length;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">OpenClaw</div>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            Nodes: {paired} paired / {connected} connected
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void loadPending()} disabled={pendingLoading}>
            {pendingLoading ? 'Checking…' : 'Pending'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void sync()} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync to Mission Control'}
          </Button>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
      {pendingError ? (
        <div className="mt-2 text-xs text-red-600">
          {pendingError}
          <div className="mt-1 text-[11px] text-muted">Tip: set MC_NODE_ACTIONS_ENABLED=true to approve/rename/invoke from the UI.</div>
        </div>
      ) : null}
      {syncResult ? (
        <div className="mt-2 text-xs text-muted">
          Sync: <span className="text-[var(--foreground)]">{syncResult}</span>
        </div>
      ) : null}

      {pending.length ? (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Pending Pairing</div>
          <div className="mt-2 space-y-2">
            {pending.slice(0, 8).map((p) => {
              const id = p.requestId || p.id || '';
              return (
                <div
                  key={id || p.name || p.displayName}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
                >
                  <div className="min-w-0 truncate font-mono text-[var(--foreground)]">{p.displayName || p.name || id || 'request'}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => approve(id)} disabled={!id}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => reject(id)} disabled={!id}>
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {!nodes.length ? <div className="text-sm text-muted">No nodes reported by OpenClaw.</div> : null}
        {nodes.slice(0, 8).map((n) => (
          <div key={n.nodeId || n.displayName} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[var(--foreground)]">{n.displayName || 'node'}</div>
              <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                {n.connected ? 'connected' : 'offline'}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted">
              {n.platform || 'platform'} {n.remoteIp ? `· ${n.remoteIp}` : ''}
            </div>
            {n.nodeId ? <div className="mt-2 truncate font-mono text-[11px] text-[var(--foreground)]/80">{n.nodeId}</div> : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const id = String(n.nodeId || n.displayName || '').trim();
                  if (!id) return;
                  setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
                  if (!describe[id]) void loadDescribe(id);
                }}
              >
                {expanded[String(n.nodeId || n.displayName || '').trim()] ? 'Hide details' : 'Describe'}
              </Button>
            </div>

            {(() => {
              const id = String(n.nodeId || n.displayName || '').trim();
              if (!id || !expanded[id]) return null;
              const d = describe[id];
              const commands = (Array.isArray(d?.commands) ? d.commands : Array.isArray(n.commands) ? n.commands : []) as string[];
              const canRun = Boolean(n.connected) && (commands.length === 0 || commands.includes('system.run'));
              return (
                <div className="mt-3 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Details</div>
                  {invokeOut[`${id}:describe`] ? (
                    <div className="text-xs text-red-600">{invokeOut[`${id}:describe`]}</div>
                  ) : (
                    <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-[11px] text-[var(--foreground)]">
                      {d ? JSON.stringify(d, null, 2) : 'No data.'}
                    </pre>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">Rename</div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={renameDraft[id] ?? ''}
                          onChange={(e) => setRenameDraft((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder="New display name"
                          className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                        />
                        <Button size="sm" onClick={() => void renameNode(id)} disabled={!String(renameDraft[id] || '').trim()}>
                          Save
                        </Button>
                      </div>
                      {invokeOut[`${id}:rename`] ? <div className="mt-1 text-[11px] text-muted">{invokeOut[`${id}:rename`]}</div> : null}
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">Safe Invoke</div>
                      <div className="mt-2 text-xs text-muted">
                        Runs <span className="font-mono">system.run</span> if supported. OpenClaw approvals/allowlists still apply.
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Textarea
                          value={invokeCmd[id] ?? ''}
                          onChange={(e) => setInvokeCmd((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder='uname -a'
                          className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
                        />
                        <Button size="sm" variant="secondary" onClick={() => void invokeSystemRun(id)} disabled={!canRun || !String(invokeCmd[id] || '').trim()}>
                          Run
                        </Button>
                      </div>
                      {!canRun ? <div className="mt-1 text-[11px] text-muted">Node offline or does not advertise system.run.</div> : null}
                      {invokeOut[`${id}:run`] ? (
                        <pre className="mt-2 max-h-[30vh] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-[11px] text-[var(--foreground)]">
                          {invokeOut[`${id}:run`]}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
