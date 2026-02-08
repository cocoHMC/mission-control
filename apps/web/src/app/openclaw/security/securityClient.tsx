'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type Finding = {
  checkId?: string;
  severity?: string;
  title?: string;
  detail?: string;
  remediation?: string;
};

type Audit = {
  ts?: number;
  summary?: { critical?: number; warn?: number; info?: number };
  findings?: Finding[];
};

function formatTs(ts?: number) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function severityColor(sev: string) {
  const s = (sev || '').toLowerCase();
  if (s === 'critical') return 'bg-red-600 text-white';
  if (s === 'warn' || s === 'warning') return 'bg-amber-500 text-black';
  return 'bg-[var(--highlight)] text-[var(--foreground)]';
}

export function SecurityClient() {
  const [audit, setAudit] = React.useState<Audit | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deep, setDeep] = React.useState(false);

  async function run(deepMode: boolean) {
    setLoading(true);
    setError(null);
    setDeep(deepMode);
    try {
      const q = new URLSearchParams(deepMode ? { deep: '1' } : {});
      const res = await mcFetch(`/api/openclaw/security/audit?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Audit failed');
      setAudit((json?.audit as Audit) || null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setAudit(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void run(false);
  }, []);

  const findings = Array.isArray(audit?.findings) ? audit!.findings! : [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Audit Results</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void run(false)} disabled={loading}>
                {loading && !deep ? 'Running…' : 'Run'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void run(true)} disabled={loading}>
                {loading && deep ? 'Deep…' : 'Deep'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              critical: {audit?.summary?.critical ?? '—'}
            </Badge>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              warn: {audit?.summary?.warn ?? '—'}
            </Badge>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              info: {audit?.summary?.info ?? '—'}
            </Badge>
            {audit?.ts ? <span className="text-xs text-muted">ran {formatTs(audit.ts)}</span> : null}
          </div>

          {findings.length ? (
            <div className="space-y-3">
              {findings.map((f, idx) => (
                <div key={`${f.checkId || ''}-${idx}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--foreground)]">{f.title || 'Finding'}</div>
                      {f.checkId ? <div className="mt-1 font-mono text-xs text-muted">{f.checkId}</div> : null}
                    </div>
                    <Badge className={`border-none ${severityColor(String(f.severity || 'info'))}`}>
                      {String(f.severity || 'info')}
                    </Badge>
                  </div>
                  {f.detail ? <pre className="mt-3 whitespace-pre-wrap text-xs text-muted">{f.detail}</pre> : null}
                  {f.remediation ? (
                    <div className="mt-3 text-xs">
                      <span className="font-semibold text-[var(--foreground)]">Remediation:</span> {f.remediation}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No findings loaded.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hardening Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="font-semibold text-[var(--foreground)]">Tailscale Serve</div>
            <div className="mt-1 text-xs text-muted">Best default: keep gateway on loopback and expose via tailnet.</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="font-semibold text-[var(--foreground)]">Exec Allowlist</div>
            <div className="mt-1 text-xs text-muted">Keep patterns narrow. Avoid allowing shells or package managers.</div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="font-semibold text-[var(--foreground)]">CLI</div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs">openclaw security audit --deep</span>
              <CopyButton value="openclaw security audit --deep" />
            </div>
            <div className="mt-2 text-xs text-muted">Use the CLI if you want to apply `--fix` changes.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
