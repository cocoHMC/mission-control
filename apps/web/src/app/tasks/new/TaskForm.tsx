'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';
import { buildVaultHintMarkdown, upsertVaultHintMarkdown } from '@/lib/vaultHint';

type Agent = { id: string; displayName?: string; openclawAgentId?: string };
type NodeRecord = { id: string; displayName?: string; nodeId?: string };
type Project = { id: string; name?: string; archived?: boolean; status?: string };
type OpenClawNode = {
  nodeId?: string;
  displayName?: string;
  remoteIp?: string;
  platform?: string;
  paired?: boolean;
  connected?: boolean;
};
type OpenClawNodesStatus = {
  nodes?: OpenClawNode[];
};

type OpenClawModelRow = { key: string; name?: string };
type ModelCapabilitiesByKey = Record<string, { reasoningSupported?: boolean | null; thinkingLevels?: string[] }>;

function inferTierFromModelKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('vision')) return 'vision';
  if (k.includes('codex') || k.includes('/code') || k.includes('code-')) return 'code';
  if (k.includes('mini') || k.includes('lite') || k.includes('small')) return 'cheap';
  if (k.includes('max') || k.includes('pro') || k.includes('ultra') || k.includes('opus')) return 'heavy';
  return 'balanced';
}

function providerFromModelKey(key: string): string {
  const idx = key.indexOf('/');
  return idx > 0 ? key.slice(0, idx) : 'unknown';
}

export function TaskForm({
  agents,
  nodes,
  projects,
  onCreated,
  initialStartAt,
  initialDueAt,
  initialProjectId,
}: {
  agents: Agent[];
  nodes: NodeRecord[];
  projects: Project[];
  onCreated?: (taskId?: string) => void;
  initialStartAt?: string;
  initialDueAt?: string;
  initialProjectId?: string;
}) {
  const router = useRouter();
  const leadAgentId = process.env.NEXT_PUBLIC_MC_LEAD_AGENT_ID || 'main';
  const [pending, setPending] = React.useState(false);
  const [projectId, setProjectId] = React.useState(initialProjectId || '');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [context, setContext] = React.useState('');
  const [priority, setPriority] = React.useState('p2');
  const [aiThinking, setAiThinking] = React.useState('auto');
  const [aiModelTier, setAiModelTier] = React.useState('auto');
  const [aiModel, setAiModel] = React.useState('');
  const [aiProvider, setAiProvider] = React.useState('auto');
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [labels, setLabels] = React.useState('');
  const [requiredNodeId, setRequiredNodeId] = React.useState('');
  const [startAt, setStartAt] = React.useState(() => toDateTimeLocalValue(initialStartAt));
  const [dueAt, setDueAt] = React.useState(() => toDateTimeLocalValue(initialDueAt));
  const [requiresReview, setRequiresReview] = React.useState(false);
  const [subtasks, setSubtasks] = React.useState<{ id: string; title: string }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState('');
  const [openclawNodes, setOpenclawNodes] = React.useState<OpenClawNode[]>([]);
  const [modelCatalog, setModelCatalog] = React.useState<OpenClawModelRow[] | null>(null);
  const [modelCaps, setModelCaps] = React.useState<ModelCapabilitiesByKey>({});

  const [vaultAgent, setVaultAgent] = React.useState<string>('');
  const [vaultHandle, setVaultHandle] = React.useState<string>('');
  const [vaultItems, setVaultItems] = React.useState<
    Array<{ id: string; handle: string; type?: string; service?: string; disabled?: boolean; exposureMode?: string }>
  >([]);
  const [vaultQuery, setVaultQuery] = React.useState('');
  const [vaultLoading, setVaultLoading] = React.useState(false);
  const [vaultLoadError, setVaultLoadError] = React.useState<string | null>(null);
  const [includeVaultHintInDescription, setIncludeVaultHintInDescription] = React.useState(true);

  React.useEffect(() => {
    setProjectId(initialProjectId || '');
  }, [initialProjectId]);

  React.useEffect(() => {
    // Best-effort live node list from OpenClaw (no PocketBase sync required).
    // Falls back to Mission Control's nodes collection if OpenClaw CLI is unavailable.
    let cancelled = false;
    mcFetch('/api/openclaw/nodes/status', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) return;
        const next = (json?.status as OpenClawNodesStatus) || null;
        const list = Array.isArray(next?.nodes) ? next!.nodes! : [];
        setOpenclawNodes(list.filter((n) => n && n.nodeId));
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    // Best-effort: populate suggestions for explicit model overrides.
    let cancelled = false;
    mcFetch('/api/openclaw/models/list', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) return;
        setModelCaps((json?.capabilitiesByKey as ModelCapabilitiesByKey) || {});
        const models = Array.isArray(json?.models) ? (json.models as any[]) : [];
        const rows = models
          .map((m) => {
            const key = typeof m?.key === 'string' ? m.key.trim() : '';
            const name = typeof m?.name === 'string' ? m.name.trim() : '';
            if (!key) return null;
            return { key, name: name || undefined };
          })
          .filter(Boolean) as OpenClawModelRow[];
        rows.sort((a, b) => a.key.localeCompare(b.key));
        setModelCatalog(rows);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reasoningSupported = React.useMemo(() => {
    const key = String(aiModel || '').trim();
    if (!key) return null;
    const cap = modelCaps[key];
    if (!cap) return null;
    return typeof cap.reasoningSupported === 'boolean' ? cap.reasoningSupported : null;
  }, [aiModel, modelCaps]);

  React.useEffect(() => {
    // If the selected model doesn't support reasoning controls, force Auto.
    if (reasoningSupported === false) {
      setAiThinking('auto');
    }
  }, [reasoningSupported]);

  function makeLocalId() {
    try {
      // Browser only (this is a client component).
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function addSubtask() {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { id: makeLocalId(), title: t }]);
    setNewSubtaskTitle('');
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  function moveSubtask(id: string, dir: -1 | 1) {
    setSubtasks((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    const labelList = labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);

    const selected = vaultHandle.trim();
    const selectedItem = selected ? vaultItems.find((it) => it.handle === selected) : null;
    const hint = selected && includeVaultHintInDescription
      ? buildVaultHintMarkdown({ handle: selected, includeUsernameRef: selectedItem?.type === 'username_password' })
      : '';
    const descriptionWithHint = hint ? upsertVaultHintMarkdown(description, hint) : description;

    const res = await mcFetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        projectId,
        description: descriptionWithHint,
        context,
        vaultItem: vaultHandle.trim() || '',
        priority,
        aiEffort: 'auto',
        aiThinking,
        aiModelTier,
        aiModel,
        assigneeIds: assignees,
        status: assignees.length ? 'assigned' : 'inbox',
        labels: labelList,
        requiredNodeId: requiredNodeId || '',
        startAt: fromDateTimeLocalValue(startAt) || '',
        dueAt: fromDateTimeLocalValue(dueAt) || '',
        requiresReview,
        ...(requiresReview
          ? {
              reviewChecklist: {
                version: 1,
                items: [
                  { id: 'deliverable', label: 'Deliverable attached (doc/link/file)', done: false },
                  { id: 'tests', label: 'Tests or smoke checks passed', done: false },
                  { id: 'deploy', label: 'Deploy / runtime verified (if applicable)', done: false },
                ],
              },
            }
          : {}),
      }),
    });
    if (!res.ok) {
      setPending(false);
      return;
    }
    const created = await res.json().catch(() => null);
    const taskId = created?.id as string | undefined;

    if (taskId && subtasks.length) {
      // Create initial subtasks deterministically (no LLM). We do this after creating
      // the task so we have the real taskId.
      const baseOrder = Date.now();
      for (let i = 0; i < subtasks.length; i++) {
        const s = subtasks[i];
        if (!s?.title?.trim()) continue;
        await mcFetch('/api/subtasks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskId, title: s.title.trim(), order: baseOrder + i }),
        });
      }
      // Update aggregate fields immediately so the board shows progress without waiting
      // for the worker to recompute.
      await mcFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subtasksTotal: subtasks.length, subtasksDone: 0 }),
      });
    }
    setPending(false);
    if (onCreated) {
      onCreated(taskId);
      router.refresh();
      return;
    }
    router.push('/tasks');
    router.refresh();
  }

  const providers = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const m of modelCatalog || []) {
      const p = providerFromModelKey(m.key);
      map.set(p, (map.get(p) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([provider]) => provider);
  }, [modelCatalog]);

  const modelsForProvider = React.useMemo(() => {
    const p = String(aiProvider || '').trim();
    if (!p || p === 'auto') return [];
    return (modelCatalog || []).filter((m) => providerFromModelKey(m.key) === p);
  }, [modelCatalog, aiProvider]);

  function toggleAssignee(id: string, fallbackId: string) {
    setAssignees((prev) => {
      const has = prev.includes(id) || prev.includes(fallbackId);
      const next = prev.filter((a) => a !== id && a !== fallbackId);
      if (!has) next.push(id);
      return next;
    });
  }

  const effectiveVaultAgent = React.useMemo(() => {
    const explicit = String(vaultAgent || '').trim();
    if (explicit) return explicit;
    if (assignees.length) return String(assignees[0] || '').trim();
    return leadAgentId;
  }, [assignees, leadAgentId, vaultAgent]);

  React.useEffect(() => {
    // If the selected credential agent falls out of the assignee set, reset back to Auto.
    const a = String(vaultAgent || '').trim();
    if (!a) return;
    if (!assignees.length) return;
    if (assignees.includes(a)) return;
    setVaultAgent('');
  }, [assignees, vaultAgent]);

  React.useEffect(() => {
    let cancelled = false;
    const agent = String(effectiveVaultAgent || '').trim();
    if (!agent) {
      setVaultItems([]);
      setVaultLoadError(null);
      return;
    }
    setVaultLoading(true);
    setVaultLoadError(null);
    mcFetch(`/api/vault/agents/${encodeURIComponent(agent)}/items`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json || json.ok === false) {
          setVaultItems([]);
          setVaultLoadError(String(json?.error || 'Failed to load credentials'));
          return;
        }
        const items = Array.isArray(json?.items) ? (json.items as any[]) : [];
        const rows = items
          .map((it) => {
            const id = String(it?.id || '').trim();
            const handle = String(it?.handle || '').trim();
            if (!id || !handle) return null;
            return {
              id,
              handle,
              type: typeof it?.type === 'string' ? it.type : '',
              service: typeof it?.service === 'string' ? it.service : '',
              disabled: Boolean(it?.disabled),
              exposureMode: typeof it?.exposureMode === 'string' ? it.exposureMode : '',
            };
          })
          .filter(Boolean) as Array<{ id: string; handle: string; type?: string; service?: string; disabled?: boolean; exposureMode?: string }>;
        rows.sort(
          (a, b) =>
            String(a.service || '').localeCompare(String(b.service || '')) || String(a.handle || '').localeCompare(String(b.handle || ''))
        );
        setVaultItems(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setVaultItems([]);
        setVaultLoadError(err?.message || String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setVaultLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveVaultAgent]);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="text-sm font-medium">Title</label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ship OpenClaw node onboarding" />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, success criteria, or links." />
      </div>
      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">Deep context (optional)</summary>
        <div className="mt-2 text-xs text-muted">
          Paste long Markdown context (research, articles, specs). Mission Control won&apos;t push this into agent chats
          automatically—agents should pull it when needed to avoid token spikes.
        </div>
        <Textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="Long context in Markdown..."
          className="mt-3 min-h-[200px]"
        />
      </details>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Project</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">No project</option>
            {(projects || [])
              .filter((p) => !p.archived && String(p.status || 'active') !== 'archived')
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || project.id}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Priority</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            {['p0', 'p1', 'p2', 'p3'].map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Reasoning</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={aiThinking}
            onChange={(event) => setAiThinking(event.target.value)}
            disabled={reasoningSupported === false}
          >
            <option value="auto">Auto (agent default)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="xhigh">Extra high</option>
          </select>
          <div className="mt-2 text-xs text-muted">
            {reasoningSupported === false ? (
              <>
                Reasoning controls aren&apos;t supported by the selected model, so this will stay on Auto.
              </>
            ) : (
              <>
                Sets the per-task <span className="font-mono">/t</span> directive (how hard it thinks).
              </>
            )}
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="text-sm font-medium">Model</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-muted">Provider</label>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                value={aiProvider}
                onChange={(event) => {
                  const next = event.target.value;
                  setAiProvider(next);
                  if (next === 'auto') {
                    setAiModel('');
                    setAiModelTier('auto');
                    return;
                  }
                  // If switching providers, clear the model selection until user picks.
                  setAiModel('');
                }}
              >
                <option value="auto">Auto (agent default)</option>
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-muted">Model</label>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                value={aiModel}
                onChange={(event) => {
                  const next = event.target.value;
                  setAiModel(next);
                  if (!next) return;
                  // Keep a sensible fallback tier for humans (even though explicit model wins).
                  if (aiModelTier === 'auto' || !aiModelTier) setAiModelTier(inferTierFromModelKey(next));
                }}
                disabled={aiProvider === 'auto'}
              >
                <option value="">{aiProvider === 'auto' ? '(select provider first)' : 'Auto (no override)'}</option>
                {modelsForProvider.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.key}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted">
            Picks an exact OpenClaw model from what’s currently connected (via <span className="font-mono">openclaw models list</span>).
            If unset, Mission Control falls back to Model tier.
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Model tier (fallback)</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={aiModelTier}
            onChange={(event) => setAiModelTier(event.target.value)}
          >
            <option value="auto">Auto (agent default)</option>
            <option value="cheap">Cheap</option>
            <option value="balanced">Balanced</option>
            <option value="heavy">Heavy</option>
            <option value="code">Code</option>
            <option value="vision">Vision</option>
          </select>
          <div className="mt-2 text-xs text-muted">
            Used only when no exact model is selected (sends <span className="font-mono">/model cheap|balanced|...</span>).
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Execution device (optional)</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={requiredNodeId}
            onChange={(event) => setRequiredNodeId(event.target.value)}
          >
            <option value="">Gateway (this machine)</option>
            {(openclawNodes.length
              ? openclawNodes.map((n) => ({
                  id: n.nodeId || '',
                  label: `${n.displayName || n.nodeId}${n.remoteIp ? ` (${n.remoteIp})` : ''}`,
                }))
              : nodes.map((node) => ({
                  id: node.nodeId ?? node.id,
                  label: node.displayName ?? node.nodeId ?? node.id,
                }))
            ).map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-muted">
            Nodes are paired devices from OpenClaw. This does <span className="font-medium text-[var(--foreground)]">not</span> change who is assigned.
            Sync nodes on the <Link href="/nodes" className="underline underline-offset-2">Nodes</Link> page.
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Assignee agents</label>
          <div className="mt-2 grid gap-2">
            {agents.map((agent) => {
              const key = agent.openclawAgentId ?? agent.id;
              const checked = assignees.includes(key) || assignees.includes(agent.id);
              return (
              <label key={agent.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAssignee(key, agent.id)}
                />
                <span className="flex-1">{agent.displayName ?? agent.id}</span>
                <span className="font-mono text-xs text-muted">@{key}</span>
              </label>
            );})}
            {!agents.length && (
              <div className="text-xs text-muted">
                No agents yet. Create one on the <Link href="/agents" className="underline underline-offset-2">Agents</Link> page.
              </div>
            )}
          </div>
          <div className="mt-2 text-xs text-muted">
            Agents are OpenClaw personas (brains). Add more on the <Link href="/agents" className="underline underline-offset-2">Agents</Link> page.
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Credential (Vault)</div>
                <div className="mt-1 text-xs text-muted">
                  Pick a stored handle to guide the agent. The model sees only <span className="font-mono">{'{{vault:HANDLE}}'}</span>.
                </div>
              </div>
              <div className="text-xs text-muted">
                Using agent <span className="font-mono text-[var(--foreground)]">@{effectiveVaultAgent}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Agent for credential</label>
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  value={vaultAgent}
                  onChange={(e) => setVaultAgent(e.target.value)}
                >
                  <option value="">Auto (first assignee / lead)</option>
                  {assignees.map((a) => (
                    <option key={a} value={a}>
                      @{a}
                    </option>
                  ))}
                  {!assignees.length ? <option value={leadAgentId}>@{leadAgentId}</option> : null}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Search</label>
                <Input
                  value={vaultQuery}
                  onChange={(e) => setVaultQuery(e.target.value)}
                  placeholder="github, stripe, aws, …"
                  className="mt-2"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={vaultHandle}
                onChange={(e) => setVaultHandle(e.target.value)}
                placeholder="(optional) handle, e.g. github_pat"
                autoCapitalize="none"
                spellCheck={false}
              />
              <Button type="button" variant="secondary" onClick={() => setVaultHandle('')} disabled={!vaultHandle.trim()}>
                Clear
              </Button>
              {vaultHandle.trim() ? <CopyButton value={`{{vault:${vaultHandle.trim()}}}`} label="Copy placeholder" /> : null}
            </div>

            <label className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={includeVaultHintInDescription}
                onChange={(e) => setIncludeVaultHintInDescription(e.target.checked)}
                disabled={!vaultHandle.trim()}
              />
              <span>
                Add a credential hint block to Description (recommended)
              </span>
            </label>

            {vaultLoadError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{vaultLoadError}</div>
            ) : null}

            <div className="mt-3 max-h-[220px] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
              {vaultLoading ? <div className="px-3 py-3 text-sm text-muted">Loading…</div> : null}
              {!vaultLoading &&
                (vaultItems || [])
                  .filter((it) => {
                    const q = vaultQuery.trim().toLowerCase();
                    if (!q) return true;
                    const hay = `${it.handle} ${it.service || ''} ${it.type || ''}`.toLowerCase();
                    return hay.includes(q);
                  })
                  .slice(0, 80)
                  .map((it) => {
                    const disabled = Boolean(it.disabled);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                          disabled ? 'bg-amber-50 text-amber-900' : 'hover:bg-[color:var(--foreground)]/5'
                        }`}
                        onClick={() => {
                          setVaultHandle(it.handle);
                          setIncludeVaultHintInDescription(true);
                        }}
                        disabled={disabled}
                        title={disabled ? 'Disabled credential' : 'Select credential'}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[11px] text-[var(--foreground)]">{it.handle}</div>
                          <div className="mt-1 truncate text-xs text-muted">
                            {it.service || '—'}{it.type ? ` · ${it.type}` : ''}{it.exposureMode ? ` · ${it.exposureMode}` : ''}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-muted">{disabled ? 'disabled' : 'select'}</div>
                      </button>
                    );
                  })}
              {!vaultLoading && !vaultItems.length ? <div className="px-3 py-3 text-sm text-muted">No credentials yet.</div> : null}
            </div>

            <div className="mt-2 text-[11px] text-muted">
              Tip: store API keys as <span className="font-mono">inject-only</span> and pass placeholders to tools. Avoid revealing secrets in the UI.
            </div>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Labels</label>
          <Input
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            placeholder="comma, separated, tags"
            className="mt-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Start</label>
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2" />
        </div>
        <div>
          <label className="text-sm font-medium">Due</label>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-2" />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm">
            <input type="checkbox" checked={requiresReview} onChange={(e) => setRequiresReview(e.target.checked)} />
            Requires review (otherwise auto-done)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold">Subtasks</div>
          <div className="text-xs text-muted">{subtasks.length}</div>
        </div>
        <div className="mt-4 space-y-2">
          {subtasks.map((s, idx) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <div className="flex-1">{s.title}</div>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="secondary" onClick={() => moveSubtask(s.id, -1)} disabled={idx === 0}>
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => moveSubtask(s.id, 1)}
                  disabled={idx === subtasks.length - 1}
                >
                  Down
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => removeSubtask(s.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {!subtasks.length ? <div className="text-sm text-muted">No subtasks yet.</div> : null}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Input
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            placeholder="New subtask..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubtask();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addSubtask} disabled={!newSubtaskTitle.trim()}>
            Add
          </Button>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Creating...' : 'Create task'}
      </Button>
    </form>
  );
}
