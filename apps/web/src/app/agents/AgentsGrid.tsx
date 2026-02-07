'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatShortDate } from '@/lib/utils';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent } from '@/lib/types';
import { mcFetch } from '@/lib/clientApi';

type OpenClawAgent = {
  id: string;
  identityName?: string;
  identityEmoji?: string;
  identitySource?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  bindings?: number;
  isDefault?: boolean;
  routes?: string[];
};

type OpenClawAgentDefaults = {
  model?: { primary?: string; fallbacks?: string[] };
  workspace?: string;
  compaction?: { mode?: string };
  thinkingDefault?: string;
  maxConcurrent?: number;
  subagents?: { maxConcurrent?: number };
};

function displayAgentId(agent: Agent) {
  return agent.openclawAgentId || agent.id;
}

export function AgentsGrid({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = React.useState<Agent[]>(initialAgents);
  const [openclawAgents, setOpenclawAgents] = React.useState<OpenClawAgent[]>([]);
  const [openclawDefaults, setOpenclawDefaults] = React.useState<OpenClawAgentDefaults | null>(null);
  const [openclawDefaultsError, setOpenclawDefaultsError] = React.useState<string | null>(null);
  const [openclawError, setOpenclawError] = React.useState<string | null>(null);
  const [openclawLoading, setOpenclawLoading] = React.useState(false);
  const [editingDefaults, setEditingDefaults] = React.useState(false);
  const [savingDefaults, setSavingDefaults] = React.useState(false);
  const [defaultsDraft, setDefaultsDraft] = React.useState({
    modelPrimary: '',
    modelFallbacks: '',
    workspace: '',
    thinkingDefault: 'minimal',
    compactionMode: 'safeguard',
    maxConcurrent: '4',
    subagentsMaxConcurrent: '8',
  });
  const [form, setForm] = React.useState({
    id: '',
    name: '',
    emoji: '',
    role: '',
    modelTier: 'mid',
    createWorkspace: true,
    createOpenClaw: false,
    workspace: '',
  });
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [identityEdit, setIdentityEdit] = React.useState<{
    agentId: string;
    name: string;
    emoji: string;
    fromIdentity: boolean;
  } | null>(null);
  const [savingIdentity, setSavingIdentity] = React.useState(false);
  const [modelEdit, setModelEdit] = React.useState<{ agentId: string; model: string } | null>(null);
  const [savingModel, setSavingModel] = React.useState(false);

  const refreshOpenClawAgents = React.useCallback(async () => {
    setOpenclawLoading(true);
    setOpenclawError(null);
    setOpenclawDefaultsError(null);
    try {
      const [agentsRes, defaultsRes] = await Promise.all([
        mcFetch('/api/openclaw/agents', { cache: 'no-store' }),
        mcFetch('/api/openclaw/agents/defaults', { cache: 'no-store' }),
      ]);

      const agentsJson = await agentsRes.json().catch(() => null);
      if (!agentsRes.ok) throw new Error(agentsJson?.error || 'Failed to load OpenClaw agents');
      setOpenclawAgents(Array.isArray(agentsJson?.agents) ? agentsJson.agents : []);

      const defaultsJson = await defaultsRes.json().catch(() => null);
      if (!defaultsRes.ok) {
        setOpenclawDefaults(null);
        setOpenclawDefaultsError(defaultsJson?.error || 'Failed to load OpenClaw defaults');
      } else {
        const next = (defaultsJson?.defaults as OpenClawAgentDefaults) || null;
        setOpenclawDefaults(next);
        if (next && !editingDefaults) {
          setDefaultsDraft({
            modelPrimary: next.model?.primary || '',
            modelFallbacks: Array.isArray(next.model?.fallbacks) ? next.model!.fallbacks!.join(', ') : '',
            workspace: next.workspace || '',
            thinkingDefault: next.thinkingDefault || 'minimal',
            compactionMode: next.compaction?.mode || 'safeguard',
            maxConcurrent: typeof next.maxConcurrent === 'number' ? String(next.maxConcurrent) : '4',
            subagentsMaxConcurrent:
              typeof next.subagents?.maxConcurrent === 'number' ? String(next.subagents.maxConcurrent) : '8',
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setOpenclawError(msg || 'Failed to load OpenClaw agents');
      setOpenclawAgents([]);
      setOpenclawDefaults(null);
    } finally {
      setOpenclawLoading(false);
    }
  }, [editingDefaults]);

  React.useEffect(() => {
    void refreshOpenClawAgents();

    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await fetch('/api/agents?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json();
      setAgents(json.items ?? []);
    }, 30_000);

    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | null = null;
    getPocketBaseClient()
      .then(async (pb) => {
        if (cancelled) return;
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        await pb.collection('agents').subscribe('*', (e: PBRealtimeEvent<Agent>) => {
          if (!e?.record) return;
          setAgents((prev) => {
            if (e.action === 'delete') return prev.filter((agent) => agent.id !== e.record.id);
            const idx = prev.findIndex((agent) => agent.id === e.record.id);
            const next = [...prev];
            if (idx === -1) next.push(e.record);
            else next[idx] = e.record;
            return next;
          });
        });
        unsubscribe = async () => pb.collection('agents').unsubscribe('*');
      })
      .catch(() => {
        // keep polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }, [refreshOpenClawAgents]);

  async function createAgent(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const id = form.id.trim();
      const name = form.name.trim();
      const emoji = form.emoji.trim();
      const role = form.role.trim();
      const workspace = form.workspace.trim() || (id ? `agents/${id}` : '');
      const seedCreatesWorkspace = Boolean(form.createWorkspace || form.createOpenClaw);

      const res = await mcFetch('/api/agents/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          role,
          modelTier: form.modelTier,
          createWorkspace: seedCreatesWorkspace,
          workspace,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create agent');

      let openclawResult: any = null;
      if (form.createOpenClaw) {
        const ocRes = await mcFetch('/api/openclaw/agents/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            agentId: id,
            name,
            emoji,
            role,
            workspace,
            scaffoldWorkspace: false,
          }),
        });
        const ocJson = await ocRes.json().catch(() => null);
        if (!ocRes.ok) {
          throw new Error(ocJson?.error || 'Created roster entry, but OpenClaw agent creation failed.');
        }
        openclawResult = ocJson;
      }

      if (json.workspaceError) {
        setSuccess(`Created agent ${json.agent?.openclawAgentId || id}. Workspace error: ${json.workspaceError}`);
      } else {
        setSuccess(`Created agent ${json.agent?.openclawAgentId || id}${openclawResult ? ' + OpenClaw agent' : ''}`);
      }
      setForm((prev) => ({ ...prev, id: '', name: '', emoji: '', role: '', workspace: '', createOpenClaw: false }));
      if (openclawResult) await refreshOpenClawAgents();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  }

  const byPocketId = React.useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents) map.set(displayAgentId(a), a);
    return map;
  }, [agents]);

  const byOpenClawId = React.useMemo(() => {
    const map = new Map<string, OpenClawAgent>();
    for (const a of openclawAgents) map.set(a.id, a);
    return map;
  }, [openclawAgents]);

  const unionIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) set.add(displayAgentId(a));
    for (const a of openclawAgents) set.add(a.id);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agents, openclawAgents]);

  async function importFromOpenClaw(oc: OpenClawAgent) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/agents/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: oc.id,
          name: oc.identityName || oc.id,
          role: 'Agent',
          modelTier: 'mid',
          createWorkspace: false,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to add agent');
      setSuccess(`Imported ${oc.id} into Mission Control.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to add agent');
    }
  }

  async function saveIdentity() {
    if (!identityEdit) return;
    setSavingIdentity(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/openclaw/agents/identity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: identityEdit.agentId,
          name: identityEdit.name,
          emoji: identityEdit.emoji,
          fromIdentity: identityEdit.fromIdentity,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to update identity');
      setSuccess(`Updated OpenClaw identity for ${identityEdit.agentId}.`);
      setIdentityEdit(null);
      await refreshOpenClawAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to update identity');
    } finally {
      setSavingIdentity(false);
    }
  }

  async function saveModelOverride() {
    if (!modelEdit) return;
    setSavingModel(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/openclaw/agents/model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: modelEdit.agentId, model: modelEdit.model }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to update model');
      setSuccess(`Updated model for ${modelEdit.agentId}. Restart OpenClaw if it does not apply immediately.`);
      setModelEdit(null);
      await refreshOpenClawAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to update model');
    } finally {
      setSavingModel(false);
    }
  }

  async function saveDefaults() {
    if (!openclawDefaults) return;
    setSavingDefaults(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {};

      if (defaultsDraft.thinkingDefault) payload.thinkingDefault = defaultsDraft.thinkingDefault;
      if (defaultsDraft.compactionMode) payload.compactionMode = defaultsDraft.compactionMode;
      if (defaultsDraft.workspace.trim()) payload.workspace = defaultsDraft.workspace.trim();
      if (defaultsDraft.modelPrimary.trim()) payload.modelPrimary = defaultsDraft.modelPrimary.trim();

      const fallbacks = defaultsDraft.modelFallbacks
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (fallbacks.length) payload.modelFallbacks = fallbacks;

      const max = Number.parseInt(defaultsDraft.maxConcurrent, 10);
      if (Number.isFinite(max) && max > 0) payload.maxConcurrent = max;

      const subMax = Number.parseInt(defaultsDraft.subagentsMaxConcurrent, 10);
      if (Number.isFinite(subMax) && subMax > 0) payload.subagentsMaxConcurrent = subMax;

      const res = await fetch('/api/openclaw/agents/defaults', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to update defaults');

      setOpenclawDefaults((json?.defaults as OpenClawAgentDefaults) || null);
      setEditingDefaults(false);
      setSuccess('Updated OpenClaw agent defaults. (Restart OpenClaw if changes do not apply immediately.)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to update defaults');
    } finally {
      setSavingDefaults(false);
    }
  }

  async function createOpenClawAgentFor(id: string) {
    setError(null);
    setSuccess(null);
    try {
      const agent = byPocketId.get(id) || null;
      const oc = byOpenClawId.get(id) || null;
      if (oc) return;
      const workspace = `agents/${id}`;
      const res = await fetch('/api/openclaw/agents/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: id,
          name: agent?.displayName || id,
          emoji: '',
          role: agent?.role || 'Agent',
          workspace,
          scaffoldWorkspace: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to create OpenClaw agent');
      setSuccess(`Created OpenClaw agent ${id}.`);
      await refreshOpenClawAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to create OpenClaw agent');
    }
  }

  async function deleteOpenClawAgentFor(id: string) {
    setError(null);
    setSuccess(null);
    if (!window.confirm(`Delete OpenClaw agent "${id}"? This will prune agent state and workspace.`)) return;
    try {
      const res = await fetch('/api/openclaw/agents/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: id, force: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to delete OpenClaw agent');
      setSuccess(`Deleted OpenClaw agent ${id}.`);
      await refreshOpenClawAgents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to delete OpenClaw agent');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Add agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={createAgent} className="space-y-3">
            <Input
              value={form.id}
              onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="Agent ID (e.g. coco)"
            />
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Display name"
            />
            <Input
              value={form.emoji}
              onChange={(e) => setForm((prev) => ({ ...prev, emoji: e.target.value }))}
              placeholder="Emoji (optional)"
            />
            <Input
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              placeholder="Role (optional)"
            />
            <Input
              value={form.workspace}
              onChange={(e) => setForm((prev) => ({ ...prev, workspace: e.target.value }))}
              placeholder="Workspace path (default: agents/<id>)"
            />
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {['cheap', 'mid', 'expensive'].map((tier) => (
                <Button
                  key={tier}
                  type="button"
                  size="sm"
                  variant={form.modelTier === tier ? 'default' : 'secondary'}
                  onClick={() => setForm((prev) => ({ ...prev, modelTier: tier }))}
                >
                  {tier}
                </Button>
                ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.createWorkspace}
                onChange={(e) => setForm((prev) => ({ ...prev, createWorkspace: e.target.checked }))}
              />
              Scaffold workspace files (recommended)
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.createOpenClaw}
                onChange={(e) => setForm((prev) => ({ ...prev, createOpenClaw: e.target.checked }))}
              />
              Create OpenClaw agent now
            </label>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? 'Creating...' : 'Create agent'}
            </Button>
          </form>
          {error && <div className="text-xs text-red-600">{error}</div>}
          {success && <div className="text-xs text-emerald-600">{success}</div>}
          <div className="text-xs text-muted">
            New agent IDs map to OpenClaw session keys like <span className="font-mono">agent:&lt;id&gt;:main</span>. Creating
            an OpenClaw agent is optional.
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>OpenClaw</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditingDefaults((v) => !v)}
                disabled={!openclawDefaults || openclawLoading}
              >
                {editingDefaults ? 'Close' : 'Edit defaults'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void refreshOpenClawAgents()}
                disabled={openclawLoading}
              >
                {openclawLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {openclawError ? <div className="text-xs text-red-600">{openclawError}</div> : null}
          {openclawDefaultsError ? <div className="text-xs text-amber-700">{openclawDefaultsError}</div> : null}
          {!openclawError ? (
            <div className="text-xs text-muted">
              OpenClaw agents live in OpenClaw&apos;s config/state. Mission Control agents are the roster used for tasks.
              If an agent exists in OpenClaw but not Mission Control, you can import it (no changes to OpenClaw).
            </div>
          ) : null}
          {openclawDefaults ? (
            <div className="mt-3 grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted sm:grid-cols-2">
              <div className="truncate">
                Default model:{' '}
                <span className="font-mono text-[var(--foreground)]">{openclawDefaults.model?.primary || '—'}</span>
              </div>
              <div className="truncate">
                Thinking:{' '}
                <span className="font-mono text-[var(--foreground)]">{openclawDefaults.thinkingDefault || '—'}</span>
              </div>
              <div className="truncate">
                Workspace:{' '}
                <span className="font-mono text-[var(--foreground)]">{openclawDefaults.workspace || '—'}</span>
              </div>
              <div className="truncate">
                Compaction:{' '}
                <span className="font-mono text-[var(--foreground)]">{openclawDefaults.compaction?.mode || '—'}</span>
              </div>
              <div className="truncate">
                Max concurrent:{' '}
                <span className="font-mono text-[var(--foreground)]">
                  {typeof openclawDefaults.maxConcurrent === 'number' ? openclawDefaults.maxConcurrent : '—'}
                </span>
              </div>
              <div className="truncate">
                Subagents:{' '}
                <span className="font-mono text-[var(--foreground)]">
                  {typeof openclawDefaults.subagents?.maxConcurrent === 'number'
                    ? openclawDefaults.subagents.maxConcurrent
                    : '—'}
                </span>
              </div>
              {Array.isArray(openclawDefaults.model?.fallbacks) && openclawDefaults.model!.fallbacks!.length ? (
                <div className="sm:col-span-2">
                  Fallbacks:{' '}
                  <span className="font-mono text-[var(--foreground)]">{openclawDefaults.model!.fallbacks!.join(', ')}</span>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                Advanced: edit full config in <Link className="underline" href="/openclaw/config">OpenClaw Config</Link>.
              </div>
            </div>
          ) : null}

          {editingDefaults && openclawDefaults ? (
            <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Edit Agent Defaults</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted">Thinking default</div>
                  <select
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
                    value={defaultsDraft.thinkingDefault}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, thinkingDefault: e.target.value }))}
                  >
                    {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted">Compaction mode</div>
                  <select
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--foreground)]"
                    value={defaultsDraft.compactionMode}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, compactionMode: e.target.value }))}
                  >
                    {['off', 'safeguard', 'auto', 'manual'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="text-xs text-muted">Workspace</div>
                  <Input
                    value={defaultsDraft.workspace}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, workspace: e.target.value }))}
                    placeholder="/path/to/workspace"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="text-xs text-muted">Default model primary</div>
                  <Input
                    value={defaultsDraft.modelPrimary}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, modelPrimary: e.target.value }))}
                    placeholder="provider/model (e.g. openai-codex/gpt-5.1-codex-mini)"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="text-xs text-muted">Fallback models (comma separated)</div>
                  <Input
                    value={defaultsDraft.modelFallbacks}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, modelFallbacks: e.target.value }))}
                    placeholder="openai-codex/gpt-5.1-codex-mini, openai-codex/gpt-5.2"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted">Max concurrent</div>
                  <Input
                    value={defaultsDraft.maxConcurrent}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, maxConcurrent: e.target.value }))}
                    placeholder="4"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted">Subagents max concurrent</div>
                  <Input
                    value={defaultsDraft.subagentsMaxConcurrent}
                    onChange={(e) => setDefaultsDraft((p) => ({ ...p, subagentsMaxConcurrent: e.target.value }))}
                    placeholder="8"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void saveDefaults()} disabled={savingDefaults}>
                  {savingDefaults ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!openclawDefaults) return;
                    setDefaultsDraft({
                      modelPrimary: openclawDefaults.model?.primary || '',
                      modelFallbacks: Array.isArray(openclawDefaults.model?.fallbacks)
                        ? openclawDefaults.model!.fallbacks!.join(', ')
                        : '',
                      workspace: openclawDefaults.workspace || '',
                      thinkingDefault: openclawDefaults.thinkingDefault || 'minimal',
                      compactionMode: openclawDefaults.compaction?.mode || 'safeguard',
                      maxConcurrent:
                        typeof openclawDefaults.maxConcurrent === 'number' ? String(openclawDefaults.maxConcurrent) : '4',
                      subagentsMaxConcurrent:
                        typeof openclawDefaults.subagents?.maxConcurrent === 'number'
                          ? String(openclawDefaults.subagents.maxConcurrent)
                          : '8',
                    });
                    setEditingDefaults(false);
                  }}
                  disabled={savingDefaults}
                >
                  Cancel
                </Button>
                <div className="text-xs text-muted">Writes via `openclaw config set`. Restart may be required.</div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {unionIds.map((id) => {
        const agent = byPocketId.get(id) || null;
        const oc = byOpenClawId.get(id) || null;
        const title = agent?.displayName || oc?.identityName || id;
        const emoji = oc?.identityEmoji || '';
        const editingThis = identityEdit?.agentId === id;
        const editingModelThis = modelEdit?.agentId === id;

        return (
          <Card key={id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {emoji ? <span className="mr-2">{emoji}</span> : null}
                  {title}
                </span>
                <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{id}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted">{agent?.role || 'Agent'}</div>

              <div className="flex flex-wrap gap-2">
                <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">
                  {agent?.status || 'not in roster'}
                </Badge>
                <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
                  OpenClaw: {oc ? 'yes' : 'no'}
                </Badge>
              </div>

              {oc ? (
                <div className="space-y-1 text-xs text-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate">
                      Identity:{' '}
                      <span className="text-[var(--foreground)]">
                        {(oc.identityEmoji || '') + ' ' + (oc.identityName || oc.id)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setIdentityEdit({
                          agentId: id,
                          name: oc.identityName || '',
                          emoji: oc.identityEmoji || '',
                          fromIdentity: false,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="truncate">
                      Model: <span className="font-mono text-[var(--foreground)]">{oc.model || 'default'}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setModelEdit({ agentId: id, model: oc.model || '' })}
                    >
                      Set model
                    </Button>
                  </div>
                  <div className="truncate">
                    Workspace: <span className="font-mono text-[var(--foreground)]">{oc.workspace || '—'}</span>
                  </div>
                </div>
              ) : null}

              {oc && editingThis ? (
                <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Edit OpenClaw Identity</div>
                  <Input
                    value={identityEdit?.name || ''}
                    onChange={(e) => setIdentityEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                    placeholder="Name (optional)"
                  />
                  <Input
                    value={identityEdit?.emoji || ''}
                    onChange={(e) => setIdentityEdit((prev) => (prev ? { ...prev, emoji: e.target.value } : prev))}
                    placeholder="Emoji (optional)"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(identityEdit?.fromIdentity)}
                      onChange={(e) =>
                        setIdentityEdit((prev) => (prev ? { ...prev, fromIdentity: e.target.checked } : prev))
                      }
                    />
                    Load from IDENTITY.md (best-effort)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void saveIdentity()} disabled={savingIdentity}>
                      {savingIdentity ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setIdentityEdit(null)} disabled={savingIdentity}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {oc && editingModelThis ? (
                <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Model Override</div>
                  <Input
                    value={modelEdit?.model || ''}
                    onChange={(e) => setModelEdit((prev) => (prev ? { ...prev, model: e.target.value } : prev))}
                    placeholder="provider/model (empty = inherit defaults)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void saveModelOverride()} disabled={savingModel}>
                      {savingModel ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setModelEdit(null)}
                      disabled={savingModel}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setModelEdit((prev) => (prev ? { ...prev, model: '' } : prev))}
                      disabled={savingModel}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="text-xs text-muted">
                    Writes to <span className="font-mono">agents.list[].model</span> in OpenClaw config. Restart may be required.
                  </div>
                </div>
              ) : null}

              {agent ? (
                <div className="space-y-1 text-xs text-muted">
                  <div>Last seen: {formatShortDate(agent.lastSeenAt)}</div>
                  <div>Last worklog: {formatShortDate(agent.lastWorklogAt)}</div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/agents/${encodeURIComponent(id)}`}>
                  <Button size="sm" variant="secondary">
                    Chat
                  </Button>
                </Link>
                <Link href={`/agents/${encodeURIComponent(id)}/vault`}>
                  <Button size="sm" variant="secondary">
                    Credentials
                  </Button>
                </Link>
                <Link href="/tasks">
                  <Button size="sm" variant="secondary">
                    View tasks
                  </Button>
                </Link>
                {!agent && oc ? (
                  <Button size="sm" onClick={() => void importFromOpenClaw(oc)}>
                    Import
                  </Button>
                ) : null}
                {agent && !oc ? (
                  <Button size="sm" onClick={() => void createOpenClawAgentFor(id)}>
                    Create OpenClaw
                  </Button>
                ) : null}
                {agent && !oc ? (
                  <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">OpenClaw missing</Badge>
                ) : null}
                {oc && !oc.isDefault && id !== 'main' ? (
                  <Button size="sm" variant="secondary" onClick={() => void deleteOpenClawAgentFor(id)}>
                    Delete OpenClaw
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!agents.length && !openclawAgents.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No agents yet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted">Run the bootstrap script to seed the lead agent.</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
