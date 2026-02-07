'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcFetch } from '@/lib/clientApi';

type ChannelsList = {
  chat?: Record<string, string[]>;
  auth?: Array<{ id?: string; provider?: string; type?: string; isExternal?: boolean }>;
  usage?: {
    updatedAt?: number;
    providers?: Array<{
      provider?: string;
      displayName?: string;
      windows?: Array<{ label?: string; usedPercent?: number; resetAt?: number }>;
      plan?: string;
    }>;
  };
};

type ChannelsStatus = {
  ts?: number;
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channels?: Record<
    string,
    { configured?: boolean; running?: boolean; lastError?: string | null; lastStartAt?: number; lastStopAt?: number | null }
  >;
  channelAccounts?: Record<
    string,
    Array<{
      accountId?: string;
      enabled?: boolean;
      configured?: boolean;
      running?: boolean;
      lastError?: string | null;
      lastInboundAt?: number | null;
      lastOutboundAt?: number | null;
    }>
  >;
};

function fmtTime(ms?: number | null) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  } catch {
    return '';
  }
}

export function ChannelsClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [list, setList] = React.useState<ChannelsList | null>(null);
  const [status, setStatus] = React.useState<ChannelsStatus | null>(null);
  const [probe, setProbe] = React.useState(false);

  const [addChannel, setAddChannel] = React.useState('');
  const [addAccount, setAddAccount] = React.useState('');
  const [addName, setAddName] = React.useState('');
  const [addToken, setAddToken] = React.useState('');
  const [addBotToken, setAddBotToken] = React.useState('');
  const [addAppToken, setAddAppToken] = React.useState('');
  const [addCliPath, setAddCliPath] = React.useState('');
  const [addDbPath, setAddDbPath] = React.useState('');
  const [addService, setAddService] = React.useState('');
  const [addRegion, setAddRegion] = React.useState('');
  const [addAuthDir, setAddAuthDir] = React.useState('');
  const [addHomeserver, setAddHomeserver] = React.useState('');
  const [addUserId, setAddUserId] = React.useState('');
  const [addAccessToken, setAddAccessToken] = React.useState('');
  const [addPassword, setAddPassword] = React.useState('');
  const [addDeviceName, setAddDeviceName] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [addResult, setAddResult] = React.useState<string | null>(null);

  const [actionBusy, setActionBusy] = React.useState(false);
  const [actionOutput, setActionOutput] = React.useState<string | null>(null);

  const [capChannel, setCapChannel] = React.useState('');
  const [capAccount, setCapAccount] = React.useState('');
  const [capTarget, setCapTarget] = React.useState('');
  const [capabilities, setCapabilities] = React.useState<any>(null);
  const [capLoading, setCapLoading] = React.useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statusRes] = await Promise.all([
        mcFetch('/api/openclaw/channels/list', { cache: 'no-store' }),
        mcFetch(`/api/openclaw/channels/status?probe=${probe ? '1' : '0'}`, { cache: 'no-store' }),
      ]);
      const listJson = await listRes.json().catch(() => null);
      if (!listRes.ok) throw new Error(listJson?.error || 'Failed to load channels list');
      setList((listJson?.channels as ChannelsList) || null);

      const statusJson = await statusRes.json().catch(() => null);
      if (!statusRes.ok) throw new Error(statusJson?.error || 'Failed to load channel status');
      setStatus((statusJson?.status as ChannelsStatus) || null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setList(null);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe]);

  const channelIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const k of Object.keys(list?.chat || {})) ids.add(k);
    for (const k of Object.keys(status?.channels || {})) ids.add(k);
    for (const k of Object.keys(status?.channelAccounts || {})) ids.add(k);
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [list, status]);

  const channelLabel = (id: string) => {
    return status?.channelLabels?.[id] || id;
  };

  async function addOrUpdate() {
    const channel = addChannel.trim();
    if (!channel) return;
    setAdding(true);
    setError(null);
    setAddResult(null);
    try {
      const res = await mcFetch('/api/openclaw/channels/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel,
          account: addAccount.trim() || undefined,
          name: addName.trim() || undefined,
          token: addToken.trim() || undefined,
          botToken: addBotToken.trim() || undefined,
          appToken: addAppToken.trim() || undefined,
          cliPath: addCliPath.trim() || undefined,
          dbPath: addDbPath.trim() || undefined,
          service: addService.trim() || undefined,
          region: addRegion.trim() || undefined,
          authDir: addAuthDir.trim() || undefined,
          homeserver: addHomeserver.trim() || undefined,
          userId: addUserId.trim() || undefined,
          accessToken: addAccessToken.trim() || undefined,
          password: addPassword.trim() || undefined,
          deviceName: addDeviceName.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Add channel failed');
      setAddResult(json?.output ? String(json.output) : 'OK');
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setAdding(false);
    }
  }

  async function doLogin(channel: string, account?: string) {
    if (!window.confirm(`Run OpenClaw channels login for "${channel}"${account ? ` (account ${account})` : ''}?`)) return;
    setActionBusy(true);
    setActionOutput(null);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/channels/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, account, verbose: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Login failed');
      setActionOutput(String(json?.output || 'OK'));
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function doLogout(channel: string, account?: string) {
    if (!window.confirm(`Run OpenClaw channels logout for "${channel}"${account ? ` (account ${account})` : ''}?`)) return;
    setActionBusy(true);
    setActionOutput(null);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/channels/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, account }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Logout failed');
      setActionOutput(String(json?.output || 'OK'));
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function doRemove(channel: string, account?: string, del?: boolean) {
    const label = del ? 'DELETE config' : 'Disable account';
    if (
      !window.confirm(
        `${label} for "${channel}"${account ? ` (account ${account})` : ''}?\n\nThis updates OpenClaw config.`
      )
    )
      return;
    setActionBusy(true);
    setActionOutput(null);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/channels/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, account, delete: Boolean(del) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Remove failed');
      setActionOutput(String(json?.output || 'OK'));
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function loadCapabilities() {
    const channel = capChannel.trim();
    if (!channel) return;
    setCapLoading(true);
    setError(null);
    setCapabilities(null);
    try {
      const q = new URLSearchParams();
      q.set('channel', channel);
      if (capAccount.trim()) q.set('account', capAccount.trim());
      if (capTarget.trim()) q.set('target', capTarget.trim());
      const res = await mcFetch(`/api/openclaw/channels/capabilities?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load capabilities');
      setCapabilities(json?.capabilities ?? null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setCapLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            Channels: {channelIds.length || '—'}
          </Badge>
          {list?.usage?.providers?.length ? (
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              Usage snapshot: {fmtTime(list.usage.updatedAt)}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={probe} onChange={(e) => setProbe(e.target.checked)} />
            Probe credentials (slower)
          </label>
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {actionOutput ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Last action output</div>
          <pre className="mt-2 max-h-[35vh] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)]">
            {actionOutput}
          </pre>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Configured Channels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!channelIds.length ? <div className="text-sm text-muted">No channels configured.</div> : null}
            {channelIds.map((id) => {
              const meta = status?.channels?.[id] || {};
              const accounts = status?.channelAccounts?.[id] || [];
              const running = Boolean(meta.running);
              const configured = Boolean(meta.configured);
              return (
                <div key={id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[var(--foreground)]">{channelLabel(id)}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                        {configured ? 'configured' : 'not configured'}
                      </Badge>
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                        {running ? 'running' : 'stopped'}
                      </Badge>
                    </div>
                  </div>

                  {meta.lastError ? (
                    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                      {meta.lastError}
                    </div>
                  ) : null}

                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-muted">
                    <div>Last start: {fmtTime(meta.lastStartAt)}</div>
                    <div>Last stop: {fmtTime(meta.lastStopAt ?? undefined)}</div>
                  </div>

                  {accounts.length ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">Accounts</div>
                      {accounts.slice(0, 8).map((a) => (
                        <div
                          key={`${id}:${a.accountId}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
                        >
                          <span className="font-mono">{a.accountId || 'account'}</span>
                          <span className="text-muted">
                            {a.enabled === false ? 'disabled' : a.running ? 'running' : 'stopped'}
                            {a.lastError ? ' (error)' : ''}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void doLogin(id, a.accountId)}>
                              Login
                            </Button>
                            <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void doLogout(id, a.accountId)}>
                              Logout
                            </Button>
                            <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void doRemove(id, a.accountId, false)}>
                              Disable
                            </Button>
                            <Button size="sm" disabled={actionBusy} onClick={() => void doRemove(id, a.accountId, true)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-muted">No accounts listed for this channel.</div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void doLogin(id)}>
                      Login (default)
                    </Button>
                    <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void doLogout(id)}>
                      Logout (default)
                    </Button>
                    <Button size="sm" variant="secondary" disabled={actionBusy} onClick={() => void doRemove(id, undefined, false)}>
                      Disable (default)
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            {list?.usage?.providers?.length ? (
              <div className="space-y-3">
                {list.usage.providers.slice(0, 6).map((p, idx) => (
                  <div key={`${p.provider || ''}-${idx}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[var(--foreground)]">{p.displayName || p.provider}</div>
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{p.plan || 'plan'}</Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      {(p.windows || []).slice(0, 4).map((w, widx) => (
                        <div key={`${w.label || ''}-${widx}`} className="flex items-center justify-between gap-2">
                          <span>{w.label || 'window'}</span>
                          <span className="font-mono text-[var(--foreground)]">
                            {typeof w.usedPercent === 'number' ? `${w.usedPercent}%` : '—'} {w.resetAt ? `· reset ${fmtTime(w.resetAt)}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted">No usage snapshot returned.</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Add or Update Channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Channel</div>
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  value={addChannel}
                  onChange={(e) => setAddChannel(e.target.value)}
                >
                  <option value="">Select…</option>
                  {['telegram', 'discord', 'slack', 'whatsapp', 'imessage', 'signal', 'matrix', 'googlechat'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Account (optional)</div>
                <input
                  value={addAccount}
                  onChange={(e) => setAddAccount(e.target.value)}
                  placeholder="default"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Display name (optional)</div>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="My Telegram Bot"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
            </div>

            {(addChannel === 'telegram' || addChannel === 'discord') ? (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Bot token</div>
                <input
                  value={addToken}
                  onChange={(e) => setAddToken(e.target.value)}
                  placeholder="paste token"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
            ) : null}

            {addChannel === 'slack' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Slack bot token (xoxb-…)</div>
                  <input
                    value={addBotToken}
                    onChange={(e) => setAddBotToken(e.target.value)}
                    placeholder="xoxb-…"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Slack app token (xapp-…)</div>
                  <input
                    value={addAppToken}
                    onChange={(e) => setAddAppToken(e.target.value)}
                    placeholder="xapp-…"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
              </div>
            ) : null}

            {addChannel === 'imessage' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">CLI path (default: imsg)</div>
                  <input
                    value={addCliPath}
                    onChange={(e) => setAddCliPath(e.target.value)}
                    placeholder="imsg"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">DB path (optional)</div>
                  <input
                    value={addDbPath}
                    onChange={(e) => setAddDbPath(e.target.value)}
                    placeholder="~/Library/Messages/chat.db"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Service (imessage|sms|auto)</div>
                  <input
                    value={addService}
                    onChange={(e) => setAddService(e.target.value)}
                    placeholder="auto"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Region (SMS only)</div>
                  <input
                    value={addRegion}
                    onChange={(e) => setAddRegion(e.target.value)}
                    placeholder="CA"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
              </div>
            ) : null}

            {addChannel === 'whatsapp' ? (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Auth dir (optional)</div>
                <input
                  value={addAuthDir}
                  onChange={(e) => setAddAuthDir(e.target.value)}
                  placeholder="(leave empty unless you know why)"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
            ) : null}

            {addChannel === 'matrix' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Homeserver</div>
                  <input
                    value={addHomeserver}
                    onChange={(e) => setAddHomeserver(e.target.value)}
                    placeholder="https://matrix.org"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">User ID</div>
                  <input
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    placeholder="@user:matrix.org"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Access token (optional)</div>
                  <input
                    value={addAccessToken}
                    onChange={(e) => setAddAccessToken(e.target.value)}
                    placeholder="syt_…"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Password (optional)</div>
                  <input
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    placeholder="••••••"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Device name (optional)</div>
                  <input
                    value={addDeviceName}
                    onChange={(e) => setAddDeviceName(e.target.value)}
                    placeholder="mission-control"
                    className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void addOrUpdate()} disabled={adding || !addChannel.trim()}>
                {adding ? 'Saving…' : 'Add / Update'}
              </Button>
              <span className="text-xs text-muted">This runs <span className="font-mono">openclaw channels add</span> on the host.</span>
            </div>

            {addResult ? (
              <pre className="max-h-[30vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
                {addResult}
              </pre>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Channel</div>
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                  value={capChannel}
                  onChange={(e) => setCapChannel(e.target.value)}
                >
                  <option value="">Select channel…</option>
                  {channelIds.map((id) => (
                    <option key={id} value={id}>
                      {channelLabel(id)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Account (optional)</div>
                <input
                  value={capAccount}
                  onChange={(e) => setCapAccount(e.target.value)}
                  placeholder="default"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Target (optional)</div>
                <input
                  value={capTarget}
                  onChange={(e) => setCapTarget(e.target.value)}
                  placeholder="Discord channel:<id>"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void loadCapabilities()} disabled={capLoading || !capChannel.trim()}>
                {capLoading ? 'Loading…' : 'Load capabilities'}
              </Button>
              <span className="text-xs text-muted">Read-only audit of supported intents/scopes.</span>
            </div>

            {capabilities ? (
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
                {JSON.stringify(capabilities, null, 2)}
              </pre>
            ) : (
              <div className="text-xs text-muted">No capabilities loaded yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
