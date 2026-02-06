'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mcFetch } from '@/lib/clientApi';

export function DoctorClient() {
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [output, setOutput] = React.useState<string>('');
  const [deep, setDeep] = React.useState(false);
  const [fix, setFix] = React.useState(false);
  const [force, setForce] = React.useState(false);

  async function run() {
    if (fix) {
      const msg = force
        ? 'Apply doctor fixes with FORCE? This may overwrite custom service config. Continue?'
        : 'Apply doctor fixes? This will modify your OpenClaw setup. Continue?';
      if (!window.confirm(msg)) return;
    }

    setRunning(true);
    setError(null);
    setOutput('');
    try {
      const res = await mcFetch('/api/openclaw/doctor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deep, fix, force }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Doctor failed');
      setOutput(String(json?.output || ''));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px,1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Run Doctor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
            Doctor is for troubleshooting when something is broken (gateway not starting, duplicate services, missing
            directories, etc). It can apply safe changes even in non-interactive mode. Run read-only first.
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
            <span>Deep scan (slower)</span>
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
            <span>Apply fixes (--fix)</span>
            <input type="checkbox" checked={fix} onChange={(e) => setFix(e.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
            <span>Force aggressive repairs (--force)</span>
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              disabled={!fix}
              title={!fix ? 'Enable "Apply fixes" first' : ''}
            />
          </label>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void run()} disabled={running}>
              {running ? 'Running…' : fix ? 'Run + Fix' : 'Run (read-only)'}
            </Button>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              {fix ? 'writes' : 'diagnostic'}
            </Badge>
          </div>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Output</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--foreground)]">
            {output || (running ? 'Running…' : 'No output yet.')}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
