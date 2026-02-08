'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/utils';
import type { Agent } from '@/lib/types';
import { mcFetch } from '@/lib/clientApi';

type OpenClawAgent = {
  id: string;
  identityName?: string;
  identityEmoji?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
};

export function AgentDetailClient({ agentId, pbAgent }: { agentId: string; pbAgent: Agent | null }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [openclaw, setOpenclaw] = React.useState<OpenClawAgent | null>(null);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = React.useState(0);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/agents', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load OpenClaw agents');
      const agents = Array.isArray(json?.agents) ? (json.agents as OpenClawAgent[]) : [];
      const found = agents.find((a) => a.id === agentId) || null;
      setOpenclaw(found);
    } catch (err: any) {
      setError(err?.message || String(err));
      setOpenclaw(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const title = pbAgent?.displayName || openclaw?.identityName || agentId;
  const emoji = openclaw?.identityEmoji || '';
  const initials = String(title || agentId || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const avatarSrc = `/api/agents/avatar/${encodeURIComponent(agentId)}?v=${avatarVersion}`;

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const form = new FormData();
      form.set('avatar', file, file.name || 'avatar.png');
      const res = await mcFetch(`/api/agents/avatar/${encodeURIComponent(agentId)}`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Upload failed');
      setAvatarVersion((v) => v + 1);
    } catch (err: any) {
      setAvatarError(err?.message || String(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Agent</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Link href="/agents">
                <Button size="sm" variant="secondary">
                  Back
                </Button>
              </Link>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Identity</div>
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarSrc}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // Hide the image if missing so the fallback shows.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-muted">
                  {initials || 'AG'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-[var(--foreground)]">
                  {emoji ? <span className="mr-2">{emoji}</span> : null}
                  {title}
                </div>
                <div className="mt-1 text-xs text-muted">
                  OpenClaw ID: <span className="font-mono text-[var(--foreground)]">{agentId}</span>
                </div>
              </div>
            </div>
            <div className="mt-1 text-xs text-muted">
              Upload a profile photo so tasks and calendars show who owns work at a glance.
            </div>
            {avatarError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{avatarError}</div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--foreground)] transition hover:bg-[var(--surface)]">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadAvatar(file);
                    e.currentTarget.value = '';
                  }}
                  disabled={avatarBusy}
                />
                {avatarBusy ? 'Uploading…' : 'Upload photo'}
              </label>
              <div className="text-xs text-muted">PNG/JPG up to ~8MB.</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Mission Control</div>
              <div className="mt-2 space-y-1">
                <div>
                  Status:{' '}
                  <span className="font-mono text-[var(--foreground)]">{pbAgent?.status || 'not in roster'}</span>
                </div>
                <div>
                  Role: <span className="font-mono text-[var(--foreground)]">{pbAgent?.role || '—'}</span>
                </div>
                <div>
                  Model tier:{' '}
                  <span className="font-mono text-[var(--foreground)]">{pbAgent?.modelTier || '—'}</span>
                </div>
                <div>
                  Last seen:{' '}
                  <span className="font-mono text-[var(--foreground)]">{formatShortDate(pbAgent?.lastSeenAt) || '—'}</span>
                </div>
                <div>
                  Last worklog:{' '}
                  <span className="font-mono text-[var(--foreground)]">
                    {formatShortDate(pbAgent?.lastWorklogAt) || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">OpenClaw</div>
              <div className="mt-2 space-y-1">
                <div>
                  Present:{' '}
                  <span className="font-mono text-[var(--foreground)]">{openclaw ? 'yes' : 'no'}</span>
                </div>
                <div>
                  Model:{' '}
                  <span className="font-mono text-[var(--foreground)]">{openclaw?.model || 'default'}</span>
                </div>
                <div className="truncate">
                  Workspace:{' '}
                  <span className="font-mono text-[var(--foreground)]">{openclaw?.workspace || '—'}</span>
                </div>
                <div className="truncate">
                  Agent dir:{' '}
                  <span className="font-mono text-[var(--foreground)]">{openclaw?.agentDir || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/sessions?agentId=${encodeURIComponent(agentId)}`}>
              <Button size="sm" variant="secondary">
                View sessions
              </Button>
            </Link>
            <Link href={`/agents/${encodeURIComponent(agentId)}/vault`}>
              <Button size="sm" variant="secondary">
                Credentials (Vault)
              </Button>
            </Link>
            <Link href="/tasks">
              <Button size="sm" variant="secondary">
                View tasks
              </Button>
            </Link>
            <Link href="/openclaw">
              <Button size="sm" variant="secondary">
                OpenClaw hub
              </Button>
            </Link>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Chat below</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
            Use <span className="font-mono">agent:&lt;id&gt;:main</span> for normal chat, and{' '}
            <span className="font-mono">agent:&lt;id&gt;:mc:&lt;taskId&gt;</span> for per-task sessions to avoid bloating your main context.
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
            Mission Control only wakes agents for assignments, explicit @mentions, nudges, and escalations.
            Avoid chatty subscription storms to keep token usage predictable.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
