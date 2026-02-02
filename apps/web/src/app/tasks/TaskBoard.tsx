'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { cn, titleCase } from '@/lib/utils';
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

function TaskCard({ task, onOpen }: { task: Task; onOpen: (taskId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-2xl border border-[var(--border)] bg-white p-3 text-sm shadow-sm transition',
        isDragging ? 'opacity-60' : 'hover:-translate-y-0.5 hover:shadow-md'
      )}
    >
      <div className="flex items-stretch gap-3">
        <button
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
                  node:{task.requiredNodeId}
                </span>
              )}
              {(task.labels ?? []).slice(0, 2).map((label) => (
                <span key={label} className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">
                  {label}
                </span>
              ))}
              {(task.labels?.length ?? 0) > 2 && (
                <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5">
                  +{(task.labels?.length ?? 0) - 2}
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{task.priority ?? 'p2'}</Badge>
            <span>{task.assigneeIds?.length ? `${task.assigneeIds.length} assignee(s)` : 'Unassigned'}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function Column({ status, tasks, onOpen }: { status: string; tasks: Task[]; onOpen: (taskId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });

  return (
    <div className="flex w-[240px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] sm:w-[260px] lg:w-[300px]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-3 backdrop-blur">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">{titleCase(status)}</div>
        <Badge className="border-none bg-white text-[var(--foreground)]">{tasks.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn('space-y-3 p-3 transition', isOver ? 'bg-white/70' : '')}
        style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpen={onOpen} />
        ))}
        {!tasks.length && <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-muted">Drop tasks here</div>}
      </div>
    </div>
  );
}

export function TaskBoard({ initialTasks, agents, nodes }: { initialTasks: Task[]; agents: Agent[]; nodes: NodeRecord[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = React.useState<Task[]>(initialTasks);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerTaskId, setDrawerTaskId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

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
      if (unsubscribe) void unsubscribe();
    };
  }, []);

  const taskParam = searchParams.get('task');

  React.useEffect(() => {
    if (taskParam) {
      setDrawerTaskId(taskParam);
      setDrawerOpen(true);
    } else if (drawerOpen) {
      setDrawerOpen(false);
      setDrawerTaskId(null);
    }
  }, [taskParam, drawerOpen]);

  async function updateStatus(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const status = String(over.id);
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === status) return;
    setTasks((prev) => prev.map((t) => (t.id === active.id ? { ...t, status } : t)));
    void updateStatus(String(active.id), status);
  }

  const grouped = columns.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col.id] = tasks.filter((task) => task.status === col.id);
    return acc;
  }, {});

  function openDrawer(taskId: string) {
    setDrawerTaskId(taskId);
    setDrawerOpen(true);
    router.replace(`/tasks?task=${taskId}`, { scroll: false });
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerTaskId(null);
    router.replace('/tasks', { scroll: false });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">
        <span>Active agents: {agents.length}</span>
        <span>Drag tasks across columns to update status.</span>
      </div>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="-mx-4 overflow-x-auto pb-4">
          <div className="flex w-max gap-4 px-4">
            {columns.map((col) => (
              <Column key={col.id} status={col.id} tasks={grouped[col.id] ?? []} onOpen={openDrawer} />
            ))}
          </div>
        </div>
      </DndContext>
      <TaskDrawer open={drawerOpen} taskId={drawerTaskId} agents={agents} nodes={nodes} onClose={closeDrawer} />
    </div>
  );
}
