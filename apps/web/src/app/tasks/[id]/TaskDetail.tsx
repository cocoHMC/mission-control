'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MentionsTextarea } from '@/components/mentions/MentionsTextarea';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/ui/copy-button';
import { cn, formatShortDate, fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/utils';
import type { Agent, DocumentRecord, Message, NodeRecord, Subtask, Task, TaskFile } from '@/lib/types';
import { mcApiUrl, mcFetch } from '@/lib/clientApi';
import { buildVaultHintMarkdown, stripVaultHintMarkdown, upsertVaultHintMarkdown } from '@/lib/vaultHint';

const STATUSES = ['inbox', 'assigned', 'in_progress', 'review', 'blocked', 'done'];
type Status = (typeof STATUSES)[number];

function normalizeSelect(value: unknown, fallback: string) {
  const s = String(value ?? '').trim();
  return s ? s : fallback;
}

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

function thinkingFromLegacyEffort(effort: unknown) {
  const v = String(effort || '')
    .trim()
    .toLowerCase();
  if (!v || v === 'auto' || v === 'default') return 'auto';
  if (v === 'efficient') return 'low';
  if (v === 'balanced') return 'medium';
  if (v === 'heavy') return 'high';
  return 'auto';
}

function sameStringArray(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameSubtasks(a: Subtask[], b: Subtask[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const aa = a[i];
    const bb = b[i];
    if (!aa || !bb) return false;
    if (aa.id !== bb.id) return false;
    if (aa.title !== bb.title) return false;
    if (Boolean(aa.done) !== Boolean(bb.done)) return false;
    if ((aa.order ?? 0) !== (bb.order ?? 0)) return false;
  }
  return true;
}

export function TaskDetail({
  task,
  agents,
  messages,
  documents,
  files,
  subtasks,
  nodes = [],
  onUpdated,
}: {
  task: Task;
  agents: Agent[];
  messages: Message[];
  documents: DocumentRecord[];
  files: TaskFile[];
  subtasks: Subtask[];
  nodes?: NodeRecord[];
  onUpdated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const leadAgentId = process.env.NEXT_PUBLIC_MC_LEAD_AGENT_ID || 'main';
  const [status, setStatus] = React.useState<Status>(task.status as Status);
  const [message, setMessage] = React.useState('');
  const [docTitle, setDocTitle] = React.useState('');
  const [docContent, setDocContent] = React.useState('');
  const [contextDraft, setContextDraft] = React.useState(task.context ?? '');
  const [editingContext, setEditingContext] = React.useState(false);
  const [assignees, setAssignees] = React.useState<string[]>(task.assigneeIds ?? []);
  const [labelsInput, setLabelsInput] = React.useState((task.labels ?? []).join(', '));
  const [requiredNodeId, setRequiredNodeId] = React.useState(task.requiredNodeId ?? '');
  const [aiThinking, setAiThinking] = React.useState(() => {
    const v = normalizeSelect(task.aiThinking, 'auto');
    return v !== 'auto' ? v : thinkingFromLegacyEffort(task.aiEffort);
  });
  const [aiModelTier, setAiModelTier] = React.useState(normalizeSelect(task.aiModelTier, 'auto'));
  const [aiModel, setAiModel] = React.useState(String(task.aiModel ?? ''));
  const [aiProvider, setAiProvider] = React.useState('auto');
  const [blockReason, setBlockReason] = React.useState('');
  const [archived, setArchived] = React.useState(Boolean(task.archived));
  const [requiresReview, setRequiresReview] = React.useState(Boolean(task.requiresReview));
  const [startAt, setStartAt] = React.useState(toDateTimeLocalValue(task.startAt));
  const [dueAt, setDueAt] = React.useState(toDateTimeLocalValue(task.dueAt));
  const [vaultAgent, setVaultAgent] = React.useState<string>('');
  const [vaultHandle, setVaultHandle] = React.useState<string>(String(task.vaultItem || ''));
  const [vaultItems, setVaultItems] = React.useState<
    Array<{ id: string; handle: string; type?: string; service?: string; disabled?: boolean; exposureMode?: string }>
  >([]);
  const [vaultQuery, setVaultQuery] = React.useState('');
  const [vaultLoading, setVaultLoading] = React.useState(false);
  const [vaultLoadError, setVaultLoadError] = React.useState<string | null>(null);
  const [subtaskItems, setSubtaskItems] = React.useState<Subtask[]>(subtasks ?? []);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState('');
  const [uploadTitle, setUploadTitle] = React.useState('');
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const [modelCatalog, setModelCatalog] = React.useState<OpenClawModelRow[] | null>(null);
  const [modelCaps, setModelCaps] = React.useState<ModelCapabilitiesByKey>({});

  const openclawAssigneeIds = React.useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();

    const lease = String(task.leaseOwnerAgentId || '').trim();
    if (lease && !seen.has(lease)) {
      seen.add(lease);
      ids.push(lease);
    }

    for (const pbId of assignees) {
      const found = agents.find((a) => a.id === pbId);
      const oc = found?.openclawAgentId;
      if (!oc) continue;
      if (seen.has(oc)) continue;
      seen.add(oc);
      ids.push(oc);
    }

    if (!ids.length && leadAgentId) ids.push(leadAgentId);
    return ids;
  }, [assignees, agents, leadAgentId, task.leaseOwnerAgentId]);

  const effectiveVaultAgent = React.useMemo(() => {
    const explicit = String(vaultAgent || '').trim();
    if (explicit) return explicit;
    if (openclawAssigneeIds.length) return String(openclawAssigneeIds[0] || '').trim();
    return leadAgentId;
  }, [leadAgentId, openclawAssigneeIds, vaultAgent]);

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

  const [chatAgentId, setChatAgentId] = React.useState(() => openclawAssigneeIds[0] || leadAgentId);

  React.useEffect(() => {
    setChatAgentId((prev) => {
      if (openclawAssigneeIds.includes(prev)) return prev;
      return openclawAssigneeIds[0] || leadAgentId;
    });
  }, [openclawAssigneeIds, leadAgentId]);

  React.useEffect(() => {
    const nextStatus = normalizeSelect(task.status, 'inbox') as Status;
    setStatus((prev) => (prev === nextStatus ? prev : nextStatus));

    const nextAssignees = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];
    setAssignees((prev) => (sameStringArray(prev, nextAssignees) ? prev : nextAssignees));

    const nextLabelsInput = (Array.isArray(task.labels) ? task.labels : []).join(', ');
    setLabelsInput((prev) => (prev === nextLabelsInput ? prev : nextLabelsInput));

    const nextRequiredNodeId = String(task.requiredNodeId ?? '');
    setRequiredNodeId((prev) => (prev === nextRequiredNodeId ? prev : nextRequiredNodeId));

    const rawThinking = normalizeSelect(task.aiThinking, 'auto');
    const nextThinking = rawThinking !== 'auto' ? rawThinking : thinkingFromLegacyEffort(task.aiEffort);
    setAiThinking((prev) => (prev === nextThinking ? prev : nextThinking));

    const nextTier = normalizeSelect(task.aiModelTier, 'auto');
    setAiModelTier((prev) => (prev === nextTier ? prev : nextTier));

    const nextModel = String(task.aiModel ?? '');
    setAiModel((prev) => (prev === nextModel ? prev : nextModel));

    const nextArchived = Boolean(task.archived);
    setArchived((prev) => (prev === nextArchived ? prev : nextArchived));

    const nextRequiresReview = Boolean(task.requiresReview);
    setRequiresReview((prev) => (prev === nextRequiresReview ? prev : nextRequiresReview));

    const nextStartAt = toDateTimeLocalValue(task.startAt);
    setStartAt((prev) => (prev === nextStartAt ? prev : nextStartAt));

    const nextDueAt = toDateTimeLocalValue(task.dueAt);
    setDueAt((prev) => (prev === nextDueAt ? prev : nextDueAt));

    const nextContextDraft = String(task.context ?? '');
    setContextDraft((prev) => (prev === nextContextDraft ? prev : nextContextDraft));

    const nextVault = String(task.vaultItem || '');
    setVaultHandle((prev) => (prev === nextVault ? prev : nextVault));

    setEditingContext(false);
  }, [
    task.id,
    task.status,
    task.assigneeIds,
    task.labels,
    task.requiredNodeId,
    task.aiThinking,
    task.aiEffort,
    task.aiModelTier,
    task.aiModel,
    task.archived,
    task.requiresReview,
    task.startAt,
    task.dueAt,
    task.context,
    task.vaultItem,
  ]);

  React.useEffect(() => {
    // Best-effort: suggestions for explicit model overrides.
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
    if (reasoningSupported === false) {
      setAiThinking('auto');
    }
  }, [reasoningSupported]);

  React.useEffect(() => {
    const next = Array.isArray(subtasks) ? subtasks : [];
    setSubtaskItems((prev) => (sameSubtasks(prev, next) ? prev : next));
  }, [task.id, subtasks]);

  React.useEffect(() => {
    // Keep provider selector in sync with current model when possible.
    const model = String(aiModel || '').trim();
    if (!model) {
      setAiProvider('auto');
      return;
    }
    setAiProvider(providerFromModelKey(model));
  }, [aiModel]);

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

  async function updateTask(payload: Record<string, unknown>) {
    await mcFetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  const mentionables = React.useMemo(() => {
    return [
      { id: 'all', label: 'Notify lead' },
      ...agents
        .map((agent) => {
          const id = agent.openclawAgentId ?? agent.id;
          const label = agent.displayName ?? id;
          return { id, label };
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    ];
  }, [agents]);

  async function archiveTask(nextArchived: boolean) {
    await updateTask({ archived: nextArchived });
    setArchived(nextArchived);
  }

  async function saveContext() {
    await updateTask({ context: contextDraft });
    setEditingContext(false);
  }

  async function deleteTask() {
    if (!window.confirm('Are you sure?')) return;
    await mcFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    router.replace('/tasks');
  }

  async function onStatusChange(value: Status) {
    setStatus(value);
    await updateTask({ status: value });
  }

  async function onAssigneeToggle(id: string, fallbackId: string) {
    const has = assignees.includes(id) || assignees.includes(fallbackId);
    const next = assignees.filter((a) => a !== id && a !== fallbackId);
    if (!has) next.push(id);
    setAssignees(next);
    await updateTask({ assigneeIds: next, status: next.length ? 'assigned' : 'inbox' });
  }

  async function onClaimTask() {
    setStatus('in_progress');
    await updateTask({ status: 'in_progress', leaseOwnerAgentId: leadAgentId });
  }

  async function onBlockTask() {
    if (!blockReason.trim()) return;
    setStatus('blocked');
    await updateTask({ status: 'blocked', blockReason, blockActorId: leadAgentId });
    setBlockReason('');
  }

  async function onUpdateLabels() {
    const next = labelsInput
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
    await updateTask({ labels: next });
  }

  async function onUpdateDates() {
    const nextStart = fromDateTimeLocalValue(startAt);
    const nextDue = fromDateTimeLocalValue(dueAt);
    await updateTask({
      startAt: nextStart || '',
      dueAt: nextDue || '',
    });
  }

  async function onToggleRequiresReview(next: boolean) {
    setRequiresReview(next);
    await updateTask({ requiresReview: next });
  }

  async function onSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    await mcFetch('/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, content: message, fromAgentId: leadAgentId }),
    });
    setMessage('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function createSubtask(event: React.FormEvent) {
    event.preventDefault();
    const title = newSubtaskTitle.trim();
    if (!title) return;
    await mcFetch('/api/subtasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, title }),
    });
    setNewSubtaskTitle('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function toggleSubtask(subtaskId: string, done: boolean) {
    setSubtaskItems((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, done } : s)));
    await mcFetch(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function deleteSubtask(subtaskId: string) {
    await mcFetch(`/api/subtasks/${subtaskId}`, { method: 'DELETE' });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function moveSubtask(subtaskId: string, dir: -1 | 1) {
    const sorted = [...subtaskItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sorted.findIndex((s) => s.id === subtaskId);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const nextA = b.order ?? 0;
    const nextB = a.order ?? 0;
    setSubtaskItems((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, order: nextA };
        if (s.id === b.id) return { ...s, order: nextB };
        return s;
      })
    );
      await Promise.all([
      mcFetch(`/api/subtasks/${a.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: nextA }),
      }),
      mcFetch(`/api/subtasks/${b.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: nextB }),
      }),
    ]);
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function onCreateDoc(event: React.FormEvent) {
    event.preventDefault();
    if (!docTitle.trim()) return;
    await mcFetch('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, title: docTitle, content: docContent, type: 'deliverable' }),
    });
    setDocTitle('');
    setDocContent('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function uploadAttachment(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadFile || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set('taskId', task.id);
      if (uploadTitle.trim()) fd.set('title', uploadTitle.trim());
      fd.set('file', uploadFile);
      const res = await mcFetch('/api/task-files', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Upload failed');
      setUploadTitle('');
      setUploadFile(null);
      router.refresh();
      if (onUpdated) await onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function rotateShareToken(fileId: string) {
    await mcFetch(`/api/task-files/${fileId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rotateShareToken: true }),
    });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function deleteAttachment(fileId: string) {
    if (!window.confirm('Delete attachment?')) return;
    await mcFetch(`/api/task-files/${fileId}`, { method: 'DELETE' });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  const subtaskTotal = subtaskItems.length;
  const subtaskDone = subtaskItems.reduce((acc, s) => acc + (s.done ? 1 : 0), 0);
  const taskSessionKey = `agent:${chatAgentId}:mc:${task.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Task</div>
              <h2 className="mt-2 text-2xl font-semibold headline">{task.title}</h2>
            </div>
            <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{status.replace('_', ' ')}</Badge>
          </div>
          {(task.startAt || task.dueAt) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              {task.startAt && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                  starts {formatShortDate(task.startAt)}
                </span>
              )}
              {task.dueAt && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                  due {formatShortDate(task.dueAt)}
                </span>
              )}
              {task.requiresReview ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">requires review</span>
              ) : null}
            </div>
          )}
          <div className="mt-4 text-sm text-muted">{task.description ? null : 'No description yet.'}</div>
          {task.description ? (
            <div className="mt-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
            </div>
          ) : null}
          <details className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Deep context</summary>
            <div className="mt-2 text-xs text-muted">
              Long-form Markdown context (research, articles, specs). Stored with the task and pulled by agents when needed.
            </div>
            {editingContext ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={contextDraft}
                  onChange={(e) => setContextDraft(e.target.value)}
                  placeholder="Paste long context in Markdown..."
                  className="min-h-[240px]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={() => void saveContext()}>
                    Save context
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setContextDraft(task.context ?? '');
                      setEditingContext(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : task.context ? (
              <div className="mt-3 prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.context}</ReactMarkdown>
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted">No deep context yet.</div>
            )}
            {!editingContext ? (
              <div className="mt-3">
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingContext(true)}>
                  {task.context ? 'Edit' : 'Add'} context
                </Button>
              </div>
            ) : null}
          </details>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">OpenClaw Session</div>
                <div className="mt-1 text-xs text-muted">
                  Per-task session where Mission Control sends task notifications. Use this to ask for progress without
                  bloating your main chat.
                </div>
              </div>
              <Link
                href={`/sessions/${encodeURIComponent(taskSessionKey)}`}
              >
                <Button type="button" size="sm" variant="secondary">
                  Open chat
                </Button>
              </Link>
            </div>

            {openclawAssigneeIds.length > 1 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>Agent</span>
                <select
                  className="rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  value={chatAgentId}
                  onChange={(e) => setChatAgentId(e.target.value)}
                >
                  {openclawAssigneeIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <div className="min-w-0 truncate font-mono text-xs text-[var(--foreground)]">{taskSessionKey}</div>
              <CopyButton value={taskSessionKey} label="Copy" />
            </div>
          </div>
          {!!task.labels?.length && (
            <div className="mt-4 flex flex-wrap gap-2">
              {task.labels.map((label) => (
                <Badge key={label} className="border-none">
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Thread</div>
          <div className="mt-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{msg.fromAgentId || 'human'}</div>
                <div className="mt-2 text-sm whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
            {!messages.length && <div className="text-sm text-muted">No messages yet.</div>}
          </div>
          <form onSubmit={onSendMessage} className="mt-6 space-y-3">
            <MentionsTextarea
              value={message}
              onChange={setMessage}
              mentionables={mentionables}
              placeholder="Add an update, @mention an agent, or paste a log."
            />
            <Button type="submit">Send update</Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Subtasks</div>
            <div className="text-xs text-muted">
              {subtaskDone}/{subtaskTotal}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[...subtaskItems]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((s, idx, arr) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  <input type="checkbox" checked={Boolean(s.done)} onChange={(e) => void toggleSubtask(s.id, e.target.checked)} />
                  <div className={cn('flex-1', s.done ? 'line-through text-muted' : '')}>{s.title}</div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void moveSubtask(s.id, -1)}
                      disabled={idx === 0}
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void moveSubtask(s.id, 1)}
                      disabled={idx === arr.length - 1}
                    >
                      Down
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void deleteSubtask(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            {!subtaskItems.length && <div className="text-sm text-muted">No subtasks yet.</div>}
          </div>
          <form onSubmit={createSubtask} className="mt-4 flex items-center gap-2">
            <Input value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} placeholder="New subtask..." />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Files</div>
            <div className="text-xs text-muted">{files.length}</div>
          </div>
          <div className="mt-2 text-xs text-muted">
            Attach images/PDFs/logs to give agents concrete artifacts. Copy the public link into an agent session when needed.
          </div>

          {uploadError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            {files.map((f) => {
              const shareUrl = f.shareToken ? mcApiUrl(`/api/task-files/public/${f.shareToken}`) : '';
              const fileName = Array.isArray(f.file) ? String(f.file[0] || '') : String(f.file || '');
              return (
                <div key={f.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{f.title || fileName || 'Attachment'}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {fileName ? <span className="font-mono">{fileName}</span> : null}
                        {f.updatedAt ? <span>Updated {formatShortDate(f.updatedAt)}</span> : null}
                      </div>
                      {shareUrl ? (
                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block truncate font-mono text-xs text-[var(--foreground)] underline underline-offset-2"
                        >
                          {shareUrl}
                        </a>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {shareUrl ? <CopyButton value={shareUrl} label="Copy link" /> : null}
                      <Button type="button" size="sm" variant="secondary" onClick={() => void rotateShareToken(f.id)}>
                        Rotate
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => void deleteAttachment(f.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!files.length ? <div className="text-sm text-muted">No files yet.</div> : null}
          </div>

          <form onSubmit={uploadAttachment} className="mt-6 space-y-3">
            <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Optional title (defaults to filename)" />
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent-foreground)] hover:file:bg-[var(--accent-strong)]"
            />
            <Button type="submit" variant="secondary" disabled={uploading || !uploadFile}>
              {uploading ? 'Uploading…' : 'Upload file'}
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Documents</div>
          <div className="mt-4 space-y-3">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/docs?doc=${encodeURIComponent(doc.id)}`}
                className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[color:var(--foreground)]/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">{doc.type}</div>
                    <div className="mt-2 truncate text-sm font-medium">{doc.title}</div>
                    <div className="mt-2 text-xs text-muted">Updated {formatShortDate(doc.updatedAt)}</div>
                  </div>
                  <div className="shrink-0 pt-1 text-xs text-muted opacity-0 transition group-hover:opacity-100">Open</div>
                </div>
              </Link>
            ))}
            {!documents.length && <div className="text-sm text-muted">No documents yet.</div>}
          </div>
          <form onSubmit={onCreateDoc} className="mt-6 space-y-3">
            <Input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="Document title" />
            <Textarea value={docContent} onChange={(event) => setDocContent(event.target.value)} placeholder="Document content (Markdown)" />
            <Button type="submit" variant="secondary">Create doc</Button>
          </form>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Status</div>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as Status)}
            className="mt-3 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <div className="mt-4 space-y-2 text-xs text-muted">
            <div>Lease owner: {task.leaseOwnerAgentId || 'unclaimed'}</div>
            <div>Lease expires: {task.leaseExpiresAt ? formatShortDate(task.leaseExpiresAt) : 'n/a'}</div>
            <div>Attempt count: {task.attemptCount ?? 0}</div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={onClaimTask} disabled={status === 'in_progress' || status === 'done'}>
              Claim task
            </Button>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Block</div>
              <Textarea
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
                placeholder="Reason + next action"
                className="mt-2"
              />
              <Button type="button" size="sm" className="mt-2" onClick={onBlockTask}>
                Block with reason
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Assignee agents</div>
          <div className="mt-3 space-y-2">
            {agents.map((agent) => {
              const key = agent.openclawAgentId ?? agent.id;
              const checked = assignees.includes(key) || assignees.includes(agent.id);
              return (
                <label key={agent.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                  <input type="checkbox" checked={checked} onChange={() => onAssigneeToggle(key, agent.id)} />
                  <span className="flex-1">{agent.displayName ?? agent.id}</span>
                  <span className="font-mono text-xs text-muted">@{key}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted">
            Agents are OpenClaw personas (brains). Manage them on the{' '}
            <Link href="/agents" className="underline underline-offset-2">
              Agents
            </Link>{' '}
            page.
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-3">
          <div className="text-sm font-semibold">Task metadata</div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Review policy</div>
                <div className="mt-1 text-sm">{requiresReview ? 'Requires review' : 'Auto-done'}</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requiresReview} onChange={(e) => void onToggleRequiresReview(e.target.checked)} />
                Requires review
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">AI controls</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Reasoning</label>
                <select
                  value={aiThinking}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setAiThinking(value);
                    // Clear legacy knob so the UI matches behavior.
                    await updateTask({ aiThinking: value, aiEffort: 'auto' });
                  }}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  disabled={reasoningSupported === false}
                >
                  <option value="auto">Auto (agent default)</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">Extra high</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Model tier</label>
                <select
                  value={aiModelTier}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setAiModelTier(value);
                    await updateTask({ aiModelTier: value });
                  }}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="auto">Auto (agent default)</option>
                  <option value="cheap">Cheap</option>
                  <option value="balanced">Balanced</option>
                  <option value="heavy">Heavy</option>
                  <option value="code">Code</option>
                  <option value="vision">Vision</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Model</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-muted">Provider</label>
                    <select
                      className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                      value={aiProvider}
                      onChange={async (event) => {
                        const next = event.target.value;
                        setAiProvider(next);
                        if (next === 'auto') {
                          setAiModel('');
                          await updateTask({ aiModel: '' });
                          return;
                        }
                        // Clear explicit model until user picks one.
                        setAiModel('');
                        await updateTask({ aiModel: '' });
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
                      onChange={async (event) => {
                        const next = event.target.value;
                        setAiModel(next);
                        await updateTask({ aiModel: next });
                        if (next && (aiModelTier === 'auto' || !aiModelTier)) {
                          const inferred = inferTierFromModelKey(next);
                          setAiModelTier(inferred);
                          await updateTask({ aiModelTier: inferred });
                        }
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
                  Picks an exact model that OpenClaw currently knows about. If set, this takes precedence over Model tier.
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted">
              {reasoningSupported === false ? (
                <>
                  This model doesn&apos;t support reasoning controls. Mission Control will keep reasoning on Auto and only
                  apply model selection.
                </>
              ) : (
                <>
                  Mission Control can prefix OpenClaw messages with inline directives (ex:{' '}
                  <span className="font-mono">/t low</span>, <span className="font-mono">/model cheap</span>) to control cost per task.
                </>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Credential (Vault)</div>
                <div className="mt-2 text-xs text-muted">
                  Store a handle to guide the agent. Use <span className="font-mono">{'{{vault:HANDLE}}'}</span> in tool params.
                </div>
              </div>
              <div className="text-xs text-muted">
                Agent <span className="font-mono text-[var(--foreground)]">@{effectiveVaultAgent}</span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Agent for credential</label>
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  value={vaultAgent}
                  onChange={(e) => setVaultAgent(e.target.value)}
                >
                  <option value="">Auto (first assignee / lead)</option>
                  {openclawAssigneeIds.map((a) => (
                    <option key={a} value={a}>
                      @{a}
                    </option>
                  ))}
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
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void updateTask({ vaultItem: vaultHandle.trim() || '' })}
              >
                Save
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setVaultHandle('')} disabled={!vaultHandle.trim()}>
                Clear
              </Button>
              {vaultHandle.trim() ? <CopyButton value={`{{vault:${vaultHandle.trim()}}}`} label="Copy placeholder" /> : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyButton
                value={buildVaultHintMarkdown({
                  handle: vaultHandle.trim(),
                  includeUsernameRef: vaultItems.find((it) => it.handle === vaultHandle.trim())?.type === 'username_password',
                })}
                label="Copy hint block"
                disabled={!vaultHandle.trim()}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!vaultHandle.trim()}
                onClick={async () => {
                  const handle = vaultHandle.trim();
                  if (!handle) return;
                  const includeUsernameRef = vaultItems.find((it) => it.handle === handle)?.type === 'username_password';
                  const hint = buildVaultHintMarkdown({ handle, includeUsernameRef });
                  const next = upsertVaultHintMarkdown(contextDraft, hint);
                  setContextDraft(next);
                  await updateTask({ context: next });
                }}
              >
                Insert hint into context
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const next = stripVaultHintMarkdown(contextDraft);
                  setContextDraft(next);
                  await updateTask({ context: next });
                }}
              >
                Remove hint from context
              </Button>
            </div>

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
                        onClick={() => setVaultHandle(it.handle)}
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
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Dates</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Start</label>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Due</label>
                <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-2" />
              </div>
            </div>
            <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onUpdateDates}>
              Save dates
            </Button>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Execution device (optional)</label>
            <select
              value={requiredNodeId}
              onChange={async (event) => {
                const value = event.target.value;
                setRequiredNodeId(value);
                await updateTask({ requiredNodeId: value || '' });
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="">Gateway (this machine)</option>
              {nodes.map((node) => ({
                id: node.nodeId ?? node.id,
                label: node.displayName ?? node.nodeId ?? node.id,
              })).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-muted">
              Nodes are paired devices from OpenClaw. Sync nodes on the{' '}
              <Link href="/nodes" className="underline underline-offset-2">
                Nodes
              </Link>{' '}
              page.
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Labels</label>
            <Input
              value={labelsInput}
              onChange={(event) => setLabelsInput(event.target.value)}
              placeholder="comma, separated, tags"
              className="mt-2"
            />
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={onUpdateLabels}>
              Save labels
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-3">
          <div className="text-sm font-semibold">Task actions</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => archiveTask(!archived)}>
              {archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={deleteTask}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
