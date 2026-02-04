'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, closestCenter, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { cn, formatShortDate, titleCase } from '@/lib/utils';
import { TaskDrawer } from '@/app/tasks/TaskDrawer';
import { getPocketBaseClient, type PBRealtimeEvent } from '@/lib/pbClient';

const columns = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

type Task = {
  id: string;
  title: string;
  priority?: string;
  status: string;
  archived?: boolean;
  order?: number;
  dueAt?: string;
  subtasksTotal?: number;
  subtasksDone?: number;
  assigneeIds?: string[];
  labels?: string[];
  requiredNodeId?: string;
};

type Agent = {
  id: string;
  displayName?: string;
  openclawAgentId?: string;
};

type NodeRecord = {
  id: string;
  displayName?: string;
  nodeId?: string;
};

function TaskCard({
  task,
  onOpen,
  nodeLabel,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
  nodeLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm shadow-sm transition',
        isDragging ? 'opacity-60' : 'hover:-translate-y-0.5 hover:shadow-md'
      )}
    >
      <div className="flex items-stretch gap-3">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="Drag task"
          className="group relative h-full w-2 shrink-0 cursor-grab rounded-full border border-[var(--border)] bg-[var(--surface)]/60 opacity-50 transition hover:opacity-90 active:cursor-grabbing"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, rgba(15,23,42,0.25) 0, rgba(15,23,42,0.25) 2px, transparent 2px, transparent 5px)',
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        />
        <button type="button" onClick={() => onOpen(task.id)} className="flex-1 text-left">
          <div
            className="font-medium"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {task.title}
          </div>
          {(task.labels?.length || task.requiredNodeId) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
              {task.requiredNodeId && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">
                  run:{nodeLabel || task.requiredNodeId}
                </span>
              )}
              {(task.labels ?? []).slice(0, 2).map((label) => (
                <span key={label} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">
                  {label}
                </span>
              ))}
              {(task.labels?.length ?? 0) > 2 && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">
                  +{(task.labels?.length ?? 0) - 2}
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{task.priority ?? 'p2'}</Badge>
            {task.subtasksTotal ? (
              <span>
                {task.subtasksDone ?? 0}/{task.subtasksTotal}
              </span>
            ) : null}
            {task.dueAt ? <span>due {formatShortDate(task.dueAt)}</span> : null}
            <span>{task.assigneeIds?.length ? `${task.assigneeIds.length} assignee(s)` : 'Unassigned'}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function TaskCardStatic({
  task,
  onOpen,
  nodeLabel,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
  nodeLabel?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm shadow-sm transition')}>
      <div className="flex items-stretch gap-3">
        <div
          aria-hidden="true"
          className="group relative h-full w-2 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 opacity-50"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, rgba(15,23,42,0.25) 0, rgba(15,23,42,0.25) 2px, transparent 2px, transparent 5px)',
          }}
        />
        <button type="button" onClick={() => onOpen(task.id)} className="flex-1 text-left">
          <div
            className="font-medium"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {task.title}
          </div>
          {(task.labels?.length || task.requiredNodeId) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
              {task.requiredNodeId && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">
                  run:{nodeLabel || task.requiredNodeId}
                </span>
              )}
              {(task.labels ?? []).slice(0, 2).map((label) => (
                <span key={label} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">
                  {label}
                </span>
              ))}
              {(task.labels?.length ?? 0) > 2 && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5">
                  +{(task.labels?.length ?? 0) - 2}
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{task.priority ?? 'p2'}</Badge>
            {task.subtasksTotal ? (
              <span>
                {task.subtasksDone ?? 0}/{task.subtasksTotal}
              </span>
            ) : null}
            {task.dueAt ? <span>due {formatShortDate(task.dueAt)}</span> : null}
            <span>{task.assigneeIds?.length ? `${task.assigneeIds.length} assignee(s)` : 'Unassigned'}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  onOpen,
  nodeLabelById,
}: {
  status: string;
  tasks: Task[];
  onOpen: (taskId: string) => void;
  nodeLabelById: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });

  return (
    <div className="flex w-[240px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] sm:w-[260px] lg:w-[300px]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-3 backdrop-blur">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">{titleCase(status)}</div>
        <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">{tasks.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn('space-y-3 p-3 transition', isOver ? 'bg-[color:var(--card)]/70' : '')}
        style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onOpen={onOpen}
              nodeLabel={task.requiredNodeId ? nodeLabelById.get(task.requiredNodeId) : undefined}
            />
          ))}
        </SortableContext>
        {!tasks.length && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-muted">Drop tasks here</div>}
      </div>
    </div>
  );
}

function ColumnStatic({
  status,
  tasks,
  onOpen,
  nodeLabelById,
}: {
  status: string;
  tasks: Task[];
  onOpen: (taskId: string) => void;
  nodeLabelById: Map<string, string>;
}) {
  return (
    <div className="flex w-[240px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] sm:w-[260px] lg:w-[300px]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-3 backdrop-blur">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">{titleCase(status)}</div>
        <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">{tasks.length}</Badge>
      </div>
      <div className={cn('space-y-3 p-3 transition')} style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
        {tasks.map((task) => (
          <TaskCardStatic
            key={task.id}
            task={task}
            onOpen={onOpen}
            nodeLabel={task.requiredNodeId ? nodeLabelById.get(task.requiredNodeId) : undefined}
          />
        ))}
        {!tasks.length && (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-muted">No tasks</div>
        )}
      </div>
    </div>
  );
}

export function TaskBoard({ initialTasks, agents, nodes }: { initialTasks: Task[]; agents: Agent[]; nodes: NodeRecord[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = React.useState<Task[]>(initialTasks);
  const [mounted, setMounted] = React.useState(false);
  // Optimistic open/close to avoid a jittery UX while the URL updates.
  // `undefined` => follow URL `?task=...`
  // `string`    => force open that task immediately
  // `null`      => force closed immediately
  const [overrideTaskId, setOverrideTaskId] = React.useState<string | null | undefined>(undefined);

  React.useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

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

  React.useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | null = setInterval(async () => {
      const res = await fetch('/api/tasks?page=1&perPage=200');
      if (!res.ok) return;
      const json = await res.json();
      setTasks(json.items ?? []);
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
      if (unsubscribe) {
        void unsubscribe().catch(() => {
          // Ignore realtime teardown errors on fast refresh/unmounted sessions.
        });
      }
    };
  }, []);

  const taskParam = searchParams.get('task');

  React.useEffect(() => {
    if (overrideTaskId === undefined) return;
    if (overrideTaskId === null && !taskParam) setOverrideTaskId(undefined);
    if (typeof overrideTaskId === 'string' && taskParam === overrideTaskId) setOverrideTaskId(undefined);
  }, [overrideTaskId, taskParam]);

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    const columnIds = new Set(columns.map((c) => c.id));
    let nextStatus = task.status;
    let insertBeforeTaskId: string | null = null;

    if (columnIds.has(overId)) {
      nextStatus = overId;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      nextStatus = overTask.status;
      insertBeforeTaskId = overTask.id;
    }

    const currentColumn = (grouped[nextStatus] ?? [])
      .filter((t) => t.id !== activeId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const insertIdx = insertBeforeTaskId ? currentColumn.findIndex((t) => t.id === insertBeforeTaskId) : currentColumn.length;
    const idx = insertIdx === -1 ? currentColumn.length : insertIdx;
    const prev = idx > 0 ? currentColumn[idx - 1] : null;
    const next = idx < currentColumn.length ? currentColumn[idx] : null;
    const prevOrder = prev?.order ?? 0;
    const nextOrder = next?.order ?? prevOrder + 1000;
    let nextOrderValue: number;
    if (!prev && !next) {
      const maxOrder = tasks.reduce((acc, t) => Math.max(acc, Number(t.order ?? 0)), 0);
      nextOrderValue = maxOrder + 1000;
    }
    else if (!prev) nextOrderValue = nextOrder - 1000;
    else if (!next) nextOrderValue = prevOrder + 1000;
    else nextOrderValue = (prevOrder + nextOrder) / 2;

    // Avoid a degenerate order that doesn't move the task.
    if (Number.isFinite(task.order) && task.order === nextOrderValue && task.status === nextStatus) return;

    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === activeId ? { ...t, status: nextStatus, order: nextOrderValue } : t))
    );
    const patch: Record<string, unknown> = { order: nextOrderValue };
    if (nextStatus !== task.status) patch.status = nextStatus;
    void updateTask(activeId, patch);
  }

  const grouped = columns.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col.id] = tasks
      .filter((task) => task.status === col.id && !task.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return acc;
  }, {});

  function openDrawer(taskId: string) {
    setOverrideTaskId(taskId);
    router.replace(`/tasks?task=${taskId}`, { scroll: false });
  }

  function closeDrawer() {
    setOverrideTaskId(null);
    router.replace('/tasks', { scroll: false });
  }

  const effectiveTaskId = overrideTaskId !== undefined ? overrideTaskId : taskParam;
  const drawerOpen = Boolean(effectiveTaskId);

  return (
    <div>
      <div className="mb-4 hidden flex-wrap gap-3 text-xs text-muted sm:flex">
        <span>Active agents: {agents.length}</span>
        <span>Drag tasks across columns to update status.</span>
      </div>
      {mounted ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="-mx-3 overflow-x-auto pb-4 sm:-mx-4">
            <div className="flex w-max gap-4 px-3 sm:px-4">
              {columns.map((col) => (
                <Column
                  key={col.id}
                  status={col.id}
                  tasks={grouped[col.id] ?? []}
                  onOpen={openDrawer}
                  nodeLabelById={nodeLabelById}
                />
              ))}
            </div>
          </div>
        </DndContext>
      ) : (
        <div className="-mx-3 overflow-x-auto pb-4 sm:-mx-4">
          <div className="flex w-max gap-4 px-3 sm:px-4">
            {columns.map((col) => (
              <ColumnStatic
                key={col.id}
                status={col.id}
                tasks={grouped[col.id] ?? []}
                onOpen={openDrawer}
                nodeLabelById={nodeLabelById}
              />
            ))}
          </div>
        </div>
      )}
      <TaskDrawer open={drawerOpen} taskId={effectiveTaskId} agents={agents} nodes={nodes} onClose={closeDrawer} />
    </div>
  );
}
