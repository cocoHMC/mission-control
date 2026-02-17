'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { mcFetch } from '@/lib/clientApi';

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function MemoryClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [agent, setAgent] = React.useState('');
  const [sessionKey, setSessionKey] = React.useState('');
  const [deep, setDeep] = React.useState(false);
  const [indexIfDirty, setIndexIfDirty] = React.useState(false);
  const [statusOut, setStatusOut] = React.useState<any>(null);

  const [q, setQ] = React.useState('');
  const [maxResults, setMaxResults] = React.useState('8');
  const [minScore, setMinScore] = React.useState('0');
  const [searchOut, setSearchOut] = React.useState<any>(null);

  const [path, setPath] = React.useState('');
  const [from, setFrom] = React.useState('0');
  const [lines, setLines] = React.useState('200');
  const [getOut, setGetOut] = React.useState<any>(null);

  const refreshStatus = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (agent.trim()) params.set('agent', agent.trim());
      if (deep) params.set('deep', '1');
      if (indexIfDirty) params.set('index', '1');
      const res = await mcFetch(`/api/openclaw/memory/status?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Status failed (${res.status})`);
      setStatusOut(json?.result ?? json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusOut(null);
    } finally {
      setLoading(false);
    }
  }, [agent, deep, indexIfDirty]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query });
      if (sessionKey.trim()) params.set('sessionKey', sessionKey.trim());
      if (agent.trim()) params.set('agent', agent.trim());
      if (maxResults.trim()) params.set('maxResults', maxResults.trim());
      if (minScore.trim()) params.set('minScore', minScore.trim());
      const res = await mcFetch(`/api/openclaw/memory/search?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status})`);
      setSearchOut(json?.result ?? json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSearchOut(null);
    } finally {
      setLoading(false);
    }
  }

  async function runGet(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;
    const key = sessionKey.trim();
    if (!key) {
      setError('sessionKey required for memory_get.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sessionKey: key, path: path.trim() });
      if (from.trim()) params.set('from', from.trim());
      if (lines.trim()) params.set('lines', lines.trim());
      const res = await mcFetch(`/api/openclaw/memory/get?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Get failed (${res.status})`);
      setGetOut(json?.result ?? json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setGetOut(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Status</div>
          <Button size="sm" variant="secondary" onClick={() => void refreshStatus()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Agent (optional)</div>
            <Input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="main" className="mt-2" />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
              Deep
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={indexIfDirty} onChange={(e) => setIndexIfDirty(e.target.checked)} />
              Index if dirty
            </label>
          </div>
        </div>
        <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
          {statusOut ? safeStringify(statusOut) : '(no data)'}
        </pre>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="text-sm font-semibold">Search</div>
        <div className="mt-2 text-xs text-muted">
          Provide a <span className="font-mono">sessionKey</span> (recommended) or <span className="font-mono">agent</span> to scope results.
        </div>
        <form onSubmit={runSearch} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} placeholder="agent:main:main" className="sm:col-span-2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="query…" className="sm:col-span-2" />
          <Input value={maxResults} onChange={(e) => setMaxResults(e.target.value)} placeholder="maxResults" />
          <Input value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="minScore" />
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
            {searchOut ? <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">results</Badge> : null}
          </div>
        </form>
        <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
          {searchOut ? safeStringify(searchOut) : '(no results)'}
        </pre>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="text-sm font-semibold">Get</div>
        <div className="mt-2 text-xs text-muted">Read a memory file by path (scoped to a session).</div>
        <form onSubmit={runGet} className="mt-4 space-y-3">
          <Input value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} placeholder="agent:main:main" />
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="path (from memory_search hit)" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from (line)" />
            <Input value={lines} onChange={(e) => setLines(e.target.value)} placeholder="lines" />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? 'Reading…' : 'Read'}
          </Button>
        </form>
        <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
          {getOut ? safeStringify(getOut) : '(no data)'}
        </pre>
      </div>
    </div>
  );
}
