'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type SkillRow = {
  name: string;
  description?: string;
  emoji?: string;
  eligible?: boolean;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  source?: string;
  bundled?: boolean;
  homepage?: string;
  missing?: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[]; os?: string[] };
};

type SkillInfo = {
  name?: string;
  description?: string;
  filePath?: string;
  baseDir?: string;
  emoji?: string;
  homepage?: string;
  eligible?: boolean;
  disabled?: boolean;
  blockedByAllowlist?: boolean;
  requirements?: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[]; os?: string[] };
  missing?: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[]; os?: string[] };
  install?: Array<{ id?: string; kind?: string; label?: string; bins?: string[] }>;
};

function hasMissing(m?: SkillRow['missing']) {
  if (!m) return false;
  return Boolean((m.bins && m.bins.length) || (m.anyBins && m.anyBins.length) || (m.env && m.env.length) || (m.config && m.config.length) || (m.os && m.os.length));
}

export function SkillsClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<SkillRow[]>([]);

  const [query, setQuery] = React.useState('');
  const [onlyEligible, setOnlyEligible] = React.useState(false);
  const [showMissingOnly, setShowMissingOnly] = React.useState(false);

  const [selected, setSelected] = React.useState<string>('');
  const [info, setInfo] = React.useState<SkillInfo | null>(null);
  const [infoLoading, setInfoLoading] = React.useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ verbose: '1', ...(onlyEligible ? { eligible: '1' } : {}) });
      const res = await mcFetch(`/api/openclaw/skills/list?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load skills');
      const skills = Array.isArray(json?.skills) ? (json.skills as SkillRow[]) : [];
      skills.sort((a, b) => a.name.localeCompare(b.name));
      setRows(skills);
    } catch (err: any) {
      setError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadInfo(name: string) {
    const skill = name.trim();
    if (!skill) return;
    setInfoLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ name: skill });
      const res = await mcFetch(`/api/openclaw/skills/info?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load skill info');
      setInfo((json?.skill as SkillInfo) || null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setInfo(null);
    } finally {
      setInfoLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyEligible]);

  React.useEffect(() => {
    if (!selected) {
      setInfo(null);
      return;
    }
    void loadInfo(selected);
  }, [selected]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((s) => {
      if (showMissingOnly && !hasMissing(s.missing)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        String(s.description || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [rows, query, showMissingOnly]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,420px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Skills</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search skills…" className="w-full sm:w-[360px]" />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} />
              Eligible only
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={showMissingOnly} onChange={(e) => setShowMissingOnly(e.target.checked)} />
              Missing only
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => {
              const active = selected === s.name;
              const missing = hasMissing(s.missing);
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setSelected(s.name)}
                  className={[
                    'rounded-2xl border p-4 text-left transition',
                    active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--foreground)]/5',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {s.emoji ? <span className="mr-2">{s.emoji}</span> : null}
                      {s.name}
                    </div>
                    <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                      {s.eligible ? 'ready' : missing ? 'missing' : s.disabled ? 'disabled' : 'needs setup'}
                    </Badge>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-muted">{s.description || ''}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                    {s.source ? <span>{s.source}</span> : null}
                    {s.bundled ? <span>bundled</span> : null}
                    {s.blockedByAllowlist ? <span>blocked</span> : null}
                  </div>
                </button>
              );
            })}
          </div>

          {!filtered.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No skills match.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skill Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
              Select a skill to see details.
            </div>
          ) : null}

          {selected ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--foreground)]">{selected}</div>
                <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                  {info?.eligible ? 'eligible' : 'not eligible'}
                </Badge>
              </div>
              {infoLoading ? <div className="text-xs text-muted">Loading…</div> : null}
              {info?.description ? <div className="text-xs text-muted">{info.description}</div> : null}

              {info?.filePath ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                  <span className="min-w-0 truncate font-mono text-xs">{info.filePath}</span>
                  <CopyButton value={info.filePath} />
                </div>
              ) : null}

              {info?.requirements ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Requirements</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{JSON.stringify(info.requirements, null, 2)}</pre>
                </div>
              ) : null}

              {info?.missing && hasMissing(info.missing as any) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <div className="text-xs uppercase tracking-[0.2em]">Missing</div>
                  <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(info.missing, null, 2)}</pre>
                </div>
              ) : null}

              {Array.isArray(info?.install) && info!.install!.length ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Install hints</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{JSON.stringify(info.install, null, 2)}</pre>
                </div>
              ) : null}

              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
                Skills are discovered from your OpenClaw install. Mission Control never calls the LLM to inspect skills.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
