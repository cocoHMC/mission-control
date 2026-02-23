'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { TaskViewToggle } from '@/app/tasks/TaskViewToggle';
import { TaskCreateDrawer } from '@/app/tasks/TaskCreateDrawer';
import { TaskDrawer } from '@/app/tasks/TaskDrawer';
import { mcFetch } from '@/lib/clientApi';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent, NodeRecord, Project, Task, TaskStatus, TaskView } from '@/lib/types';
import { cn, formatShortDate } from '@/lib/utils';

type ListSort = 'updated_desc' | 'due_asc' | 'priority_desc' | 'created_desc';

const statusOptions: Array<{ value: ''; label: string } | { value: TaskStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

const priorityOptions = [
  { value: '', label: 'All priorities' },
  { value: 'p0', label: 'P0' },
  { value: 'p1', label: 'P1' },
  { value: 'p2', label: 'P2' },
  { value: 'p3', label: 'P3' },
];

const sortOptions: Array<{ value: ListSort; label: string }> = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'due_asc', label: 'Due date' },
  { value: 'priority_desc', label: 'Priority' },
  { value: 'created_desc', label: 'Recently created' },
];

function toDateInputValue(iso: string | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fromDateInputValue(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function priorityRank(value: string | undefined) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'p0') return 0;
  if (key === 'p1') return 1;
  if (key === 'p2') return 2;
  if (key === 'p3') return 3;
  return 9;
}

function asMs(value: string | undefined) {
  if (!value) return Number.NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function compareTasks(a: Task, b: Task, sort: ListSort) {
  if (sort === 'created_desc') {
    return (asMs(b.createdAt) || 0) - (asMs(a.createdAt) || 0);
  }
  if (sort === 'due_asc') {
    const dueA = asMs(a.dueAt);
    const dueB = asMs(b.dueAt);
    const missA = Number.isNaN(dueA);
    const missB = Number.isNaN(dueB);
    if (missA && !missB) return 1;
    if (!missA && missB) return -1;
    if (!missA && !missB && dueA !== dueB) return dueA - dueB;
    return (asMs(b.updatedAt) || 0) - (asMs(a.updatedAt) || 0);
  }
  if (sort === 'priority_desc') {
    const pa = priorityRank(a.priority);
    const pb = priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    return (asMs(b.updatedAt) || 0) - (asMs(a.updatedAt) || 0);
  }
  return (asMs(b.updatedAt) || 0) - (asMs(a.updatedAt) || 0);
}

export function TaskList({
  initialTasks,
  agents,
  nodes,
  projects,
}: {
  initialTasks: Task[];
  agents: Agent[];
  nodes: NodeRecord[];
  projects: Project[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = React.useState<Task[]>(initialTasks);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [overrideTaskId, setOverrideTaskId] = React.useState<string | null | undefined>(undefined);
  const [taskViews, setTaskViews] = React.useState<TaskView[]>([]);
  const [viewsLoading, setViewsLoading] = React.useState(false);
  const [pendingTaskId, setPendingTaskId] = React.useState<string | null>(null);

  const selectedProjectId = String(searchParams.get('project') || '').trim();
  const selectedStatus = String(searchParams.get('status') || '').trim();
  const selectedAssignee = String(searchParams.get('assignee') || '').trim();
  const selectedPriority = String(searchParams.get('priority') || '').trim().toLowerCase();
  const selectedSort = (String(searchParams.get('sort') || 'updated_desc').trim().toLowerCase() as ListSort) || 'updated_desc';
  const taskViewId = String(searchParams.get('taskView') || '').trim();
  const qFilter = String(searchParams.get('q') || '').trim();
  const taskParam = searchParams.get('task');
  const newParam = searchParams.get('new');

  const [searchDraft, setSearchDraft] = React.useState(qFilter);

  React.useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  React.useEffect(() => {
    setSearchDraft(qFilter);
  }, [qFilter]);

  const replaceSearch = React.useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const next = params.toString();
      router.replace(next ? `/tasks?${next}` : '/tasks', { scroll: false });
    },
    [router, searchParams]
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      const next = String(searchDraft || '').trim();
      if (next === qFilter) return;
      replaceSearch((params) => {
        if (next) params.set('q', next);
        else params.delete('q');
        params.delete('taskView');
      });
    }, 320);
    return () => clearTimeout(t);
  }, [searchDraft, qFilter, replaceSearch]);

  React.useEffect(() => {
    setCreateOpen(newParam === '1');
  }, [newParam]);

  React.useEffect(() => {
    if (overrideTaskId === undefined) return;
    if (overrideTaskId === null && !taskParam) setOverrideTaskId(undefined);
    if (typeof overrideTaskId === 'string' && taskParam === overrideTaskId) setOverrideTaskId(undefined);
  }, [overrideTaskId, taskParam]);

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await mcFetch('/api/tasks?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      setTasks(Array.isArray(json?.items) ? (json.items as Task[]) : []);
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
        await pb.collection('tasks').subscribe('*', (e: PBRealtimeEvent<Task>) => {
          if (!e?.record) return;
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === e.record.id);
            if (e.action === 'delete') return prev.filter((t) => t.id !== e.record.id);
            if (idx === -1) return [...prev, e.record as Task];
            const next = [...prev];
            next[idx] = e.record as Task;
            return next;
          });
        });
        unsubscribe = async () => pb.collection('tasks').unsubscribe('*');
      })
      .catch(() => {
        // keep polling
      });

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }, []);

  async function refreshTaskViews() {
    setViewsLoading(true);
    try {
      const q = new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' });
      const res = await mcFetch(`/api/task-views?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) return;
      setTaskViews(Array.isArray(json?.items) ? (json.items as TaskView[]) : []);
    } finally {
      setViewsLoading(false);
    }
  }

  React.useEffect(() => {
    void refreshTaskViews();
  }, []);

  function updateFilterParam(name: string, value: string) {
    replaceSearch((params) => {
      const v = String(value || '').trim();
      if (v) params.set(name, v);
      else params.delete(name);
      params.delete('taskView');
    });
  }

  function applyTaskView(view: TaskView) {
    const filters = (view.filters || {}) as Record<string, unknown>;
    replaceSearch((params) => {
      params.set('view', 'list');
      params.set('taskView', view.id);
      const map: Array<[string, string]> = [
        ['project', String(filters.projectId || '')],
        ['status', String(filters.status || '')],
        ['assignee', String(filters.assignee || '')],
        ['priority', String(filters.priority || '')],
        ['q', String(filters.q || '')],
        ['sort', String(filters.sort || '')],
      ];
      for (const [key, raw] of map) {
        const v = raw.trim();
        if (v) params.set(key, v);
        else params.delete(key);
      }
    });
  }

  async function saveCurrentView() {
    const suggested = `Tasks ${selectedProjectId ? 'project' : 'view'} ${new Date().toISOString().slice(0, 10)}`;
    const name = window.prompt('Saved view name', suggested);
    if (!name || !name.trim()) return;
    const payload = {
      name: name.trim(),
      filters: {
        projectId: selectedProjectId,
        status: selectedStatus,
        assignee: selectedAssignee,
        priority: selectedPriority,
        q: qFilter,
        sort: selectedSort,
      },
    };
    const res = await mcFetch('/api/task-views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = String(json?.error || json?.message || `Save failed (${res.status})`);
      window.alert(msg);
      return;
    }
    await refreshTaskViews();
    applyTaskView(json as TaskView);
  }

  async function deleteCurrentView() {
    if (!taskViewId) return;
    const view = taskViews.find((item) => item.id === taskViewId);
    const label = view?.name || taskViewId;
    if (!window.confirm(`Delete saved view "${label}"?`)) return;
    const res = await mcFetch(`/api/task-views/${encodeURIComponent(taskViewId)}`, { method: 'DELETE' });
    if (!res.ok) return;
    await refreshTaskViews();
    replaceSearch((params) => {
      params.delete('taskView');
    });
  }

  const projectNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects || []) {
      const id = String(p.id || '').trim();
      if (!id) continue;
      map.set(id, String(p.name || id));
    }
    return map;
  }, [projects]);

  const agentLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      const key = String(a.openclawAgentId ?? a.id);
      const label = String(a.displayName ?? key);
      if (a.id) map.set(a.id, label);
      if (a.openclawAgentId) map.set(a.openclawAgentId, label);
      map.set(key, label);
    }
    return map;
  }, [agents]);

  const visibleTasks = React.useMemo(() => {
    const q = qFilter.toLowerCase();
    const next = tasks.filter((task) => {
      if (task.archived) return false;
      if (selectedProjectId && String(task.projectId || '').trim() !== selectedProjectId) return false;
      if (selectedStatus && String(task.status || '').trim() !== selectedStatus) return false;
      if (selectedAssignee) {
        const assignees = Array.isArray(task.assigneeIds) ? task.assigneeIds.map((id) => String(id || '').trim()) : [];
        if (!assignees.includes(selectedAssignee)) return false;
      }
      if (selectedPriority && String(task.priority || '').trim().toLowerCase() !== selectedPriority) return false;
      if (q) {
        const haystack = [
          String(task.title || ''),
          String(task.description || ''),
          String(task.context || ''),
          ...(Array.isArray(task.labels) ? task.labels.map((v) => String(v || '')) : []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    next.sort((a, b) => compareTasks(a, b, selectedSort));
    return next;
  }, [tasks, selectedProjectId, selectedStatus, selectedAssignee, selectedPriority, qFilter, selectedSort]);

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    const prev = tasks;
    setPendingTaskId(taskId);
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
    try {
      const res = await mcFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setTasks(prev);
        const msg = String(json?.error || json?.message || `Update failed (${res.status})`);
        window.alert(msg);
        return;
      }
      const updated = json && typeof json === 'object' ? (json as Task) : null;
      if (updated?.id) {
        setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...updated } : task)));
      }
    } finally {
      setPendingTaskId((current) => (current === taskId ? null : current));
    }
  }

  function openDrawer(taskId: string) {
    setOverrideTaskId(taskId);
    replaceSearch((params) => {
      params.delete('new');
      params.set('task', taskId);
    });
  }

  function closeDrawer() {
    setOverrideTaskId(null);
    replaceSearch((params) => {
      params.delete('task');
    });
  }

  function closeCreateDrawer() {
    setCreateOpen(false);
    replaceSearch((params) => {
      params.delete('new');
    });
  }

  const effectiveTaskId = overrideTaskId !== undefined ? overrideTaskId : taskParam;
  const drawerOpen = Boolean(effectiveTaskId);
  const selectedTaskView = taskViews.find((item) => item.id === taskViewId) || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="lg:hidden">
              <TaskViewToggle variant="inline" />
            </div>
            <Input
              className="h-9 w-[260px]"
              placeholder="Search title, context, labels..."
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <select
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
              value={selectedProjectId}
              onChange={(e) => updateFilterParam('project', e.target.value)}
            >
              <option value="">All projects</option>
              {projects
                .filter((p) => !p.archived && String(p.status || 'active') !== 'archived')
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name || project.id}
                  </option>
                ))}
            </select>
            <select
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
              value={selectedStatus}
              onChange={(e) => updateFilterParam('status', e.target.value)}
            >
              {statusOptions.map((row) => (
                <option key={`${row.value}:${row.label}`} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
              value={selectedAssignee}
              onChange={(e) => updateFilterParam('assignee', e.target.value)}
            >
              <option value="">All assignees</option>
              {agents.map((agent) => {
                const key = String(agent.openclawAgentId ?? agent.id ?? '').trim();
                if (!key) return null;
                return (
                  <option key={key} value={key}>
                    {agent.displayName || key}
                  </option>
                );
              })}
            </select>
            <select
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
              value={selectedPriority}
              onChange={(e) => updateFilterParam('priority', e.target.value)}
            >
              {priorityOptions.map((row) => (
                <option key={`${row.value}:${row.label}`} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
              value={selectedSort}
              onChange={(e) => updateFilterParam('sort', e.target.value)}
            >
              {sortOptions.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                replaceSearch((params) => {
                  params.delete('task');
                  params.set('new', '1');
                });
              }}
            >
              New task
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 min-w-[220px] rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
            value={taskViewId}
            onChange={(e) => {
              const nextId = String(e.target.value || '').trim();
              if (!nextId) {
                replaceSearch((params) => {
                  params.delete('taskView');
                });
                return;
              }
              const view = taskViews.find((item) => item.id === nextId);
              if (view) applyTaskView(view);
            }}
          >
            <option value="">{viewsLoading ? 'Loading saved views…' : 'Saved views'}</option>
            {taskViews.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.id}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="secondary" onClick={() => void saveCurrentView()}>
            <Save className="mr-2 h-4 w-4" />
            Save current
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void deleteCurrentView()} disabled={!taskViewId}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          {selectedTaskView ? (
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              View: {selectedTaskView.name || selectedTaskView.id}
            </Badge>
          ) : null}
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
            {visibleTasks.length} task(s)
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="h-full overflow-auto mc-scroll">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[linear-gradient(135deg,var(--glass-1),var(--glass-2))] backdrop-blur">
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.18em] text-muted">
                <th className="px-3 py-3 text-left">Task</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Priority</th>
                <th className="px-3 py-3 text-left">Assignee</th>
                <th className="px-3 py-3 text-left">Project</th>
                <th className="px-3 py-3 text-left">Due</th>
                <th className="px-3 py-3 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => {
                const firstAssignee = Array.isArray(task.assigneeIds) ? String(task.assigneeIds[0] || '').trim() : '';
                const dueMs = asMs(task.dueAt);
                const overdue = Number.isFinite(dueMs) && dueMs < Date.now() && task.status !== 'done';
                const loading = pendingTaskId === task.id;
                return (
                  <tr
                    key={task.id}
                    className={cn(
                      'cursor-pointer border-b border-[var(--border)]/70 transition hover:bg-[var(--surface)]/70',
                      loading ? 'opacity-70' : ''
                    )}
                    onClick={() => openDrawer(task.id)}
                  >
                    <td className="px-3 py-2.5 align-top">
                      <div className="max-w-[360px]">
                        <div className="line-clamp-2 font-medium text-[var(--foreground)]">{task.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="font-mono">{task.id.slice(0, 8)}</span>
                          {task.subtasksTotal ? (
                            <span className="tabular-nums">
                              {task.subtasksDone ?? 0}/{task.subtasksTotal} subtasks
                            </span>
                          ) : null}
                          {task.requiresReview ? <span>review gate</span> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="h-8 rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                        value={task.status}
                        onChange={(e) => void patchTask(task.id, { status: e.target.value })}
                      >
                        {statusOptions
                          .filter((row) => row.value)
                          .map((row) => (
                            <option key={String(row.value)} value={String(row.value)}>
                              {row.label}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="h-8 rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                        value={String(task.priority || 'p2')}
                        onChange={(e) => void patchTask(task.id, { priority: e.target.value })}
                      >
                        {priorityOptions
                          .filter((row) => row.value)
                          .map((row) => (
                            <option key={row.value} value={row.value}>
                              {row.label}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {firstAssignee ? (
                          <AgentAvatar id={firstAssignee} label={agentLabelById.get(firstAssignee) || firstAssignee} size={24} />
                        ) : null}
                        <select
                          className="h-8 min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                          value={firstAssignee}
                          onChange={(e) => {
                            const nextAssignee = String(e.target.value || '').trim();
                            const nextAssignees = nextAssignee ? [nextAssignee] : [];
                            void patchTask(task.id, {
                              assigneeIds: nextAssignees,
                              status: nextAssignees.length && task.status === 'inbox' ? 'assigned' : task.status,
                            });
                          }}
                        >
                          <option value="">Unassigned</option>
                          {agents.map((agent) => {
                            const key = String(agent.openclawAgentId ?? agent.id ?? '').trim();
                            if (!key) return null;
                            return (
                              <option key={key} value={key}>
                                {agent.displayName || key}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="h-8 min-w-[140px] rounded-lg border border-[var(--border)] bg-[var(--input)] px-2 text-xs"
                        value={String(task.projectId || '')}
                        onChange={(e) => void patchTask(task.id, { projectId: String(e.target.value || '').trim() })}
                      >
                        <option value="">No project</option>
                        {projects
                          .filter((p) => !p.archived && String(p.status || 'active') !== 'archived')
                          .map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name || project.id}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          className="h-8 w-[140px]"
                          value={toDateInputValue(task.dueAt)}
                          onChange={(e) => void patchTask(task.id, { dueAt: fromDateInputValue(e.target.value) })}
                        />
                        {task.dueAt ? (
                          <Badge
                            className={cn(
                              'border-none',
                              overdue ? 'bg-red-600 text-white' : 'bg-[var(--surface)] text-[var(--foreground)]'
                            )}
                          >
                            {overdue ? 'Overdue' : formatShortDate(task.dueAt)}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-muted">
                      <div>{task.updatedAt ? formatShortDate(task.updatedAt) : '—'}</div>
                      <div className="mt-1 text-[11px]">
                        {task.projectId ? projectNameById.get(task.projectId) || task.projectId : 'No project'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visibleTasks.length ? (
            <div className="p-8 text-center text-sm text-muted">No tasks match the current filters.</div>
          ) : null}
        </div>
      </div>

      <TaskDrawer
        open={drawerOpen}
        taskId={effectiveTaskId}
        agents={agents}
        nodes={nodes}
        projects={projects}
        onClose={closeDrawer}
      />
      <TaskCreateDrawer
        open={createOpen}
        agents={agents}
        nodes={nodes}
        projects={projects}
        initialProjectId={selectedProjectId || undefined}
        onClose={closeCreateDrawer}
      />
    </div>
  );
}
