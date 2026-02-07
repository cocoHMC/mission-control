'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LogsClient() {
  const [limit, setLimit] = React.useState(200);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`/api/openclaw/logs?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed to load logs (${res.status})`);
      setLines(Array.isArray(json?.lines) ? json.lines : []);
    } catch (err: any) {
      setError(err?.message || String(err));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Controls</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Lines</div>
            <select
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
              value={limit}
              onChange={(e) => setLimit(Number.parseInt(e.target.value, 10))}
            >
              {[100, 200, 400, 800, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
            <span>Auto refresh</span>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          </label>

          <div className="text-xs">
            Log output is redacted before rendering. If you need full fidelity, run <span className="font-mono">openclaw logs</span> in a terminal.
          </div>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Gateway Log</span>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{lines.length} lines</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
            {lines.join('\n') || (loading ? 'Loading…' : 'No log lines returned.')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

