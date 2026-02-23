'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  type CollisionDetection,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentAvatar } from '@/components/ui/agent-avatar';
import { TaskViewToggle } from '@/app/tasks/TaskViewToggle';
import { TaskCreateDrawer } from '@/app/tasks/TaskCreateDrawer';
import { TaskDrawer } from '@/app/tasks/TaskDrawer';
import { mcFetch } from '@/lib/clientApi';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';
import type { Agent, NodeRecord, Project, Task, TaskStatus } from '@/lib/types';
import { cn, formatShortDate, titleCase } from '@/lib/utils';

const columns: Array<{ id: TaskStatus; label: string; tone: string }> = [
  { id: 'inbox', label: 'Inbox', tone: 'slate' },
  { id: 'assigned', label: 'Assigned', tone: 'blue' },
  { id: 'in_progress', label: 'In Progress', tone: 'teal' },
  { id: 'review', label: 'Review', tone: 'amber' },
  { id: 'blocked', label: 'Blocked', tone: 'red' },
  { id: 'done', label: 'Done', tone: 'emerald' },
];

function computeOrderAtIndex(sorted: Task[], idx: number) {
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length ? sorted[idx] : null;
  const prevOrder = typeof prev?.order === 'number' ? prev.order : null;
  const nextOrder = typeof next?.order === 'number' ? next.order : null;

  if (prevOrder == null && nextOrder == null) return Date.now();
  if (prevOrder == null && nextOrder != null) return nextOrder - 1000;
  if (prevOrder != null && nextOrder == null) return prevOrder + 1000;
  if (prevOrder != null && nextOrder != null) {
    if (prevOrder === nextOrder) return prevOrder + 1;
    return (prevOrder + nextOrder) / 2;
  }
  return Date.now();
}

function EventAvatars({
  ids,
  agentLabelById,
  max = 3,
}: {
  ids: string[];
  agentLabelById: Map<string, string>;
  max?: number;
}) {
  const cleaned = Array.from(new Set((ids || []).map((v) => String(v || '').trim()).filter(Boolean)));
  const head = cleaned.slice(0, max);
  const extra = Math.max(0, cleaned.length - head.length);

  return (
    <div className="flex items-center gap-1">
      {head.map((id) => {
        const label = agentLabelById.get(id) || id;
        return <AgentAvatar key={id} id={id} label={label} size={24} />;
      })}
      {extra ? (
        <span className="inline-flex h-6 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 text-[10px] font-semibold text-muted">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function TaskCardShell({
  task,
  nodeLabel,
  agentLabelById,
  dragging,
  children,
  onOpen,
}: {
  task: Task;
  nodeLabel?: string;
  agentLabelById: Map<string, string>;
  dragging?: boolean;
  children?: React.ReactNode;
  onOpen?: () => void;
}) {
  const assignees = Array.isArray(task.assigneeIds) ? task.assigneeIds : [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen?.();
      }}
      className={cn(
        'group w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-left shadow-sm transition',
        'hover:-translate-y-0.5 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        dragging ? 'opacity-60' : ''
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {children}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-[var(--foreground)]" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {task.title}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">{titleCase(task.status)}</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">{String(task.priority || 'p2').toUpperCase()}</span>
                {task.requiredNodeId ? (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">run:{nodeLabel || task.requiredNodeId}</span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0">
              {assignees.length ? <EventAvatars ids={assignees} agentLabelById={agentLabelById} max={3} /> : null}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
            <div className="flex items-center gap-2">
              {task.subtasksTotal ? (
                <span className="tabular-nums">
                  {task.subtasksDone ?? 0}/{task.subtasksTotal}
                </span>
              ) : null}
              {task.startAt ? <span className="whitespace-nowrap">start {formatShortDate(task.startAt)}</span> : null}
              {task.dueAt ? <span className="whitespace-nowrap">due {formatShortDate(task.dueAt)}</span> : null}
            </div>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{assignees.length || '0'} agents</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  nodeLabel,
  agentLabelById,
  onOpen,
}: {
  task: Task;
  nodeLabel?: string;
  agentLabelById: Map<string, string>;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'z-10')}
    >
      <TaskCardShell task={task} nodeLabel={nodeLabel} agentLabelById={agentLabelById} dragging={isDragging} onOpen={onOpen}>
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="Drag task"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]',
            'transition hover:bg-[var(--card)]',
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 opacity-80" />
        </button>
      </TaskCardShell>
    </div>
  );
}

function Column({
  status,
  label,
  tasks,
  nodeLabelById,
  agentLabelById,
  onOpen,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  nodeLabelById: Map<string, string>;
  agentLabelById: Map<string, string>;
  onOpen: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-[280px] shrink-0 flex-col rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm sm:w-[320px]',
        // Make the whole column a drop target (including the header) to feel like a proper Kanban.
        isOver ? 'ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-[var(--surface)]' : ''
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[linear-gradient(135deg,var(--glass-1),var(--glass-2))] px-4 py-3 backdrop-blur">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</div>
          <div className="mt-1 text-xs text-muted">{tasks.length} task(s)</div>
        </div>
        <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">{tasks.length}</Badge>
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto p-3 transition-colors',
          isOver ? 'bg-[color:var(--foreground)]/4' : ''
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {tasks.map((t) => (
              <SortableTaskCard
                key={t.id}
                task={t}
                nodeLabel={t.requiredNodeId ? nodeLabelById.get(t.requiredNodeId) : undefined}
                agentLabelById={agentLabelById}
                onOpen={() => onOpen(t.id)}
              />
            ))}
          </div>
        </SortableContext>
        {!tasks.length ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-xs text-muted">Drop tasks here</div>
        ) : null}
      </div>
    </div>
  );
}

export function TaskBoard({
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
  const [mounted, setMounted] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [overrideTaskId, setOverrideTaskId] = React.useState<string | null | undefined>(undefined);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const dragSnapshotRef = React.useRef<{ id: string; status: TaskStatus; order?: number } | null>(null);
  const suppressOpenRef = React.useRef(false);
  const suppressOpenTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Multi-column boards need a pointer-first collision strategy so empty columns
  // are valid drop targets (closestCorners tends to snap to the nearest card).
  // Also exclude the active draggable id so we never "drop onto ourselves".
  const collisionDetection: CollisionDetection = React.useCallback((args) => {
    const withoutActive = <T extends { id: unknown }>(collisions: T[]) =>
      collisions.filter((c) => String(c.id) !== String(args.active.id));

    const pointerHits = withoutActive(pointerWithin(args));
    if (pointerHits.length) return pointerHits;

    const rectHits = withoutActive(rectIntersection(args));
    if (rectHits.length) return rectHits;

    return withoutActive(closestCorners(args));
  }, []);

  React.useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const selectedProjectId = React.useMemo(() => {
    const raw = String(searchParams.get('project') || '').trim();
    return raw;
  }, [searchParams]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const nodeLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) {
      const id = String(n.nodeId ?? n.id);
      const label = String(n.displayName ?? n.nodeId ?? n.id);
      map.set(id, label);
    }
    return map;
  }, [nodes]);

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

  const projectNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects || []) {
      const id = String(p.id || '').trim();
      if (!id) continue;
      map.set(id, String(p.name || id));
    }
    return map;
  }, [projects]);

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await mcFetch('/api/tasks?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      setTasks(json?.items ?? []);
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

  const taskParam = searchParams.get('task');
  const newParam = searchParams.get('new');

  React.useEffect(() => {
    setCreateOpen(newParam === '1');
  }, [newParam]);

  React.useEffect(() => {
    if (overrideTaskId === undefined) return;
    if (overrideTaskId === null && !taskParam) setOverrideTaskId(undefined);
    if (typeof overrideTaskId === 'string' && taskParam === overrideTaskId) setOverrideTaskId(undefined);
  }, [overrideTaskId, taskParam]);

  const visibleTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      if (task.archived) return false;
      if (!selectedProjectId) return true;
      return String(task.projectId || '').trim() === selectedProjectId;
    });
  }, [tasks, selectedProjectId]);

  const grouped = React.useMemo(() => {
    const by = new Map<TaskStatus, Task[]>();
    for (const c of columns) by.set(c.id, []);
    for (const t of visibleTasks) {
      const list = by.get(t.status as TaskStatus);
      if (!list) continue;
      list.push(t);
    }
    for (const [k, list] of by.entries()) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      by.set(k, list);
    }
    return by;
  }, [visibleTasks]);

  function openDrawer(taskId: string) {
    if (suppressOpenRef.current) return;
    setOverrideTaskId(taskId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    params.set('task', taskId);
    const next = params.toString();
    router.replace(next ? `/tasks?${next}` : '/tasks', { scroll: false });
  }

  function closeDrawer() {
    setOverrideTaskId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    const next = params.toString();
    router.replace(next ? `/tasks?${next}` : '/tasks', { scroll: false });
  }

  function closeCreateDrawer() {
    setCreateOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const next = params.toString();
    router.replace(next ? `/tasks?${next}` : '/tasks', { scroll: false });
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    await mcFetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  function findTask(id: string) {
    return visibleTasks.find((t) => t.id === id) || null;
  }

  function columnOfId(id: string): TaskStatus | null {
    const colIds = new Set(columns.map((c) => c.id));
    if (colIds.has(id as any)) return id as TaskStatus;
    const t = findTask(id);
    return t ? (t.status as TaskStatus) : null;
  }

  function setSuppressOpen() {
    suppressOpenRef.current = true;
    if (suppressOpenTimerRef.current) clearTimeout(suppressOpenTimerRef.current);
    suppressOpenTimerRef.current = setTimeout(() => {
      suppressOpenRef.current = false;
      suppressOpenTimerRef.current = null;
    }, 250);
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const t = findTask(id);
    if (!t) return;
    setActiveId(id);
    dragSnapshotRef.current = { id, status: t.status as TaskStatus, order: t.order };
  }

  function onDragOver(e: DragOverEvent) {
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : '';
    if (!active || !over) return;

    const activeTask = findTask(active);
    if (!activeTask) return;

    const source = columnOfId(active);
    const target = columnOfId(over);
    if (!source || !target) return;
    if (source === target) return;

    const targetTasks = (grouped.get(target) || []).filter((t) => t.id !== active);
    const overIsColumn = columns.some((c) => c.id === (over as any));
    const idx = overIsColumn ? targetTasks.length : targetTasks.findIndex((t) => t.id === over);
    const insertIdx = idx === -1 ? targetTasks.length : idx;
    const nextOrder = computeOrderAtIndex(targetTasks, insertIdx);

    setTasks((prev) => prev.map((t) => (t.id === active ? { ...t, status: target, order: nextOrder } : t)));
  }

  function onDragCancel() {
    const snap = dragSnapshotRef.current;
    setActiveId(null);
    dragSnapshotRef.current = null;
    if (!snap) return;

    setTasks((prev) => prev.map((t) => (t.id === snap.id ? { ...t, status: snap.status, order: snap.order } : t)));
    setSuppressOpen();
  }

  function onDragEnd(e: DragEndEvent) {
    const snap = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    setActiveId(null);

    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : '';
    if (!snap) return;
    if (!active || !over) {
      // Revert to snapshot.
      setTasks((prev) => prev.map((t) => (t.id === snap.id ? { ...t, status: snap.status, order: snap.order } : t)));
      setSuppressOpen();
      return;
    }

    const activeTask = findTask(active);
    if (!activeTask) return;

    const source = snap.status;
    const target = columnOfId(over) || source;

    // Reorder within a column.
    if (source === target) {
      const colTasks = (grouped.get(source) || []).filter((t) => t.id !== active);
      const overIsColumn = columns.some((c) => c.id === (over as any));
      const idx = overIsColumn ? colTasks.length : colTasks.findIndex((t) => t.id === over);
      const insertIdx = idx === -1 ? colTasks.length : idx;

      const reordered = [...colTasks];
      reordered.splice(insertIdx, 0, activeTask);

      // Compute a new order for the active task based on its neighbors.
      const newIndex = reordered.findIndex((t) => t.id === active);
      const before = newIndex > 0 ? reordered[newIndex - 1] : null;
      const after = newIndex < reordered.length - 1 ? reordered[newIndex + 1] : null;
      const beforeOrder = typeof before?.order === 'number' ? before.order : null;
      const afterOrder = typeof after?.order === 'number' ? after.order : null;

      let nextOrder: number;
      if (beforeOrder == null && afterOrder == null) nextOrder = Date.now();
      else if (beforeOrder == null && afterOrder != null) nextOrder = afterOrder - 1000;
      else if (beforeOrder != null && afterOrder == null) nextOrder = beforeOrder + 1000;
      else nextOrder = beforeOrder != null && afterOrder != null ? (beforeOrder + afterOrder) / 2 : Date.now();

      if (activeTask.order === nextOrder) {
        setSuppressOpen();
        return;
      }

      setTasks((prev) => prev.map((t) => (t.id === active ? { ...t, order: nextOrder } : t)));
      void patchTask(active, { order: nextOrder });
      setSuppressOpen();
      return;
    }

    // Cross-column move.
    const targetTasks = (grouped.get(target) || []).filter((t) => t.id !== active);
    const overIsColumn = columns.some((c) => c.id === (over as any));
    const idx = overIsColumn ? targetTasks.length : targetTasks.findIndex((t) => t.id === over);
    const insertIdx = idx === -1 ? targetTasks.length : idx;
    const nextOrder = computeOrderAtIndex(targetTasks, insertIdx);

    setTasks((prev) => prev.map((t) => (t.id === active ? { ...t, status: target, order: nextOrder } : t)));
    void patchTask(active, { status: target, order: nextOrder });
    setSuppressOpen();
  }

  const effectiveTaskId = overrideTaskId !== undefined ? overrideTaskId : taskParam;
  const drawerOpen = Boolean(effectiveTaskId);

  const activeTask = activeId ? findTask(activeId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* On mobile the page titlebar is hidden to free space; keep Board/Calendar switch here. */}
          <div className="lg:hidden">
            <TaskViewToggle variant="inline" />
          </div>
          <div className="hidden sm:block text-xs text-muted">
            Drag to reorder. Drop into another column to change status.
          </div>
          <select
            className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
            value={selectedProjectId}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams.toString());
              const value = String(event.target.value || '').trim();
              if (value) params.set('project', value);
              else params.delete('project');
              const next = params.toString();
              router.replace(next ? `/tasks?${next}` : '/tasks', { scroll: false });
            }}
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
          {selectedProjectId ? (
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              {projectNameById.get(selectedProjectId) || selectedProjectId}
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('task');
            params.set('new', '1');
            const next = params.toString();
            router.replace(next ? `/tasks?${next}` : '/tasks', { scroll: false });
          }}
        >
          New task
        </Button>
      </div>

      {mounted ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="min-h-0 flex-1 -mx-3 overflow-x-auto pb-4 sm:-mx-4">
            <div className="flex h-full min-h-0 w-max gap-4 px-3 sm:px-4">
              {columns.map((col) => (
                <Column
                  key={col.id}
                  status={col.id}
                  label={col.label}
                  tasks={grouped.get(col.id) || []}
                  nodeLabelById={nodeLabelById}
                  agentLabelById={agentLabelById}
                  onOpen={openDrawer}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="w-[320px]">
                <TaskCardShell
                  task={activeTask}
                  nodeLabel={activeTask.requiredNodeId ? nodeLabelById.get(activeTask.requiredNodeId) : undefined}
                  agentLabelById={agentLabelById}
                  dragging
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <GripVertical className="h-4 w-4 opacity-80" />
                  </div>
                </TaskCardShell>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="min-h-0 flex-1 -mx-3 overflow-x-auto pb-4 sm:-mx-4">
          <div className="flex h-full min-h-0 w-max gap-4 px-3 sm:px-4">
            {columns.map((col) => (
              <div
                key={col.id}
                className="flex w-[280px] shrink-0 flex-col rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm sm:w-[320px]"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[linear-gradient(135deg,var(--glass-1),var(--glass-2))] px-4 py-3 backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{col.label}</div>
                  <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">0</Badge>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-xs text-muted">Loading…</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
