'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';
import { formatShortDate, titleCase } from '@/lib/utils';
import type { VaultAgentToken, VaultAudit, VaultItem, VaultItemType, VaultExposureMode } from '@/lib/types';

type TabId = 'credentials' | 'tokens' | 'audit';

const CREDENTIAL_TYPES: Array<{ id: VaultItemType; label: string; help: string }> = [
  { id: 'api_key', label: 'API Key', help: 'Single secret string (recommended for PATs and API keys).' },
  { id: 'username_password', label: 'Username + Password', help: 'Stores username in plaintext and password encrypted.' },
  { id: 'oauth_refresh', label: 'OAuth Refresh Token', help: 'Stores a refresh token (treat as extremely sensitive).' },
  { id: 'secret', label: 'Arbitrary Secret', help: 'Generic secret value.' },
];

function cx(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(' ');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeJsonInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function errorFromResponse(res: Response, json: any, fallback: string) {
  const msg = json?.error || json?.message;
  if (msg) return String(msg);
  if (res.status === 401) return 'Authentication required (admin).';
  if (res.status === 403) return 'Forbidden.';
  if (res.status === 404) return 'Not found.';
  if (res.status === 409) return 'Vault setup required.';
  return `${fallback} (${res.status})`;
}

export function VaultClient({ agentId }: { agentId: string }) {
  const [tab, setTab] = React.useState<TabId>('credentials');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<VaultItem[]>([]);
  const [tokens, setTokens] = React.useState<VaultAgentToken[]>([]);
  const [audit, setAudit] = React.useState<VaultAudit[]>([]);

  const [itemsQuery, setItemsQuery] = React.useState('');
  const [itemsType, setItemsType] = React.useState<VaultItemType | 'all'>('all');
  const [itemsExposure, setItemsExposure] = React.useState<VaultExposureMode | 'all'>('all');
  const [itemsState, setItemsState] = React.useState<'all' | 'enabled' | 'disabled'>('enabled');

  const [revealed, setRevealed] = React.useState<Record<string, { value: string; username?: string; expiresAt: number }>>({});
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [rotatingId, setRotatingId] = React.useState<string | null>(null);

  const [newCred, setNewCred] = React.useState<{
    type: VaultItemType;
    handle: string;
    service: string;
    username: string;
    secret: string;
    exposureMode: VaultExposureMode;
    notes: string;
    tagsRaw: string;
  }>({
    type: 'api_key',
    handle: '',
    service: '',
    username: '',
    secret: '',
    exposureMode: 'inject_only',
    notes: '',
    tagsRaw: '',
  });

  const [newTokenLabel, setNewTokenLabel] = React.useState('');
  const [newTokenValue, setNewTokenValue] = React.useState<string | null>(null);
  const [newTokenPrefix, setNewTokenPrefix] = React.useState<string | null>(null);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [itemsRes, tokensRes, auditRes] = await Promise.all([
        mcFetch(`/api/vault/agents/${encodeURIComponent(agentId)}/items`, { cache: 'no-store' }),
        mcFetch(`/api/vault/agents/${encodeURIComponent(agentId)}/tokens`, { cache: 'no-store' }),
        mcFetch(`/api/vault/audit?agentId=${encodeURIComponent(agentId)}&perPage=100`, { cache: 'no-store' }),
      ]);

      const itemsJson = await itemsRes.json().catch(() => null);
      const tokensJson = await tokensRes.json().catch(() => null);
      const auditJson = await auditRes.json().catch(() => null);

      if (!itemsRes.ok) throw new Error(errorFromResponse(itemsRes, itemsJson, 'Failed to load credentials'));
      if (!tokensRes.ok) throw new Error(errorFromResponse(tokensRes, tokensJson, 'Failed to load tokens'));
      if (!auditRes.ok) throw new Error(errorFromResponse(auditRes, auditJson, 'Failed to load audit log'));

      setItems(Array.isArray(itemsJson?.items) ? (itemsJson.items as VaultItem[]) : []);
      setTokens(Array.isArray(tokensJson?.items) ? (tokensJson.items as VaultAgentToken[]) : []);
      setAudit(Array.isArray(auditJson?.items) ? (auditJson.items as VaultAudit[]) : []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  React.useEffect(() => {
    // Clear expired reveal blobs.
    const t = setInterval(() => {
      const now = Date.now();
      setRevealed((prev) => {
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expiresAt > now) next[k] = v;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  async function createCredential() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const tags = newCred.tagsRaw ? normalizeJsonInput(newCred.tagsRaw) : null;
      if (newCred.tagsRaw && tags == null) {
        throw new Error('Tags must be valid JSON (or blank).');
      }

      const res = await mcFetch(`/api/vault/agents/${encodeURIComponent(agentId)}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: newCred.type,
          handle: newCred.handle,
          service: newCred.service,
          username: newCred.type === 'username_password' ? newCred.username : '',
          secret: newCred.secret,
          exposureMode: newCred.exposureMode,
          notes: newCred.notes,
          tags,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorFromResponse(res, json, 'Create failed'));

      const createdHandle = String(json?.item?.handle || '').trim() || String(newCred.handle || '').trim();
      setSuccess(createdHandle ? `Credential created: ${createdHandle} (use {{vault:${createdHandle}}})` : 'Credential created.');
      setNewCred((prev) => ({ ...prev, handle: '', service: '', username: '', secret: '', notes: '', tagsRaw: '' }));
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveItemEdits(item: VaultItem, patch: Partial<VaultItem>) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch(`/api/vault/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Update failed');
      setSuccess('Updated.');
      setEditingId(null);
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function rotateSecret(item: VaultItem, payload: { secret: string; username?: string }) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch(`/api/vault/items/${encodeURIComponent(item.id)}/rotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Rotate failed');
      setSuccess('Rotated.');
      setRotatingId(null);
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revealSecret(item: VaultItem) {
    if (
      !window.confirm(
        [
          'DANGER: This will reveal a plaintext credential in your browser.',
          '',
          'If your screen is recorded, shared, or if your browser console is monitored, this may leak the secret.',
          '',
          'Proceed?',
        ].join('\n')
      )
    ) {
      return;
    }

    const typed = window.prompt(`Type the handle "${item.handle}" to confirm reveal:`, '');
    if (typed !== item.handle) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch(`/api/vault/items/${encodeURIComponent(item.id)}/reveal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ at: nowIso() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Reveal failed');

      const value = String(json?.value || '');
      const username = String(json?.username || '');
      setRevealed((prev) => ({
        ...prev,
        [item.id]: { value, username: username || undefined, expiresAt: Date.now() + 30_000 },
      }));
      setSuccess('Revealed for 30 seconds (auto-clears).');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: VaultItem) {
    if (!window.confirm(`Delete credential "${item.handle}"? This cannot be undone.`)) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch(`/api/vault/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Delete failed');
      setSuccess('Deleted.');
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createToken() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setNewTokenValue(null);
    setNewTokenPrefix(null);
    try {
      const res = await mcFetch(`/api/vault/agents/${encodeURIComponent(agentId)}/tokens`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: newTokenLabel }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Token creation failed');

      setNewTokenValue(String(json?.token || ''));
      setNewTokenPrefix(String(json?.tokenPrefix || ''));
      setNewTokenLabel('');
      setSuccess('Token created. Copy it now; it will not be shown again.');
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disableToken(token: VaultAgentToken) {
    if (!window.confirm(`Disable token "${token.tokenPrefix}"? Existing plugins using it will stop working.`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch(`/api/vault/tokens/${encodeURIComponent(token.id)}/disable`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Disable failed');
      setSuccess('Token disabled.');
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function repairVault() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch(`/api/vault/repair`, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorFromResponse(res, json, 'Repair failed'));
      setSuccess('Vault repair succeeded. Refreshing…');
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const filteredItems = React.useMemo(() => {
    const q = itemsQuery.trim().toLowerCase();
    const matchesQuery = (it: VaultItem) => {
      if (!q) return true;
      const hay = [
        it.handle,
        it.service || '',
        it.type || '',
        it.exposureMode || '',
        it.notes || '',
        typeof it.tags === 'string' ? it.tags : '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    };
    return (items || [])
      .filter((it) => {
        if (!it) return false;
        if (itemsType !== 'all' && it.type !== itemsType) return false;
        const mode = (it.exposureMode as VaultExposureMode) || 'inject_only';
        if (itemsExposure !== 'all' && mode !== itemsExposure) return false;
        const disabled = Boolean(it.disabled);
        if (itemsState === 'enabled' && disabled) return false;
        if (itemsState === 'disabled' && !disabled) return false;
        if (!matchesQuery(it)) return false;
        return true;
      })
      .sort((a, b) => String(a.service || '').localeCompare(String(b.service || '')) || String(a.handle || '').localeCompare(String(b.handle || '')));
  }, [items, itemsExposure, itemsQuery, itemsState, itemsType]);

  const groupedItems = React.useMemo(() => {
    const out = new Map<string, VaultItem[]>();
    for (const it of filteredItems) {
      const key = String(it.service || '').trim() || 'Uncategorized';
      const list = out.get(key) || [];
      list.push(it);
      out.set(key, list);
    }
    return Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems]);

  const canSuggestRepair = React.useMemo(() => {
    const e = String(error || '').toLowerCase();
    if (!e) return false;
    return e.includes('vault_items') || e.includes('vault_agent_tokens') || e.includes('pocketbase') || e.includes('missing pb_');
  }, [error]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="text-xs font-semibold uppercase tracking-[0.2em]">Extreme Caution</div>
        <div className="mt-2 space-y-2 text-sm">
          <div>
            Giving an agent a credential is equivalent to giving it the ability to act as you. Use least-privilege scopes and
            separate accounts/tokens for agents.
          </div>
          <div>
            Recommended: keep credentials <span className="font-mono">inject-only</span> and use placeholders like{' '}
            <span className="font-mono">{'{{vault:handle}}'}</span> so the model never sees raw secrets.
          </div>
          <div>
            If you enable <span className="font-mono">revealable</span>, revealing secrets can leak them via screen share,
            recordings, or client logs.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={tab === 'credentials' ? 'default' : 'secondary'}
          onClick={() => setTab('credentials')}
        >
          Credentials
        </Button>
        <Button size="sm" variant={tab === 'tokens' ? 'default' : 'secondary'} onClick={() => setTab('tokens')}>
          Tokens
        </Button>
        <Button size="sm" variant={tab === 'audit' ? 'default' : 'secondary'} onClick={() => setTab('audit')}>
          Audit
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void refreshAll()} disabled={loading || busy}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Link href={`/agents/${encodeURIComponent(agentId)}`}>
            <Button size="sm" variant="secondary">
              Back
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <div className="font-semibold">Error</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
          {canSuggestRepair ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void repairVault()} disabled={busy || loading}>
                {busy ? 'Repairing…' : 'Repair Vault schema'}
              </Button>
              <div className="text-[11px] text-red-700/80">
                Runs the PocketBase bootstrap scripts to create missing Vault collections.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{success}</div>
      ) : null}

      {tab === 'credentials' ? (
        <div className="grid gap-4 lg:grid-cols-[480px,1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Add Credential</span>
                <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">agent {agentId}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Type</div>
                <select
                  className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  value={newCred.type}
                  onChange={(e) => setNewCred((p) => ({ ...p, type: e.target.value as VaultItemType }))}
                >
                  {CREDENTIAL_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-muted">{CREDENTIAL_TYPES.find((t) => t.id === newCred.type)?.help || ''}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Handle (optional)</div>
                  <Input
                    value={newCred.handle}
                    onChange={(e) => setNewCred((p) => ({ ...p, handle: e.target.value }))}
                    placeholder="github_pat"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <div className="text-[11px] text-muted">
                    Stable id used in placeholders (recommended). If blank, we auto-generate one. Example:{' '}
                    <span className="font-mono">{'{{vault:github_pat}}'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Service</div>
                  <Input
                    value={newCred.service}
                    onChange={(e) => setNewCred((p) => ({ ...p, service: e.target.value }))}
                    placeholder="GitHub / Stripe / AWS / Custom"
                  />
                </div>
              </div>

              {newCred.type === 'username_password' ? (
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Username</div>
                  <Input value={newCred.username} onChange={(e) => setNewCred((p) => ({ ...p, username: e.target.value }))} />
                  <div className="text-[11px] text-muted">
                    Username is stored in plaintext. Password remains encrypted.
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Secret Value</div>
                <Input
                  type="password"
                  value={newCred.secret}
                  onChange={(e) => setNewCred((p) => ({ ...p, secret: e.target.value }))}
                  placeholder="(never paste secrets into chat)"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Exposure Mode</div>
                  <select
                    className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    value={newCred.exposureMode}
                    onChange={(e) => setNewCred((p) => ({ ...p, exposureMode: e.target.value as VaultExposureMode }))}
                  >
                    <option value="inject_only">inject-only (recommended)</option>
                    <option value="revealable">revealable (dangerous)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Tags (JSON)</div>
                  <Input
                    value={newCred.tagsRaw}
                    onChange={(e) => setNewCred((p) => ({ ...p, tagsRaw: e.target.value }))}
                    placeholder='{"env":"prod"}'
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Notes</div>
                <Textarea value={newCred.notes} onChange={(e) => setNewCred((p) => ({ ...p, notes: e.target.value }))} />
              </div>

              <Button onClick={() => void createCredential()} disabled={busy || loading}>
                {busy ? 'Working…' : 'Create'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Credentials</span>
                <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{filteredItems.length} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              <div className="grid gap-3 lg:grid-cols-[1fr,auto,auto,auto]">
                <div className="space-y-1 lg:col-span-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Search</div>
                  <Input
                    value={itemsQuery}
                    onChange={(e) => setItemsQuery(e.target.value)}
                    placeholder="handle, service, notes…"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Type</div>
                  <select
                    className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    value={itemsType}
                    onChange={(e) => setItemsType(e.target.value as any)}
                  >
                    <option value="all">All</option>
                    {CREDENTIAL_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Exposure</div>
                  <select
                    className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    value={itemsExposure}
                    onChange={(e) => setItemsExposure(e.target.value as any)}
                  >
                    <option value="all">All</option>
                    <option value="inject_only">inject-only</option>
                    <option value="revealable">revealable</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">State</div>
                  <select
                    className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    value={itemsState}
                    onChange={(e) => setItemsState(e.target.value as any)}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                    <option value="all">All</option>
                  </select>
                </div>
              </div>

              {!filteredItems.length ? <div className="text-sm text-muted">No credentials match your filters.</div> : null}

              <div className="space-y-4">
                {groupedItems.map(([service, serviceItems]) => (
                  <div key={service} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--foreground)]">{service}</div>
                        <div className="mt-1 text-[11px] text-muted">Click a handle to copy the placeholder.</div>
                      </div>
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{serviceItems.length}</Badge>
                    </div>

                    <div className="divide-y divide-[var(--border)]">
                      {serviceItems.map((it) => {
                        const active = editingId === it.id;
                        const rotating = rotatingId === it.id;
                        const reveal = revealed[it.id] || null;
                        const disabled = Boolean(it.disabled);

                        const placeholder = `{{vault:${it.handle}}}`;
                        const userPlaceholder = `{{vault:${it.handle}.username}}`;

                        return (
                          <div
                            key={it.id}
                            className={cx(
                              'px-4 py-3 transition',
                              disabled ? 'bg-amber-50/50' : 'hover:bg-[color:var(--foreground)]/5'
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    className="truncate font-mono text-[11px] text-[var(--foreground)] underline underline-offset-2"
                                    onClick={() => navigator.clipboard?.writeText(placeholder).catch(() => {})}
                                    title="Copy placeholder"
                                  >
                                    {it.handle}
                                  </button>
                                  <CopyButton value={placeholder} label="Copy {{vault:handle}}" />
                                  {it.type === 'username_password' ? (
                                    <CopyButton value={userPlaceholder} label="Copy username ref" />
                                  ) : null}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{titleCase(it.type)}</Badge>
                                  <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                                    {it.exposureMode === 'revealable' ? 'revealable' : 'inject-only'}
                                  </Badge>
                                  {disabled ? (
                                    <Badge className="border-none bg-amber-200 text-amber-900">disabled</Badge>
                                  ) : (
                                    <Badge className="border-none bg-emerald-100 text-emerald-900">enabled</Badge>
                                  )}
                                  <div className="text-[11px] text-muted">
                                    Used <span className="font-mono text-[var(--foreground)]">{formatShortDate(it.lastUsedAt)}</span>
                                    {' · '}
                                    Rotated <span className="font-mono text-[var(--foreground)]">{formatShortDate(it.lastRotatedAt)}</span>
                                  </div>
                                </div>
                                {it.notes ? (
                                  <div className="mt-2 max-w-3xl text-xs text-muted">
                                    {String(it.notes).slice(0, 240)}
                                    {String(it.notes).length > 240 ? '…' : ''}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button size="sm" variant="secondary" onClick={() => setEditingId(active ? null : it.id)} disabled={busy}>
                                  {active ? 'Close' : 'Edit'}
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setRotatingId(rotating ? null : it.id)} disabled={busy}>
                                  Rotate
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => void revealSecret(it)}
                                  disabled={busy || it.exposureMode !== 'revealable'}
                                >
                                  Reveal
                                </Button>
                                <Button size="sm" variant={disabled ? 'default' : 'secondary'} onClick={() => void saveItemEdits(it, { disabled: !disabled })} disabled={busy}>
                                  {disabled ? 'Enable' : 'Disable'}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => void deleteItem(it)} disabled={busy}>
                                  Delete
                                </Button>
                              </div>
                            </div>

                            {reveal ? (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                                <div className="font-semibold">Plaintext (auto-clears)</div>
                                {reveal.username ? (
                                  <div className="mt-2">
                                    Username: <span className="font-mono">{reveal.username}</span>{' '}
                                    <CopyButton value={reveal.username} label="Copy username" className="ml-2 inline-flex" />
                                  </div>
                                ) : null}
                                <div className="mt-2 break-all font-mono">{reveal.value}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <CopyButton value={reveal.value} label="Copy secret" />
                                  <Badge className="border-none bg-red-200 text-red-900">
                                    clears in {Math.max(0, Math.ceil((reveal.expiresAt - Date.now()) / 1000))}s
                                  </Badge>
                                </div>
                              </div>
                            ) : null}

                            {active ? <ItemEditor item={it} onSave={(patch) => void saveItemEdits(it, patch)} busy={busy} /> : null}
                            {rotating ? (
                              <RotateEditor
                                item={it}
                                busy={busy}
                                onRotate={(payload) => void rotateSecret(it, payload)}
                                onClose={() => setRotatingId(null)}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'tokens' ? (
        <div className="grid gap-4 lg:grid-cols-[480px,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Create Vault Access Token</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Tokens are used by the OpenClaw Vault plugin to resolve placeholders at tool-execution time. Treat tokens like
                passwords.
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Label (optional)</div>
                <Input value={newTokenLabel} onChange={(e) => setNewTokenLabel(e.target.value)} placeholder="OpenClaw gateway" />
              </div>
              <Button onClick={() => void createToken()} disabled={busy || loading}>
                {busy ? 'Working…' : 'Generate token'}
              </Button>

              {newTokenValue ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <div className="font-semibold">Token (shown once)</div>
                  <div className="mt-2 break-all font-mono">{newTokenValue}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CopyButton value={newTokenValue} label="Copy token" />
                    {newTokenPrefix ? (
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{newTokenPrefix}</Badge>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
                OpenClaw placeholders: <span className="font-mono">{'{{vault:HANDLE}}'}</span> or{' '}
                <span className="font-mono">{'{{vault:HANDLE.username}}'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Tokens</span>
                <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{tokens.length} total</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              {!tokens.length ? <div className="text-sm text-muted">No tokens yet.</div> : null}
              <div className="space-y-3">
                {tokens.map((t) => (
                  <div key={t.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] text-[var(--foreground)]/90">{t.tokenPrefix}</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">{t.label || '—'}</div>
                        <div className="mt-2 text-xs text-muted">
                          Last used: <span className="font-mono text-[var(--foreground)]">{formatShortDate(t.lastUsedAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                          {t.disabled ? 'disabled' : 'enabled'}
                        </Badge>
                        <Button size="sm" variant="secondary" onClick={() => void disableToken(t)} disabled={busy || Boolean(t.disabled)}>
                          Disable
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'audit' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Audit Log</span>
              <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{audit.length} entries</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            {!audit.length ? <div className="text-sm text-muted">No audit entries yet.</div> : null}
            <div className="space-y-2">
              {audit.map((a) => {
                const meta = a.meta && typeof a.meta === 'object' ? (a.meta as any) : null;
                const handle = meta?.handle ? String(meta.handle) : '';
                const field = meta?.field ? String(meta.field) : '';

                return (
                  <div key={a.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{a.action}</Badge>
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{a.actorType}</Badge>
                      <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{a.status}</Badge>
                      <div className="ml-auto font-mono text-[11px] text-muted">{formatShortDate(a.ts)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                      {handle ? (
                        <span>
                          handle: <span className="font-mono text-[var(--foreground)]">{handle}</span>
                        </span>
                      ) : null}
                      {field ? (
                        <span>
                          field: <span className="font-mono text-[var(--foreground)]">{field}</span>
                        </span>
                      ) : null}
                      {a.toolName ? (
                        <span>
                          tool: <span className="font-mono text-[var(--foreground)]">{a.toolName}</span>
                        </span>
                      ) : null}
                      {a.sessionKey ? (
                        <span>
                          session: <span className="font-mono text-[var(--foreground)]">{a.sessionKey}</span>
                        </span>
                      ) : null}
                      {a.error ? (
                        <span>
                          error: <span className="font-mono text-red-700">{a.error}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ItemEditor({ item, onSave, busy }: { item: VaultItem; onSave: (patch: Partial<VaultItem>) => void; busy: boolean }) {
  const [service, setService] = React.useState(item.service || '');
  const [username, setUsername] = React.useState(item.username || '');
  const [notes, setNotes] = React.useState(item.notes || '');
  const [exposureMode, setExposureMode] = React.useState<VaultExposureMode>((item.exposureMode as VaultExposureMode) || 'inject_only');

  return (
    <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Edit</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Service</div>
          <Input value={service} onChange={(e) => setService(e.target.value)} />
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Exposure</div>
          <select
            className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]"
            value={exposureMode}
            onChange={(e) => setExposureMode(e.target.value as VaultExposureMode)}
          >
            <option value="inject_only">inject-only</option>
            <option value="revealable">revealable</option>
          </select>
        </div>
      </div>

      {item.type === 'username_password' ? (
        <div className="mt-3 space-y-1">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Username</div>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      ) : null}

      <div className="mt-3 space-y-1">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Notes</div>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => onSave({ service, exposureMode, username: item.type === 'username_password' ? username : '', notes })}
          disabled={busy}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function RotateEditor({
  item,
  onRotate,
  onClose,
  busy,
}: {
  item: VaultItem;
  onRotate: (payload: { secret: string; username?: string }) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [secret, setSecret] = React.useState('');
  const [username, setUsername] = React.useState(item.username || '');

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="text-xs font-semibold uppercase tracking-[0.2em]">Rotate Secret</div>
      <div className="mt-3 space-y-2">
        {item.type === 'username_password' ? (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em]">Username</div>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        ) : null}
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.2em]">New Secret Value</div>
          <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoCapitalize="none" spellCheck={false} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!secret.trim()) return;
            onRotate({ secret, ...(item.type === 'username_password' ? { username } : {}) });
            setSecret('');
          }}
          disabled={busy}
        >
          Rotate
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
