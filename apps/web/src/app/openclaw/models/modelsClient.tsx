'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcFetch } from '@/lib/clientApi';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/ui/copy-button';

type ModelRow = {
  key: string;
  name?: string;
  input?: string;
  contextWindow?: number;
  available?: boolean;
  tags?: string[];
  missing?: boolean;
  local?: boolean;
};

type ModelList = {
  count?: number;
  models?: ModelRow[];
};

type ModelStatus = {
  defaultModel?: string;
  resolvedDefault?: string;
  fallbacks?: string[];
  configPath?: string;
  auth?: {
    oauth?: {
      profiles?: Array<{ profileId?: string; provider?: string; status?: string; expiresAt?: number; remainingMs?: number }>;
      providers?: Array<{ provider?: string; status?: string }>;
    };
  };
};

function safeStr(v: unknown) {
  return typeof v === 'string' ? v : '';
}

export function ModelsClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [list, setList] = React.useState<ModelList>({});
  const [status, setStatus] = React.useState<ModelStatus | null>(null);

  const [selectedModel, setSelectedModel] = React.useState('');
  const [fallbackInput, setFallbackInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statusRes] = await Promise.all([
        mcFetch('/api/openclaw/models/list', { cache: 'no-store' }),
        mcFetch('/api/openclaw/models/status', { cache: 'no-store' }),
      ]);
      const listJson = await listRes.json().catch(() => null);
      if (!listRes.ok) throw new Error(listJson?.error || 'Failed to load models list');
      setList(listJson || {});

      const statusJson = await statusRes.json().catch(() => null);
      if (!statusRes.ok) throw new Error(statusJson?.error || 'Failed to load model status');
      setStatus((statusJson?.status as ModelStatus) || null);

      setSelectedModel((statusJson?.status?.resolvedDefault as string) || (statusJson?.status?.defaultModel as string) || '');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  async function setDefault() {
    const model = selectedModel.trim();
    if (!model) return;
    if (!window.confirm(`Set default model to "${model}"?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch('/api/openclaw/models/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to set model');
      setSuccess('Default model updated.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateFallback(action: 'add' | 'remove' | 'clear', model?: string) {
    if (action === 'clear') {
      if (!window.confirm('Clear all fallbacks?')) return;
    }
    const m = safeStr(model || '').trim();
    if (action !== 'clear' && !m) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch('/api/openclaw/models/fallbacks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, model: m }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Fallback update failed');
      setSuccess('Fallbacks updated.');
      setFallbackInput('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const models = Array.isArray(list.models) ? list.models : [];
  const fallbacks = Array.isArray(status?.fallbacks) ? status!.fallbacks! : [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Default + Fallbacks</span>
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
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Default model</div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-10 w-full min-w-[280px] rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] sm:w-auto"
              >
                <option value="">(select a model)</option>
                {models.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.key}
                    {m.tags?.includes('default') ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => void setDefault()} disabled={busy || !selectedModel.trim()}>
                Set default
              </Button>
              {status?.defaultModel ? <CopyButton value={status.defaultModel} /> : null}
            </div>
            <div className="text-xs text-muted">
              Config: <span className="font-mono">{status?.configPath || '—'}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Fallbacks</div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={fallbackInput}
                onChange={(e) => setFallbackInput(e.target.value)}
                placeholder="provider/model or alias"
                className="w-full sm:w-[420px]"
              />
              <Button size="sm" onClick={() => void updateFallback('add', fallbackInput)} disabled={busy || !fallbackInput.trim()}>
                Add
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void updateFallback('clear')} disabled={busy || !fallbacks.length}>
                Clear
              </Button>
            </div>
            <div className="space-y-2">
              {fallbacks.length ? (
                fallbacks.map((m) => (
                  <div
                    key={m}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <span className="min-w-0 truncate font-mono text-xs text-[var(--foreground)]">{m}</span>
                    <div className="flex items-center gap-2">
                      <CopyButton value={m} />
                      <Button size="sm" variant="secondary" onClick={() => void updateFallback('remove', m)} disabled={busy}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
                  No fallbacks configured.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
            <div className="font-semibold text-[var(--foreground)]">Token safety</div>
            <div className="mt-1">These operations only edit OpenClaw config. No LLM calls are made.</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auth Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          {status?.auth?.oauth?.profiles?.length ? (
            <div className="space-y-2">
              {status.auth.oauth.profiles.slice(0, 10).map((p, idx) => (
                <div key={`${p.profileId || ''}-${idx}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-mono text-xs text-[var(--foreground)]">{p.profileId || 'profile'}</div>
                    <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{p.status || 'unknown'}</Badge>
                  </div>
                  {typeof p.remainingMs === 'number' ? (
                    <div className="mt-1 text-xs text-muted">
                      Remaining: <span className="font-mono">{Math.round(p.remainingMs / 1000 / 60)}m</span>
                    </div>
                  ) : null}
                  {typeof p.expiresAt === 'number' ? (
                    <div className="mt-1 text-xs text-muted">
                      Expires: <span className="font-mono">{new Date(p.expiresAt).toLocaleString()}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No OAuth profile info reported.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Configured Models</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted">Models listed here come from `openclaw models list` (configured by default).</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <div key={m.key} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate font-mono text-xs text-[var(--foreground)]">{m.key}</div>
                  <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                    {m.available ? 'available' : 'missing'}
                  </Badge>
                </div>
                {m.name ? <div className="mt-2 text-sm text-[var(--foreground)]">{m.name}</div> : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  {m.contextWindow ? <span>ctx {m.contextWindow}</span> : null}
                  {m.input ? <span>{m.input}</span> : null}
                  {m.local ? <span>local</span> : null}
                  {Array.isArray(m.tags) ? m.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>) : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSelectedModel(m.key)}>
                    Select
                  </Button>
                  <CopyButton value={m.key} />
                </div>
              </div>
            ))}
          </div>
          {!models.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No models returned. Ensure OpenClaw is installed and configured.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
